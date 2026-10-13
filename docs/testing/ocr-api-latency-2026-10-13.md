# Kiểm tra độ trễ API quét học bạ — 13/10/2026

## Kết luận từ kiểm tra trước khi sửa

- Hai commit Tesseract `9e704a7` và `8dfb355` không sửa adapter API, khóa, model, thứ tự provider hoặc backend OCR. Bộ tối ưu ảnh cho upload vẫn dùng cạnh dài tối đa 1.600 px, JPEG chất lượng 0,8; các hàm cắt ô mới chỉ được luồng Tesseract gọi.
- Kiểm tra trực tiếp bằng Brave trên `https://tinhdiemthpt.id.vn/tinh-diem-hoc-ba/`, không mock API hoặc Turnstile. vnEdu công khai được dùng để đo thời gian; ảnh này thiếu lớp nên không dùng để kết luận chất lượng dữ liệu THPT.
- Lượt một ảnh: xử lý ảnh khoảng 0,13 giây; cấu hình và xác minh Turnstile khoảng 12,6 giây; request OCR 36,65 giây; tổng 49,42 giây. API trả 200, engine Gemini; Tesseract không được tải.
- Lượt ba ảnh học bạ được chủ website cho phép kiểm thử: xử lý ảnh 1,22 giây, request bắt đầu ở giây 4,47; API trả 200 sau 25,53 giây, engine Gemini. Tổng 30,01 giây, 27 dòng và 81 ô điểm được đọc. Không mở hộp thoại Tesseract.
- Log metadata Worker cũng ghi nhận một request kéo dài khoảng 129 giây với hai lần Gemini timeout. Mã cũ dùng Promise.race nhưng không hủy request SDK, rồi thử khóa Gemini tiếp theo sau mỗi timeout 45 giây. Phía trình duyệt có thể hết hạn 60 giây trước khi backend tới provider khác.
- Kiểm tra model catalog xác nhận model Gemini và Groq đang cấu hình có mặt và khóa thử nghiệm truy cập được. Điều này không chứng minh mọi khóa còn quota.
- Dùng đúng ba ảnh đã qua bộ tối ưu production, gọi Groq riêng hai lượt: 6,38 và 6,57 giây. Cả hai trả 27 dòng, đúng 81/81 ô so với ảnh gốc, không thiếu hoặc sai ô. Một lượt gọi trực tiếp Gemini từ máy test timeout 45 giây nhưng response thực vẫn về ở khoảng 61,85 giây; đây là bằng chứng request cũ chưa được hủy.

## Thay đổi

- `server/configuredScanProviders.js`: ưu tiên Groq trước Gemini và OCR.space; giữ fallback và key rotation khi quota/auth. Không thử mọi khóa khi timeout hoặc lỗi mạng/máy chủ của cùng provider.
- `server/services/providerPool.js`: vẫn ghi cooldown cho khóa timeout/lỗi mạng dù loại lỗi đó cần chuyển provider ngay.
- `server/services/geminiVision.js`: truyền AbortSignal tới SDK và abort ở hạn 45 giây. Abort chấm dứt việc chờ/gọi mạng ở phía ứng dụng; không cam kết nhà cung cấp đã dừng xử lý hoặc miễn phí request đó.
- `public/js/transcriptScanner.js`: hiển thị riêng bước xác minh bảo mật và nhận diện trực tuyến. Consent, giới hạn tệp, timeout 60 giây phía trình duyệt, xác nhận điểm và Tesseract giữ nguyên.
- `public/js/main.js`, `public/index.html`: tăng phiên bản cache cho mã frontend đã sửa.
- Trợ lý chat, các model, khóa và dữ liệu tuyển sinh không thay đổi.

## Kiểm thử

- Regression: Groq thành công thì không gửi ảnh tới API khác; Groq quota vẫn đổi khóa rồi sang Gemini; Gemini timeout chỉ gọi một khóa trước OCR.space; OCR.space timeout chuyển provider; request SDK thực sự abort; cooldown vẫn hoạt động; API chỉ được gọi sau bước xác minh.
- 26/26 test liên quan đạt trước khi chạy toàn bộ bộ kiểm thử.
- `npm run check` đạt; `npm test` đạt 479/479, không bỏ qua test; `npm run verify:data` và `npm run audit:formulas` đạt. Các cảnh báo về dữ liệu tuyển sinh đang thiếu căn cứ có sẵn trong bộ dữ liệu, không được sửa trong tác vụ OCR này.
- `npm run cf:dry-run` build assets và cả Worker OCR/Worker chính thành công.

## Kiểm tra sau khi deploy

Mã sửa `f05a1cf` đã push GitHub; cả Worker OCR và Worker chính đã được deploy. Brave tải đúng `main.js?v=20261013-2`. Hai lượt dùng API thật, xác minh Turnstile thật và cùng ba ảnh, không mock:

| Lượt | Request OCR | Tổng từ bấm quét | Kết quả |
| --- | --- | --- | --- |
| 1 | 7,45 giây | 12,44 giây | Groq, HTTP 200, 27 dòng, 81/81 ô đúng |
| 2 | 8,51 giây | 13,31 giây | Groq, HTTP 200, 27 dòng, 81/81 ô đúng |

Cả hai không có ô sai/thiếu, không mở hộp thoại dự phòng và không tải Tesseract. Consent vẫn khóa nút quét trước khi đồng ý. So với lượt ba ảnh trước đó (25,53 giây request, 30,01 giây tổng), hai lượt này giảm rõ rệt thời gian chờ; chưa đủ để suy ra tốc độ cho mọi ảnh/mạng/tải dịch vụ.

## Giới hạn

Các thời gian là phép đo trên máy và mạng hiện tại, không phải cam kết tốc độ cho mọi người dùng. Xác minh Cloudflare, upload, tải lần đầu dữ liệu Tesseract và mức tải API có thể làm tổng thời gian thay đổi. Bộ ba ảnh chỉ là một mẫu kiểm thử độ chính xác; vẫn cần đối chiếu điểm với ảnh gốc. Tệp ảnh, dữ liệu điểm gốc và log riêng đều nằm ngoài Git trong `.local/`; tài liệu này chỉ chứa số liệu tổng hợp.

Tham khảo khả năng model: [Groq Vision](https://console.groq.com/docs/vision), [Gemini Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
