# Cloudflare production

- Tên miền chính: `https://tinhdiemthpt.id.vn/`
- Worker cũ: `https://tinhdiemthpt.tinh-diem-thpt.workers.dev/` (chuyển hướng 308 sang tên miền chính)
- SSL/TLS: Full (strict)
- Always Use HTTPS: bật
- Minimum TLS: 1.2; TLS 1.3: bật
- HSTS: 12 tháng, áp dụng cho subdomain, không đăng ký preload
- Automatic HTTPS Rewrites: bật
- Cloudflare Managed Ruleset và HTTP DDoS protection: luôn hoạt động
- Bot Fight Mode, Browser Integrity Check, Continuous Script Monitoring, Precursor và Hotlink Protection: bật
- Turnstile: bật cho tên miền chính và hostname Worker cũ
- Tài khoản: Cloudflare D1 `tinhdiemthpt-auth`, đăng ký bằng tên đăng nhập và mật khẩu; Turnstile bảo vệ endpoint tạo tài khoản

DNSSEC đã được khởi tạo trên Cloudflare. Nhà đăng ký tên miền cần có bản ghi DS sau để chuyển trạng thái từ pending sang active:

```text
tinhdiemthpt.id.vn. 3600 IN DS 2371 13 2 29A7C52919FFF809DD1D42F707B9329B3D9953F6D4DA371FB862B77E96FF651B
```

Không bật Under Attack Mode thường trực vì chế độ này tạo challenge cho mọi lượt truy cập và làm giảm trải nghiệm người dùng. Cloudflare Access cũng không đặt trước website công khai; các API ghi dữ liệu đã được bảo vệ bằng Turnstile và rate limit riêng.

## Quét học bạ bằng Groq

Chuỗi nhận diện từ xa: Gemini → Groq → OCR.space; nếu các dịch vụ không khả dụng, trình duyệt cho phép chọn Tesseract hoặc nhập tay. Groq dùng chung các key backend `GROQ_API_KEY`, `GROQ_API_KEYS`, `GROQ_API_KEY_1..5` với trợ lý tư vấn, nhưng phải đưa key vào cả Worker OCR `tinhdiemthpt-ocr` khi triển khai. `npm run cf:secrets` đã bao gồm các key này cho cả hai Worker.

- `GROQ_MODEL`: model tư vấn, mặc định `openai/gpt-oss-20b`.
- `GROQ_VISION_MODEL`: model nhận ảnh, mặc định `qwen/qwen3.8-27b`; không thay model tư vấn bằng model ảnh.
- `GROQ_VISION_TIMEOUT_MS`: tổng thời gian dành cho một lần quét bằng Groq, mặc định 45.000 ms.

Model nhận ảnh đang ở Preview; cần giữ các phương án dự phòng và kiểm tra kết quả trước khi lưu. Quota Groq dùng chung theo organization, không tăng chỉ bằng việc thêm key. Danh sách API, yêu cầu đăng ký và tài liệu chính thức nằm trong [báo cáo API](integrations/api-ai-hoc-ba-tu-van-2026-10-01.md).
