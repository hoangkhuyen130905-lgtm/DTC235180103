// Biến lưu trữ dữ liệu cục bộ
let booksList = [];
let readersList = [];

// Khởi tạo khi load trang
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadBooks();
    loadReaders();
    loadBorrows();

    // Tự động reload stats sau 10 giây
    setInterval(loadStats, 10000);
});

// Toast notification helper
function showToast(message, isError = false) {
    const toastEl = document.getElementById('liveToast');
    const toastMsg = document.getElementById('toastMessage');
    toastEl.className = `toast align-items-center text-white border-0 shadow ${isError ? 'bg-danger' : 'bg-success'}`;
    toastMsg.innerText = message;
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// 1. Tải số liệu thống kê KPI
async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error('Không thể lấy thống kê');
        const data = await res.json();
        document.getElementById('statTotalBooks').innerText = data.totalBooks ?? 0;
        document.getElementById('statTotalReaders').innerText = data.totalReaders ?? 0;
        document.getElementById('statActiveBorrows').innerText = data.activeBorrows ?? 0;
        document.getElementById('statOverdueBorrows').innerText = data.overdueBorrows ?? 0;
    } catch (err) {
        console.error('Lỗi tải stats:', err);
    }
}

// 2. Tải danh sách Sách
async function loadBooks() {
    const search = document.getElementById('searchBookInput').value.trim();
    const url = search ? `/api/books?search=${encodeURIComponent(search)}` : '/api/books';
    const tbody = document.getElementById('booksTableBody');

    try {
        const res = await fetch(url);
        booksList = await res.json();

        if (booksList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Không tìm thấy cuốn sách nào.</td></tr>';
            return;
        }

        tbody.innerHTML = booksList.map(book => `
            <tr>
                <td class="fw-bold text-muted">#${book.id}</td>
                <td>
                    <div class="fw-bold text-dark">${escapeHtml(book.title)}</div>
                </td>
                <td>${escapeHtml(book.author)}</td>
                <td><span class="badge bg-secondary-subtle text-secondary">${escapeHtml(book.category)}</span></td>
                <td><code>${escapeHtml(book.isbn || 'Chưa có')}</code></td>
                <td>${book.published_year || '-'}</td>
                <td>
                    <span class="badge ${book.available_copies > 0 ? 'bg-success' : 'bg-danger'}">
                        ${book.available_copies} / ${book.total_copies}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-danger" title="Xóa sách" onclick="deleteBook(${book.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
    }
}

// 3. Tải danh sách Độc giả
async function loadReaders() {
    const search = document.getElementById('searchReaderInput').value.trim();
    const url = search ? `/api/readers?search=${encodeURIComponent(search)}` : '/api/readers';
    const tbody = document.getElementById('readersTableBody');

    try {
        const res = await fetch(url);
        readersList = await res.json();

        if (readersList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Không có độc giả nào.</td></tr>';
            return;
        }

        tbody.innerHTML = readersList.map(r => `
            <tr>
                <td class="fw-bold text-muted">#${r.id}</td>
                <td><span class="badge bg-primary-subtle text-primary">${escapeHtml(r.reader_code)}</span></td>
                <td class="fw-bold">${escapeHtml(r.full_name)}</td>
                <td>${escapeHtml(r.class_name || '-')}</td>
                <td>${escapeHtml(r.email || '-')}</td>
                <td>${escapeHtml(r.phone || '-')}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-danger" title="Xóa độc giả" onclick="deleteReader(${r.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Lỗi tải độc giả: ${err.message}</td></tr>`;
    }
}

// 4. Tải danh sách Mượn / Trả
async function loadBorrows() {
    const tbody = document.getElementById('borrowsTableBody');
    try {
        const res = await fetch('/api/borrows');
        const borrows = await res.json();

        if (borrows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Chưa có lịch sử mượn trả nào.</td></tr>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        tbody.innerHTML = borrows.map(b => {
            const isReturned = b.status === 'RETURNED';
            const isOverdue = !isReturned && b.due_date < today;

            let badgeHtml = '<span class="badge bg-success">Đã trả</span>';
            if (!isReturned) {
                badgeHtml = isOverdue 
                    ? '<span class="badge bg-danger">Quá hạn</span>' 
                    : '<span class="badge bg-warning text-dark">Đang mượn</span>';
            }

            return `
                <tr>
                    <td class="fw-bold">#PM-${b.id}</td>
                    <td class="fw-semibold text-primary">${escapeHtml(b.book_title)}</td>
                    <td>
                        <div><strong>${escapeHtml(b.reader_name)}</strong></div>
                        <small class="text-muted">${escapeHtml(b.reader_code)} (${escapeHtml(b.class_name || 'N/A')})</small>
                    </td>
                    <td>${formatDate(b.borrow_date)}</td>
                    <td class="${isOverdue ? 'text-danger fw-bold' : ''}">${formatDate(b.due_date)}</td>
                    <td>${badgeHtml}</td>
                    <td class="small text-muted">${escapeHtml(b.notes || '-')}</td>
                    <td class="text-center">
                        ${!isReturned ? `
                            <button class="btn btn-sm btn-success" onclick="returnBook(${b.id})">
                                <i class="bi bi-check-circle me-1"></i> Trả Sách
                            </button>
                        ` : `
                            <span class="text-muted small"><i class="bi bi-calendar-check"></i> ${formatDate(b.return_date)}</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Lỗi tải dữ liệu mượn trả: ${err.message}</td></tr>`;
    }
}

// Thêm sách
async function handleAddBook(event) {
    event.preventDefault();
    const data = {
        title: document.getElementById('bookTitle').value.trim(),
        author: document.getElementById('bookAuthor').value.trim(),
        category: document.getElementById('bookCategory').value.trim(),
        isbn: document.getElementById('bookIsbn').value.trim(),
        total_copies: parseInt(document.getElementById('bookCopies').value, 10),
        published_year: parseInt(document.getElementById('bookYear').value, 10)
    };

    try {
        const res = await fetch('/api/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Lỗi thêm sách');

        showToast('Thêm sách thành công!');
        bootstrap.Modal.getInstance(document.getElementById('addBookModal')).hide();
        document.getElementById('addBookForm').reset();
        loadBooks();
        loadStats();
    } catch (err) {
        showToast(err.message, true);
    }
}

// Xóa sách
async function deleteBook(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa cuốn sách này?')) return;
    try {
        const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Lỗi xóa sách');
        showToast('Đã xóa sách thành công');
        loadBooks();
        loadStats();
    } catch (err) {
        showToast(err.message, true);
    }
}

// Thêm độc giả
async function handleAddReader(event) {
    event.preventDefault();
    const data = {
        reader_code: document.getElementById('readerCode').value.trim(),
        full_name: document.getElementById('readerFullName').value.trim(),
        class_name: document.getElementById('readerClass').value.trim(),
        email: document.getElementById('readerEmail').value.trim(),
        phone: document.getElementById('readerPhone').value.trim()
    };

    try {
        const res = await fetch('/api/readers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Lỗi thêm độc giả');

        showToast('Thêm độc giả thành công!');
        bootstrap.Modal.getInstance(document.getElementById('addReaderModal')).hide();
        document.getElementById('addReaderForm').reset();
        loadReaders();
        loadStats();
    } catch (err) {
        showToast(err.message, true);
    }
}

// Xóa độc giả
async function deleteReader(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa độc giả này?')) return;
    try {
        const res = await fetch(`/api/readers/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Lỗi xóa độc giả');
        showToast('Đã xóa độc giả thành công');
        loadReaders();
        loadStats();
    } catch (err) {
        showToast(err.message, true);
    }
}

// Chuẩn bị modal mượn sách
function prepareBorrowModal() {
    const bookSelect = document.getElementById('borrowBookSelect');
    const readerSelect = document.getElementById('borrowReaderSelect');

    bookSelect.innerHTML = '<option value="">-- Chọn một cuốn sách --</option>' +
        booksList.map(b => `<option value="${b.id}" ${b.available_copies <= 0 ? 'disabled' : ''}>
            ${escapeHtml(b.title)} (${b.available_copies > 0 ? `Còn ${b.available_copies} cuốn` : 'Hết sách'})
        </option>`).join('');

    readerSelect.innerHTML = '<option value="">-- Chọn độc giả mượn --</option>' +
        readersList.map(r => `<option value="${r.id}">
            ${escapeHtml(r.reader_code)} - ${escapeHtml(r.full_name)} (${escapeHtml(r.class_name || 'N/A')})
        </option>`).join('');

    // Mặc định hạn trả là 14 ngày sau hôm nay
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 14);
    document.getElementById('borrowDueDate').value = defaultDueDate.toISOString().split('T')[0];
}

// Lập phiếu mượn
async function handleCreateBorrow(event) {
    event.preventDefault();
    const data = {
        book_id: parseInt(document.getElementById('borrowBookSelect').value, 10),
        reader_id: parseInt(document.getElementById('borrowReaderSelect').value, 10),
        due_date: document.getElementById('borrowDueDate').value,
        notes: document.getElementById('borrowNotes').value.trim()
    };

    try {
        const res = await fetch('/api/borrows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Lỗi lập phiếu mượn');

        showToast('Lập phiếu mượn sách thành công!');
        bootstrap.Modal.getInstance(document.getElementById('borrowModal')).hide();
        document.getElementById('borrowForm').reset();
        loadBorrows();
        loadBooks();
        loadStats();
    } catch (err) {
        showToast(err.message, true);
    }
}

// Trả sách
async function returnBook(borrowId) {
    if (!confirm('Xác nhận độc giả đã trả cuốn sách này?')) return;
    try {
        const res = await fetch(`/api/borrows/${borrowId}/return`, { method: 'POST' });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Lỗi khi trả sách');

        showToast('Đã xác nhận trả sách thành công');
        loadBorrows();
        loadBooks();
        loadStats();
    } catch (err) {
        showToast(err.message, true);
    }
}

// Utilities
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN');
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

