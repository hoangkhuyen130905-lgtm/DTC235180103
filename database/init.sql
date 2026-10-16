-- ==========================================================
-- Hệ thống Quản lý Thư viện - Cơ sở dữ liệu PostgreSQL
-- Khởi tạo bảng và nạp dữ liệu mẫu
-- ==========================================================

-- Bảng Sách (Books)
CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    isbn VARCHAR(50) UNIQUE,
    total_copies INT NOT NULL DEFAULT 1,
    available_copies INT NOT NULL DEFAULT 1,
    published_year INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Độc giả (Readers)
CREATE TABLE IF NOT EXISTS readers (
    id SERIAL PRIMARY KEY,
    reader_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    class_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Phiếu Mượn / Trả Sách (Borrows)
CREATE TABLE IF NOT EXISTS borrows (
    id SERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    reader_id INT NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
    borrow_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    return_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'BORROWED', -- 'BORROWED' hoặc 'RETURNED'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tạo chỉ mục (Indexes) để tối ưu hóa truy vấn
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_readers_code ON readers(reader_code);
CREATE INDEX IF NOT EXISTS idx_borrows_status ON borrows(status);
CREATE INDEX IF NOT EXISTS idx_borrows_due_date ON borrows(due_date);

-- Nạp dữ liệu mẫu cho Bảng Sách
INSERT INTO books (title, author, category, isbn, total_copies, available_copies, published_year) VALUES
('Nhập môn Trí tuệ Nhân tạo', 'Stuart Russell & Peter Norvig', 'Công nghệ thông tin', '978-0136042594', 10, 8, 2021),
('Lập trình Hướng đối tượng với Java', 'Herbert Schildt', 'Công nghệ thông tin', '978-1260440232', 8, 7, 2020),
('Triển khai và Quản trị Hệ thống DevOps', 'Gene Kim, Patrick Debois', 'Công nghệ thông tin', '978-1942788003', 6, 4, 2022),
('Thiết kế Hệ thống Phân tán (Distributed Systems)', 'Martin Kleppmann', 'Công nghệ thông tin', '978-1449373320', 5, 4, 2017),
('Kiến trúc Vi dịch vụ (Microservices Architecture)', 'Sam Newman', 'Công nghệ thông tin', '978-1492043454', 7, 6, 2021),
('An toàn Mạng và Bảo mật Hệ thống', 'William Stallings', 'An toàn thông tin', '978-0134444284', 6, 5, 2019),
('Cơ sở Dữ liệu Quan hệ & NoSQL', 'Abraham Silberschatz', 'Cơ sở dữ liệu', '978-0078022159', 12, 10, 2020),
('Kỹ nghệ Phần mềm Chuyên nghiệp', 'Ian Sommerville', 'Kỹ nghệ phần mềm', '978-0133943030', 9, 8, 2019),
('Docker và Kubernetes Thực chiến', 'Nigel Poulton', 'Công nghệ thông tin', '978-1916585002', 8, 7, 2023),
('Linux Quản trị Hệ thống Toàn tập', 'Evi Nemeth', 'Hệ điều hành', '978-0134277554', 5, 5, 2021)
ON CONFLICT (isbn) DO NOTHING;

-- Nạp dữ liệu mẫu cho Bảng Độc giả
INSERT INTO readers (reader_code, full_name, email, phone, class_name) VALUES
('SV230001', 'Hoàng Văn Khuyên', 'hvkhuyen@ictu.vn', '0987654321', 'K23-HTPM01'),
('SV230002', 'Nguyễn Thị Mai', 'ntmai@ictu.vn', '0912345678', 'K23-HTPM01'),
('SV230003', 'Trần Văn Nam', 'tvnam@ictu.vn', '0923456789', 'K23-CNTT02'),
('SV230004', 'Lê Thu Trang', 'lttrang@ictu.vn', '0934567890', 'K23-KTPM01'),
('SV230005', 'Phạm Minh Tuấn', 'pmtuan@ictu.vn', '0945678901', 'K23-ATTT01')
ON CONFLICT (reader_code) DO NOTHING;

-- Nạp dữ liệu mẫu cho Bảng Phiếu Mượn / Trả
INSERT INTO borrows (book_id, reader_id, borrow_date, due_date, return_date, status, notes) VALUES
(1, 1, CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE + INTERVAL '4 days', NULL, 'BORROWED', 'Mượn phục vụ đồ án môn học'),
(3, 1, CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '5 days', NULL, 'BORROWED', 'Nghiên cứu Docker & Grafana'),
(2, 2, CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '9 days', NULL, 'BORROWED', 'Học Java Core'),
(3, 3, CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE - INTERVAL '2 days', NULL, 'BORROWED', 'Quá hạn trả 2 ngày'),
(4, 4, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '12 days', 'RETURNED', 'Đã trả sách nguyên vẹn'),
(5, 5, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE + INTERVAL '7 days', NULL, 'BORROWED', 'Đang đọc chương 4');
