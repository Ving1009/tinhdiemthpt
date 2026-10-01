# Tích hợp Groq quét học bạ — 01/10/2026

## Kết quả ảnh thật

Kiểm tra qua Brave/Playwright, giao diện học bạ → chọn ba ảnh người dùng cung cấp → tick đồng ý → tối ưu ảnh bằng mã trình duyệt hiện có → endpoint Express → API Groq thật → xem trước → xác nhận điền điểm.

- Ba trang lớp 10, 11, 12: `1000004460.jpg`, `1000004462.jpg`, `1000004464.jpg`.
- Model: `qwen/qwen3.8-27b`; API trả HTTP 200, `engine: groq`.
- Đọc đủ **27 dòng**, mỗi trang 9 môn; **81/81 ô HK1, HK2, cả năm** khớp phần chữ in trong ba ảnh, gồm GDQP-AN.
- Xác nhận điền thành công: Toán lớp 12 cả năm 8,9; GDQP-AN lớp 12 cả năm 9,1.
- Không gửi request khi chưa tick đồng ý; tên học sinh trả `null`; không có ảnh base64, đối tượng học bạ thô hoặc tên học sinh trong localStorage trước xác nhận.
- Bước Turnstile được giả lập **chỉ trong fixture local**, nhằm kiểm tra OCR thực tế độc lập với challenge. Production vẫn sử dụng xác minh Turnstile thật; regression kiểm tra thiếu token không gọi provider.

Kết quả 81/81 chỉ áp dụng cho ba ảnh thử; không phải cam kết độ chính xác cho ảnh mờ, chữ viết tay hoặc mẫu học bạ khác.

## Những vấn đề phát hiện và xử lý trong thử nghiệm

1. API có lần trả `json_validate_failed` khi dùng strict JSON Schema với ảnh. Adapter dùng `json_object`, cấu trúc JSON rõ trong prompt theo ví dụ Vision chính thức, rồi chạy cùng bộ kiểm tra điểm của website. JSON hỏng không được điền vào bảng.
2. Luân phiên key ở cấp toàn bộ loạt ảnh khiến trang đã đọc bị gửi lại khi một trang sau gặp quota. Groq hiện luân phiên ở cấp **từng request ảnh**, chỉ thử lại ảnh gặp quota/auth, giữ các trang đã đọc. Không lặp lại timeout trên mọi key.
3. Quota thực tế có cả giới hạn input/output token mỗi phút; nhiều key cùng organization không làm tăng giới hạn đó. Khi không còn key khả dụng, chuyển provider dự phòng; không báo thành công với một phần kết quả bị mất.

## Mã và cấu hình

- `server/services/groqVision.js`: adapter nhận ảnh, model riêng, từng ảnh/request, tối đa 6 ảnh JPG/PNG/WEBP, mỗi ảnh 7 MiB; tổng timeout mặc định 45 giây bao gồm đọc response body, không log ảnh/key/tên.
- `server/configuredScanProviders.js`: dùng các key Groq hiện có; thứ tự Gemini → Groq → OCR.space.
- `server/services/transcriptScanService.js`: nhận diện lỗi Groq để chuyển provider hoặc cho trình duyệt chọn Tesseract/nhập tay.
- `server/server.js`: truyền đúng environment của ứng dụng vào factory quét.
- `.env.example`, `scripts/upload-cloudflare-secrets.mjs`, `docs/cloudflare-production.md`: model ảnh và key cho Worker OCR, giữ nguyên model tư vấn.
- `tests/groqVision.test.js`, `tests/configuredGroqScan.test.js`, `tests/providerPool.test.js`, `tests/transcriptScanService.test.js`: request/schema dữ liệu, privacy, timeout, key pool theo ảnh, quota/auth, Turnstile, Express và Worker.

Không thêm dependency, không sửa UI, API public, dữ liệu tuyển sinh hoặc công thức. `.env` không được commit.

## Kiểm chứng

- `npm run check`: đạt.
- `npm test`: **279/279 đạt**, không bỏ qua test; tăng 17 regression test so với 262 test trước đợt tích hợp.
- `npm run verify:data`: đạt, giữ các cảnh báo dữ liệu đặc thù đã có.
- `npm run audit:formulas`: đạt; không thay công thức.
- `npm run cf:dry-run`: đạt cho Worker OCR và Worker chính.
- API Groq `/models`: key hiện có xác thực HTTP 200, model nhận ảnh ở trạng thái active.
- Luồng ảnh thật: HTTP 200, 27 dòng, 81/81 ô; xem trước và xác nhận đạt.

Model ảnh đang ở Preview. Danh sách các API khác, yêu cầu tài khoản và nguồn chính thức có trong [báo cáo API](../integrations/api-ai-hoc-ba-tu-van-2026-10-01.md).
