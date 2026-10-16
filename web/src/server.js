const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { Pool } = require('pg');
const client = require('prom-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// 1. Cấu hình Prometheus Metrics
// ==========================================================
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'library_node_' });

// Custom Metrics
const httpRequestDurationMicroseconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Thời gian phản hồi của request HTTP (giây)',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 1.5, 2, 5]
});

const totalHttpRequests = new client.Counter({
    name: 'http_requests_total',
    help: 'Tổng số lượng request HTTP đã nhận',
    labelNames: ['method', 'route', 'status_code']
});

const totalBooksGauge = new client.Gauge({
    name: 'library_books_total',
    help: 'Tổng số lượng sách trong thư viện'
});

const totalActiveBorrowsGauge = new client.Gauge({
    name: 'library_active_borrows_total',
    help: 'Tổng số sách hiện đang được mượn'
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(totalHttpRequests);
register.registerMetric(totalBooksGauge);
register.registerMetric(totalActiveBorrowsGauge);

// ==========================================================
// 2. Middlewares
// ==========================================================
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: false // Để tương thích với inline scripts trong frontend dashboard
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Định dạng log JSON cho Morgan để Promtail / Loki dễ dàng phân tích
morgan.token('body', (req) => JSON.stringify(req.body));
app.use(morgan((tokens, req, res) => {
    return JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'library-web',
        method: tokens.method(req, res),
        url: tokens.url(req, res),
        status: parseInt(tokens.status(req, res) || '0', 10),
        responseTime_ms: parseFloat(tokens['response-time'](req, res) || '0'),
        client_ip: tokens['remote-addr'](req, res)
    });
}));

// Middleware đo lường Prometheus metrics cho mỗi request
app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const durationSeconds = diff[0] + diff[1] / 1e9;
        const route = req.route ? req.route.path : req.path;
        const statusCode = res.statusCode;

        httpRequestDurationMicroseconds.labels(req.method, route, statusCode).observe(durationSeconds);
        totalHttpRequests.labels(req.method, route, statusCode).inc();
    });
    next();
});

// Phục vụ frontend tĩnh
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================================
// 3. Kết nối Cơ sở dữ liệu PostgreSQL
// ==========================================================
const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'library_admin',
    password: process.env.DB_PASSWORD || 'Secr3t_L1brary_P@ss2026',
    database: process.env.DB_NAME || 'library_db',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Lỗi ngoài ý muốn trong PostgreSQL pool',
        error: err.message
    }));
});

// Hàm cập nhật metrics từ database
async function updateDatabaseMetrics() {
    try {
        const booksRes = await pool.query('SELECT COUNT(*) FROM books');
        const borrowsRes = await pool.query("SELECT COUNT(*) FROM borrows WHERE status = 'BORROWED'");
        totalBooksGauge.set(parseInt(booksRes.rows[0].count, 10));
        totalActiveBorrowsGauge.set(parseInt(borrowsRes.rows[0].count, 10));
    } catch (err) {
        // Có thể DB chưa khởi động xong
    }
}
setInterval(updateDatabaseMetrics, 15000);

// ==========================================================
// 4. API Endpoints
// ==========================================================

// Endpoint Prometheus Scrape
app.get('/metrics', async (req, res) => {
    try {
        await updateDatabaseMetrics();
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (ex) {
        res.status(500).end(ex);
    }
});

// Health check endpoint
app.get('/healthz', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'UP', database: 'CONNECTED', timestamp: new Date() });
    } catch (err) {
        res.status(503).json({ status: 'DOWN', database: 'DISCONNECTED', error: err.message });
    }
});

// Thống kê tổng quan cho Dashboard
app.get('/api/stats', async (req, res) => {
    try {
        const totalBooks = await pool.query('SELECT COUNT(*) FROM books');
        const totalReaders = await pool.query('SELECT COUNT(*) FROM readers');
        const activeBorrows = await pool.query("SELECT COUNT(*) FROM borrows WHERE status = 'BORROWED'");
        const overdueBorrows = await pool.query("SELECT COUNT(*) FROM borrows WHERE status = 'BORROWED' AND due_date < CURRENT_DATE");

        res.json({
            totalBooks: parseInt(totalBooks.rows[0].count, 10),
            totalReaders: parseInt(totalReaders.rows[0].count, 10),
            activeBorrows: parseInt(activeBorrows.rows[0].count, 10),
            overdueBorrows: parseInt(overdueBorrows.rows[0].count, 10)
        });
    } catch (err) {
        res.status(500).json({ error: 'Không thể lấy thống kê', details: err.message });
    }
});

// --- QUẢN LÝ SÁCH (BOOKS) ---
app.get('/api/books', async (req, res) => {
    const { search } = req.query;
    try {
        let query = 'SELECT * FROM books';
        const params = [];
        if (search) {
            query += ' WHERE title ILIKE $1 OR author ILIKE $1 OR category ILIKE $1 OR isbn ILIKE $1';
            params.push(`%${search}%`);
        }
        query += ' ORDER BY id DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi truy vấn danh sách sách', details: err.message });
    }
});

app.post('/api/books', async (req, res) => {
    const { title, author, category, isbn, total_copies, published_year } = req.body;
    if (!title || !author || !category) {
        return res.status(400).json({ error: 'Tiêu đề, tác giả và danh mục không được để trống' });
    }
    const copies = parseInt(total_copies || '1', 10);
    try {
        const result = await pool.query(
            `INSERT INTO books (title, author, category, isbn, total_copies, available_copies, published_year)
             VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING *`,
            [title, author, category, isbn || null, copies, published_year || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi thêm sách mới', details: err.message });
    }
});

app.put('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    const { title, author, category, isbn, total_copies, published_year } = req.body;
    try {
        const result = await pool.query(
            `UPDATE books
             SET title = $1, author = $2, category = $3, isbn = $4, total_copies = $5, published_year = $6
             WHERE id = $7 RETURNING *`,
            [title, author, category, isbn, total_copies, published_year, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Không tìm thấy sách' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi cập nhật sách', details: err.message });
    }
});

app.delete('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING *', [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Không tìm thấy sách' });
        res.json({ message: 'Đã xóa sách thành công', book: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi xóa sách', details: err.message });
    }
});

// --- QUẢN LÝ ĐỘC GIẢ (READERS) ---
app.get('/api/readers', async (req, res) => {
    const { search } = req.query;
    try {
        let query = 'SELECT * FROM readers';
        const params = [];
        if (search) {
            query += ' WHERE reader_code ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1 OR class_name ILIKE $1';
            params.push(`%${search}%`);
        }
        query += ' ORDER BY id DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi lấy danh sách độc giả', details: err.message });
    }
});

app.post('/api/readers', async (req, res) => {
    const { reader_code, full_name, email, phone, class_name } = req.body;
    if (!reader_code || !full_name) {
        return res.status(400).json({ error: 'Mã độc giả và họ tên không được để trống' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO readers (reader_code, full_name, email, phone, class_name)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [reader_code, full_name, email || null, phone || null, class_name || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Mã độc giả đã tồn tại' });
        }
        res.status(500).json({ error: 'Lỗi khi tạo độc giả', details: err.message });
    }
});

app.delete('/api/readers/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM readers WHERE id = $1 RETURNING *', [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Không tìm thấy độc giả' });
        res.json({ message: 'Đã xóa độc giả', reader: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi xóa độc giả', details: err.message });
    }
});

// --- QUẢN LÝ MƯỢN / TRẢ SÁCH (BORROWS) ---
app.get('/api/borrows', async (req, res) => {
    try {
        const query = `
            SELECT b.id, b.borrow_date, b.due_date, b.return_date, b.status, b.notes,
                   bk.id AS book_id, bk.title AS book_title, bk.author AS book_author,
                   r.id AS reader_id, r.reader_code, r.full_name AS reader_name, r.class_name
            FROM borrows b
            JOIN books bk ON b.book_id = bk.id
            JOIN readers r ON b.reader_id = r.id
            ORDER BY b.id DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi lấy danh sách mượn trả', details: err.message });
    }
});

app.post('/api/borrows', async (req, res) => {
    const { book_id, reader_id, due_date, notes } = req.body;
    if (!book_id || !reader_id || !due_date) {
        return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ sách, độc giả và hạn trả' });
    }

    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');

        // Kiểm tra số lượng sách còn khả dụng
        const bookCheck = await clientDB.query('SELECT available_copies, title FROM books WHERE id = $1 FOR UPDATE', [book_id]);
        if (bookCheck.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy sách' });
        }
        if (bookCheck.rows[0].available_copies <= 0) {
            await clientDB.query('ROLLBACK');
            return res.status(400).json({ error: `Sách "${bookCheck.rows[0].title}" hiện đã hết bản mượn khả dụng` });
        }

        // Tạo bản ghi mượn
        const borrowResult = await clientDB.query(
            `INSERT INTO borrows (book_id, reader_id, due_date, notes)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [book_id, reader_id, due_date, notes || null]
        );

        // Giảm số lượng sách khả dụng đi 1
        await clientDB.query('UPDATE books SET available_copies = available_copies - 1 WHERE id = $1', [book_id]);

        await clientDB.query('COMMIT');
        res.status(201).json(borrowResult.rows[0]);
    } catch (err) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ error: 'Lỗi khi lập phiếu mượn', details: err.message });
    } finally {
        clientDB.release();
    }
});

app.post('/api/borrows/:id/return', async (req, res) => {
    const { id } = req.params;
    const clientDB = await pool.connect();
    try {
        await clientDB.query('BEGIN');

        const borrowCheck = await clientDB.query('SELECT * FROM borrows WHERE id = $1 FOR UPDATE', [id]);
        if (borrowCheck.rowCount === 0) {
            await clientDB.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy phiếu mượn' });
        }
        if (borrowCheck.rows[0].status === 'RETURNED') {
            await clientDB.query('ROLLBACK');
            return res.status(400).json({ error: 'Sách này đã được trả trước đó' });
        }

        const bookId = borrowCheck.rows[0].book_id;

        // Cập nhật trạng thái phiếu mượn
        const updatedBorrow = await clientDB.query(
            `UPDATE borrows
             SET status = 'RETURNED', return_date = CURRENT_DATE
             WHERE id = $1 RETURNING *`,
            [id]
        );

        // Tăng số lượng sách khả dụng lên 1
        await clientDB.query('UPDATE books SET available_copies = available_copies + 1 WHERE id = $1', [bookId]);

        await clientDB.query('COMMIT');
        res.json({ message: 'Trả sách thành công', borrow: updatedBorrow.rows[0] });
    } catch (err) {
        await clientDB.query('ROLLBACK');
        res.status(500).json({ error: 'Lỗi khi cập nhật trả sách', details: err.message });
    } finally {
        clientDB.release();
    }
});

// Fallback route cho SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==========================================================
// 5. Khởi động Web Server
// ==========================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Hệ thống Quản lý Thư viện đang chạy tại cổng ${PORT}`,
        healthCheck: `http://0.0.0.0:${PORT}/healthz`,
        metrics: `http://0.0.0.0:${PORT}/metrics`
    }));
});

