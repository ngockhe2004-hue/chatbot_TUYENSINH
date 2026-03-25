# 🤖 Chatbot Tư vấn Tuyển sinh Đại học Quảng Nam

Hệ thống chatbot thông minh hỗ trợ tư vấn tuyển sinh cho trường Đại học Quảng Nam, sử dụng API Gemini của Google để cung cấp câu trả lời chính xác và nhanh chóng.

## ✨ Tính năng chính
- 💬 **Hỗ trợ 24/7:** Giải đáp thắc mắc về các ngành học, học phí, hồ sơ xét tuyển.
- 📁 **Dữ liệu chuyên sâu:** Tích hợp trực tiếp với cơ sở dữ liệu `database.json` của trường.
- 🚀 **Nhanh chóng:** Phản hồi thông tin ngay lập tức dựa trên mô hình ngôn ngữ lớn (LLM).

## 🛠️ Công nghệ sử dụng
- **Backend:** Node.js, Express
- **AI Model:** Google Gemini API
- **Frontend:** HTML, CSS, JavaScript (Vanilla)

## 📦 Hướng dẫn cài đặt

Để chạy dự án này trên máy cục bộ, bạn có thể thực hiện các bước sau:

1. **Clone repository:**
   ```bash
   git clone https://github.com/ngockhe2004-hue/chatbot_TUYENSINH.git
   cd chatbot_TUYENSINH
   ```

2. **Cài đặt thư viện:**
   ```bash
   npm install
   ```

3. **Cấu hình môi trường:**
   Tạo tệp `.env` ở thư mục gốc và thêm API Key của bạn:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Chạy server:**
   ```bash
   node server.js
   ```

## 📄 Giấy phép
Dự án được phát triển nhằm mục đích phục vụ công tác tuyển sinh.

---
*Phát triển bởi [ngockhe2004-hue](https://github.com/ngockhe2004-hue)*
