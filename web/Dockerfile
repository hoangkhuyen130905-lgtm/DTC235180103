# Sử dụng base image Alpine nhỏ gọn, bảo mật
FROM node:20-alpine

# Thiết lập thư mục làm việc
WORKDIR /app

# Thiết lập biến môi trường production
ENV NODE_ENV=production

# Copy file định nghĩa phụ thuộc
COPY package*.json ./

# Cài đặt thư viện production và dọn dẹp cache npm
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Copy toàn bộ mã nguồn ứng dụng
COPY . .

# ==========================================================
# HARDENING: Chạy container bằng user thường (non-root)
# Alpine Node.js image có sẵn user 'node' với uid 1000
# ==========================================================
RUN chown -R node:node /app
USER node

# Khai báo cổng ứng dụng
EXPOSE 3000

# Kiểm tra trạng thái sức khỏe container
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# Khởi chạy ứng dụng
CMD ["node", "src/server.js"]
