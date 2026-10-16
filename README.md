# 📚 ĐỀ TÀI 1: HỆ THỐNG QUẢN LÝ THƯ VIỆN (LIBRARY MANAGEMENT SYSTEM)
> **Môn học:** Triển khai và Quản trị Hệ thống Phần mềm  
> **Sinh viên thực hiện:** Hoàng Văn Khuyên  
> **Mã sinh viên:** DTC235180103  
> **Khóa:** K23 - Khoa Công nghệ Thông tin - Đại học Công nghệ Thông tin & Truyền thông (ICTU)  

---

## 📑 MỤC LỤC
1. [Giới Thiệu Tổng Quan](#1-giới-thiệu-tổng-quan)
2. [Kiến Trúc Hệ Thống & Sơ Đồ Triển Khai](#2-kiến-trúc-hệ-thống--sơ-đồ-triển-khai)
3. [Danh Mục Các Dịch Vụ & Cổng Truy Cập](#3-danh-mục-các-dịch-vụ--cổng-truy-cập)
4. [Hướng Dẫn Cài Đặt & Khởi Chạy](#4-hướng-dẫn-cài-đặt--khởi-chạy)
5. [Hướng Dẫn Sử Dụng & Kiểm Thử](#5-hướng-dẫn-sử-dụng--kiểm-thử)
   - [5.1. Ứng dụng Web Quản lý Thư viện](#51-ứng-dụng-web-quản-lý-thư-viện)
   - [5.2. Quản trị Cơ sở dữ liệu với pgAdmin](#52-quản-trị-cơ-sở-dữ-liệu-với-pgadmin)
   - [5.3. Giám sát Hệ thống với Prometheus & Grafana](#53-giám-sát-hệ-thống-với-prometheus--grafana)
   - [5.4. Hệ thống Log tập trung Loki & Truy vấn LogQL](#54-hệ-thống-log-tập-trung-loki--truy-vấn-logql)
6. [Các Biện Pháp Bảo Mật (Hardening) Áp Dụng](#6-các-biện-pháp-bảo-mật-hardening-áp-dụng)
7. [Lịch Sử Commit Chuẩn Theo Yêu Cầu](#7-lịch-sử-commit-chuẩn-theo-yêu-cầu)

---

## 1. GIỚI THIỆU TỔNG QUAN
Dự án được xây dựng nhằm đáp ứng toàn bộ các yêu cầu của **Đề tài 1** trong học phần **Triển khai và Quản trị Hệ thống Phần mềm**. Hệ thống bao gồm:
- **Ứng dụng Web Thư viện:** Phát triển bằng Node.js / Express, giao diện Bootstrap trực quan hỗ trợ đầy đủ các nghiệp vụ quản lý sách, độc giả và mượn/trả sách.
- **Cơ sở dữ liệu:** PostgreSQL 16 lưu trữ dữ liệu an toàn, nạp sẵn script khởi tạo (`init.sql`).
- **Quản trị CSDL:** pgAdmin 4 cho phép theo dõi và thao tác trực quan với PostgreSQL.
- **Reverse Proxy & SSL:** Nginx làm cổng vào duy nhất, tự động chuyển hướng HTTP sang HTTPS tự ký, cấu hình đầy đủ Security Headers.
- **Giám sát (Monitoring):** Prometheus thu thập số liệu từ Container (cAdvisor), Ứng dụng Web (`/metrics`), Nginx Exporter và PostgreSQL Exporter; Grafana trực quan hóa bằng Dashboard tự động nạp sẵn.
- **Quản lý Log tập trung:** Loki lưu trữ log và Promtail thu thập log thời gian thực từ Nginx và Web App, hỗ trợ truy vấn nhanh qua LogQL.

---

## 2. KIẾN TRÚC HỆ THỐNG & SƠ ĐỒ TRIỂN KHAI

Toàn bộ 11 dịch vụ được điều phối thống nhất thông qua file `docker-compose.yml`:

```mermaid
flowchart TD
    Client(["🌐 Người dùng / Quản trị viên"]) -->|HTTP Port 80| NginxRedirect["Nginx (Port 80)"]
    NginxRedirect -->|301 Redirect HTTPS| NginxSSL["Nginx Reverse Proxy (Port 443 HTTPS)"]
    Client -->|HTTPS Port 443| NginxSSL

    subgraph frontend_net ["Mạng Frontend (library_frontend_net)"]
        NginxSSL -->|proxy_pass| WebApp["Web App Thư viện (Node.js :3000)"]
        NginxSSL -->|proxy_pass /pgadmin| PgAdminApp["pgAdmin 4 (:80 / :5050)"]
        Grafana["Grafana Dashboard (:3001)"]
        Prometheus["Prometheus Server (:9090)"]
        Loki["Loki Log Server (:3100)"]
        Promtail["Promtail Log Collector"]
        cAdvisor["cAdvisor Container Exporter (:8080)"]
        NginxExp["Nginx Prometheus Exporter (:9113)"]
    end

    subgraph backend_net ["Mạng Backend Nội Bộ (library_backend_net)"]
        WebApp -->|Kết nối SQL :5432| PostgresDB[("PostgreSQL 16 Database")]
        PgAdminApp -->|Quản trị DB :5432| PostgresDB
        PgExp["PostgreSQL Exporter (:9187)"] -->|Scrape DB Metrics| PostgresDB
    end

    %% Scrape connections
    Prometheus -->|Scrape| WebApp
    Prometheus -->|Scrape| cAdvisor
    Prometheus -->|Scrape| NginxExp
    Prometheus -->|Scrape| PgExp

    %% Log ingestion
    NginxSSL -.->|Access/Error Logs| Promtail
    WebApp -.->|Application Logs| Promtail
    Promtail -.->|Push Logs| Loki

    %% Visualization
    Grafana -->|Query Metrics| Prometheus
    Grafana -->|Query Logs (LogQL)| Loki
```

---

## 3. DANH MỤC CÁC DỊCH VỤ & CỔNG TRUY CẬP

| Dịch vụ | Địa chỉ truy cập | Tài khoản / Mật khẩu | Chức năng chính |
| :--- | :--- | :--- | :--- |
| **Website Thư viện (HTTPS)** | `https://localhost` | *Không yêu cầu* | Giao diện quản lý sách, độc giả, mượn trả |
| **Website Thư viện (HTTP)** | `http://localhost` | Tự động chuyển hướng sang HTTPS | Cổng HTTP thông thường |
| **pgAdmin 4 (Quản trị DB)** | `http://localhost:5050` hoặc `https://localhost/pgadmin/` | Email: `admin@library.ictu.vn`<br>Mật khẩu: `Secr3t_PgAdmin_2026` | Quản trị CSDL PostgreSQL trực quan |
| **Grafana Dashboard** | `http://localhost:3001` | Tài khoản: `admin`<br>Mật khẩu: `Secr3t_Grafana_2026` | Giám sát Container, Web traffic, DB & Logs |
| **Prometheus Server** | `http://localhost:9090` | *Không yêu cầu* | Máy chủ thu thập và lưu trữ metrics |
| **Loki Log Server** | `http://localhost:3100` | *Không yêu cầu* | Máy chủ lưu trữ và truy vấn log tập trung |
| **Web Metrics Endpoint** | `https://localhost/metrics` | *Không yêu cầu* | Endpoint Prometheus metrics của Node.js App |
| **PostgreSQL 16** | *Không mở cổng ra host (Nội bộ)* | User: `library_admin`<br>Pass: `Secr3t_L1brary_P@ss2026`<br>DB: `library_db` | Cơ sở dữ liệu quan hệ chính |

---

## 4. HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY

### 4.1. Yêu cầu môi trường
- Máy tính đã cài đặt **Docker** và **Docker Compose**.
- Đã cài đặt **Git**.

### 4.2. Khởi chạy toàn bộ hệ thống
Chỉ với **01 câu lệnh duy nhất**, toàn bộ 11 container sẽ được tải và khởi chạy hoàn chỉnh:

```bash
# Khởi động toàn bộ các dịch vụ ở chế độ chạy ngầm (background)
docker compose up -d --build
```

Kiểm tra trạng thái các container đang chạy:
```bash
docker compose ps
```
*Tất cả các dịch vụ đều phải ở trạng thái `running` (hoặc `healthy` đối với database).*

### 4.3. Dừng và khởi động lại
```bash
# Dừng hệ thống
docker compose down

# Dừng và xóa toàn bộ dữ liệu (nếu muốn làm mới từ đầu)
docker compose down -v
```

---

## 5. HƯỚNG DẪN SỬ DỤNG & KIỂM THỬ

### 5.1. Ứng dụng Web Quản lý Thư viện
1. Mở trình duyệt và truy cập: `https://localhost`
   *(Do sử dụng chứng chỉ SSL tự ký, trình duyệt sẽ cảnh báo bảo mật. Hãy nhấn "Nâng cao" (Advanced) $\rightarrow$ "Tiếp tục truy cập localhost (không an toàn)").*
2. **Kiểm tra các chức năng:**
   - **Kho Sách:** Xem danh sách sách, tìm kiếm sách theo tên/tác giả, nhấn **"Thêm Sách Mới"** để tạo một đầu sách mới, hoặc xóa sách.
   - **Độc Giả:** Xem danh sách độc giả sinh viên, thêm độc giả mới (nhập mã SV, họ tên, lớp, email, số điện thoại).
   - **Mượn / Trả Sách:** Nhấn **"Lập Phiếu Mượn Sách"**, chọn đầu sách và sinh viên, chọn hạn trả. Hệ thống sẽ tự động trừ số lượng sách khả dụng. Nhấn nút **"Trả Sách"** để ghi nhận ngày trả và hoàn lại số lượng khả dụng.
   - **Dashboard Stats:** Quan sát 4 thẻ KPI cập nhật tự động (Tổng sách, Độc giả, Đang mượn, Quá hạn).

### 5.2. Quản trị Cơ sở dữ liệu với pgAdmin
1. Mở trình duyệt truy cập: `http://localhost:5050`
2. Đăng nhập với:
   - Email: `admin@library.ictu.vn`
   - Mật khẩu: `Secr3t_PgAdmin_2026`
3. **Thêm kết nối đến PostgreSQL Container:**
   - Chuột phải vào **Servers** $\rightarrow$ chọn **Register** $\rightarrow$ **Server...**
   - Tab **General**: Đặt tên gợi nhớ (VD: `Library PostgreSQL`).
   - Tab **Connection**:
     - Host name/address: `postgres` *(tên hostname của container trong mạng Docker nội bộ)*
     - Port: `5432`
     - Maintenance database: `library_db`
     - Username: `library_admin`
     - Password: `Secr3t_L1brary_P@ss2026`
   - Nhấn **Save**. Bạn sẽ thấy các bảng `books`, `readers`, `borrows` cùng toàn bộ dữ liệu mẫu.

### 5.3. Giám sát Hệ thống với Prometheus & Grafana
1. **Kiểm tra Prometheus Targets:**
   - Truy cập `http://localhost:9090/targets`
   - Kiểm tra thấy cả 5 targets (`library-web`, `cadvisor`, `postgres`, `nginx`, `prometheus`) đều hiển thị trạng thái xanh **UP**.
2. **Kiểm tra Grafana Dashboard:**
   - Truy cập `http://localhost:3001` (Tài khoản: `admin` / `Secr3t_Grafana_2026`).
   - Dashboard **"Hệ Thống Quản Lý Thư Viện - Giám Sát Toàn Diện"** đã được tự động nạp (Provisioning) sẵn sàng tại thư mục `Library Dashboard`.
   - Các biểu đồ trực quan gồm:
     - 📈 Thống kê nghiệp vụ: Số sách, số lượt mượn.
     - 🌐 HTTP Traffic: Số lượng request/giây, phân bổ mã HTTP (200, 404, 500).
     - ⏱️ Độ trễ phản hồi (P95, P50 HTTP Latency).
     - 🐳 Mức tiêu thụ CPU & RAM của từng container theo thời gian thực (từ cAdvisor).
     - 🔌 Số lượng kết nối PostgreSQL đang hoạt động.

### 5.4. Hệ thống Log tập trung Loki & Truy vấn LogQL
1. Trong giao diện Grafana, truy cập menu bên trái $\rightarrow$ chọn **Explore** $\rightarrow$ chọn Datasource là **Loki**.
2. Thực hiện **các câu lệnh LogQL mẫu** (đã chuẩn bị sẵn theo tiêu chí đánh giá):

#### Query 1: Lọc toàn bộ Access Log và Error Log từ Nginx Reverse Proxy
```logql
{job="nginx"}
```

#### Query 2: Phát hiện các request bị lỗi HTTP (mã 4xx hoặc 5xx)
```logql
{job="nginx"} |~ "HTTP/[0-9.]+ (4|5)[0-9]{2}"
```

#### Query 3: Lọc log thao tác liên quan đến nghiệp vụ mượn trả sách
```logql
{job="library-web"} |= "borrow"
```

#### Query 4: Phân tích tốc độ ghi log của hệ thống theo thời gian
```logql
rate({job="nginx"}[1m])
```

---

## 6. CÁC BIỆN PHÁP BẢO MẬT (HARDENING) ÁP DỤNG
Dự án áp dụng đầy đủ các chuẩn mực bảo mật container và hệ thống:
1. **Non-Root Container:**
   - Container ứng dụng Node.js được cấu hình chạy dưới quyền người dùng thông thường (`USER node` - UID 1000) trong `Dockerfile`, ngăn ngừa nguy cơ leo thang đặc quyền (Privilege Escalation) nếu ứng dụng bị xâm nhập.
2. **Network Isolation (Phân vùng mạng):**
   - Hệ thống chia làm 2 phân vùng mạng độc lập:
     - `frontend_net`: Dành cho các dịch vụ tiếp xúc với người dùng (Nginx, Grafana, Prometheus).
     - `backend_net`: Dành riêng cho liên lạc nội bộ (Web App, PostgreSQL, pgAdmin, Postgres Exporter).
   - **PostgreSQL không hề mở cổng ra ngoài máy chủ Host** (không cấu hình `ports: 5432:5432`), triệt tiêu hoàn toàn nguy cơ quét cổng hoặc tấn công dò mật khẩu trực tiếp từ bên ngoài Internet.
3. **Quản lý bí mật & Mật khẩu mạnh:**
   - Tất cả thông tin mật khẩu DB, pgAdmin, Grafana được quản lý qua biến môi trường (`.env`), không hardcode trong mã nguồn, có mật khẩu phức tạp gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
4. **Nginx Hardening & Security Headers:**
   - Toàn bộ kết nối HTTP được bắt buộc chuyển hướng sang HTTPS qua mã trạng thái `301 Moved Permanently`.
   - Vô hiệu hóa thông tin phiên bản web server bằng `server_tokens off;`.
   - Bổ sung đầy đủ các HTTP Security Headers chuẩn:
     - `X-Frame-Options: SAMEORIGIN` (Chống Clickjacking).
     - `X-Content-Type-Options: nosniff` (Chống MIME-type sniffing).
     - `X-XSS-Protection: "1; mode=block"` (Chống reflected XSS).
     - `Strict-Transport-Security (HSTS)` (Bắt buộc dùng kết nối an toàn).
     - `Referrer-Policy: strict-origin-when-cross-origin`.
5. **Giới hạn tài nguyên phần cứng (Resource Limits):**
   - Cấu hình trần `cpus` và `memory` cụ thể cho từng container trong file `docker-compose.yml`, giúp ngăn chặn tấn công từ chối dịch vụ (DoS) làm cạn kiệt tài nguyên của máy chủ vật lý.

---

## 7. LỊCH SỬ COMMIT CHUẨN THEO YÊU CẦU

Repository được quản lý với 3 commit phân chia rành mạch theo đúng tiến trình của đề bài:

- **Commit 1:** `feat: deploy library web app, postgresql, pgadmin and nginx reverse proxy with ssl`
  - Khởi tạo mã nguồn ứng dụng Web Quản lý Thư viện (Node.js).
  - Khởi tạo schema và dữ liệu mẫu PostgreSQL (`init.sql`).
  - Cấu hình pgAdmin 4 quản trị CSDL.
  - Cấu hình Nginx Reverse Proxy với HTTPS tự ký và Security Headers.
- **Commit 2:** `feat: integrate prometheus and grafana for container, web, and db monitoring`
  - Tích hợp Prometheus server thu thập số liệu.
  - Cấu hình cAdvisor giám sát tài nguyên container (CPU/RAM).
  - Tích hợp postgres-exporter và nginx-exporter.
  - Tích hợp thư viện `prom-client` xuất metrics `/metrics` từ Web App.
  - Cấu hình Grafana tự động nạp Datasource và Dashboard toàn diện.
- **Commit 3:** `feat: setup centralized logging with loki, promtail and apply system hardening`
  - Cấu hình Loki lưu trữ log tập trung.
  - Cấu hình Promtail thu thập log định dạng JSON từ Nginx và Web App.
  - Áp dụng các biện pháp Hardening: Non-root user, Network isolation, giới hạn tài nguyên CPU/RAM, mật khẩu mạnh qua `.env`.
  - Hoàn thiện tài liệu README và báo cáo thực hành.

