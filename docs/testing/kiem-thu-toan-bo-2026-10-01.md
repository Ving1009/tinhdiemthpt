# Kiểm thử website — 01/10/2026

## Phạm vi và môi trường

Kiểm tra bản trong repository bằng Express (`npm start`, cổng 3000), trình duyệt Brave qua Playwright CLI và gói Cloudflare Workers. Không đổi dữ liệu tuyển sinh hoặc tự bổ sung công thức chưa có nguồn. Hồ sơ hiện có 326 trường, 17.617 dòng ngành và 1.415 mục phương thức trong catalog.

## Lỗi phát hiện và đã sửa

| Vấn đề | Nguyên nhân và thay đổi | File chính |
| --- | --- | --- |
| Tesseract dự phòng không chạy, có thể treo trạng thái quét | CSP chặn WebAssembly trong worker. Chỉ cho phép `wasm-unsafe-eval` ở chính worker Tesseract; cấu hình Static Assets đi qua Worker cho đường dẫn này. Thêm giới hạn khởi tạo/nhận diện 120 giây, xử lý lỗi trong lúc nhận diện, giải phóng blob và worker khi kết thúc. | `lib/securityHeaders.js`, `server/server.js`, `worker/http.js`, `wrangler.jsonc`, `public/js/clientTranscriptOcr.js` |
| Hộp quét trả lại lỗi từ xa, che mất lỗi nhận diện tại thiết bị | Giữ thông báo thực của phương án dự phòng. Cache URL worker/module được đổi để không dùng CSP và mã cũ. | `public/js/transcriptScanner.js`, `public/js/main.js`, `public/index.html` |
| OCR bảng có các ô rời và tên lớp dạng `10TN7` bị bỏ qua | Ghép chữ theo tọa độ hàng của Tesseract, dùng chế độ sparse text; nhận tên lớp có hậu tố và tiêu đề bị tách dòng. Giữ vị trí ô ngoài khoảng 0–10 bằng giá trị trống, không tự suy đoán dấu thập phân. | `public/js/clientTranscriptOcr.js`, `public/js/core/ocrTranscriptParser.js` |
| Logout lỗi mạng nhưng giao diện báo đã thoát | Chỉ xóa phiên, dữ liệu cá nhân và tải lại trang khi server xác nhận logout hoặc báo phiên đã hết; lỗi mạng giữ tài khoản và thông báo để thử lại. Thêm tên truy cập cho dialog tài khoản đã đăng nhập. | `public/js/account.js` |
| Đáp án ngắn chứa ký tự thừa vẫn được chấm đúng | Regex chỉ nhận toàn bộ chuỗi số nhập vào; vẫn chấp nhận dấu phẩy thập phân và đáp án nguồn có đơn vị. | `public/js/core/practiceExam.js` |
| Đánh dấu câu ở nhánh Tin học cuộn sai câu | Tính chỉ số từ danh sách câu của nhánh đang thi. | `public/js/practiceExam.js` |
| Trợ lý giữ trạng thái chờ khi API không kết thúc | Hủy request sau 25 giây và dùng tra cứu nội bộ đã có. | `public/js/assistant.js` |
| Yêu cầu favicon trả 404 | Thêm biểu tượng SVG cùng nhận diện Sigma của website. | `public/favicon.svg`, `public/index.html` |

Các test hồi quy nằm trong `tests/accountFrontend.test.js`, `tests/assistantFrontend.test.js`, `tests/clientTranscriptOcr.test.js`, `tests/ocrTranscriptParser.test.js`, `tests/practiceExam.test.js`, `tests/publicApiSecurity.test.js`, `tests/cloudflareWorker.test.js`.

## Kiểm chứng tự động

| Lệnh | Kết quả |
| --- | --- |
| `npm run check` | Đạt |
| `npm test` | 244/244 đạt, không bỏ qua test; tăng 12 ca so với đầu đợt |
| `npm run verify:data` | Không có lỗi; 19 cảnh báo về hồ sơ hệ thống, sau đại học hoặc tuyển sinh đặc thù chưa có dòng ngành đại học phổ thông |
| `npm run audit:formulas` | Đạt kiểm tra ánh xạ, anchor và tính nhất quán; mức xác minh được nêu riêng bên dưới |
| `npm run audit:logos` | 319 logo đọc được; 31 SVG và 288 ảnh raster; không phát hiện tệp hỏng hoặc độ phân giải thấp theo tiêu chí script |
| `npm run cf:dry-run` | Build và kiểm tra deploy cả hai Worker đạt |
| `npm run measure:performance` | Local: bootstrap gzip 39.139 byte, trung vị 4,8 ms; tra cứu tổ hợp tốt nhất 230 ms. Đây không phải kết quả chịu tải production. |

## Kiểm chứng trên Brave

- THPT tự động và thủ công: 9/9/8/8 + KV1 ra 26,40; tổng KV1 + UT1 giảm đúng theo điểm nền. Kiểm tra lỗi rỗng, `abc`, `-1`, `11`, `8.555`, dấu phẩy; thông báo dưới ô, ARIA và ẩn kết quả sai.
- Sáu phương thức học bạ: tính đúng ca mẫu, có GDQP–AN; nút tính trên mobile cuộn vào kết quả.
- Tám route chính tại 1366, 390 và 320 px không tràn toàn trang. Kiểm tra sáng/tối và menu theo hash.
- Tìm ngành bằng nút/Enter sau khi gõ ngay; bộ lọc, sort, xóa bộ lọc, dữ liệu so sánh và cảnh báo điểm cũ.
- Lưu 15 nguyện vọng, đổi thứ tự/xóa, so sánh bốn lựa chọn; xuất PDF một trang A4 ngang có 15 dòng. Đã render và xem PDF để kiểm tra chữ tiếng Việt và bố cục.
- Tìm trường, mã tổ hợp, hồ sơ, mở/đóng phương thức. Gọi 978 endpoint hồ sơ/ngành/công thức của đủ 326 trường, tất cả trả JSON thành công.
- Toàn bộ 30 phương thức có quy tắc tính mới ở 14 trường: có kết quả khi nhập hợp lệ, báo lỗi khi vượt giới hạn và không giữ kết quả cũ. Các nhánh công thức còn lại được kiểm tra qua bộ unit test hiện có.
- 18 môn/nhánh thi hiện có: trả lời, chấm bài, xem đáp án, chọn lời giải nếu nguồn có; khôi phục bài và đồng hồ sau reload, cảnh báo bỏ câu. Ngữ văn là bài luyện nhanh, không thay thế chấm tự luận.
- Tài khoản A → logout → B → A, restore/backup đúng tài khoản; logout lỗi mạng không giả thành công; timer cũ không sao lưu sang B. Browser dùng API fixture cô lập; unit test kiểm tra thêm backend auth, cookie, session hết hạn, origin và truy cập chéo.
- Dữ liệu khách hết hạn sau 15 phút rời trang được xóa khi truy cập lại, giữ theme. Trợ lý lỗi 503/quá hạn quay về tra cứu nội bộ; báo sai kiểm tra validation, lỗi gửi và trạng thái nhận thành công bằng fixture.
- OCR: ép endpoint từ xa trả 503 để thực sự chạy Tesseract trong Brave với ba ảnh học bạ người dùng đã cung cấp. Bảng kiểm tra đã mở và spinner kết thúc. Không gửi báo cáo thử vào Supabase hoặc tạo tài khoản thật để tránh dữ liệu rác.
- Mười kiểm tra bổ sung: auth chậm vẫn tính được và chuyển sang thông báo dự phòng; chọn ảnh sẵn trên điện thoại; từ chối loại file sai/quá 7 MB/ảnh thứ bảy; chỉ tải sau khi đồng ý; nút nhập tay đóng hộp dự phòng, focus bảng điểm và kết thúc trạng thái chờ; không lưu ảnh hoặc học bạ chưa xác nhận vào localStorage.

## Giới hạn cần biết

1. **OCR tại thiết bị chưa đọc đủ ba ảnh thật.** Ca thử hiện chỉ cho sáu dòng điểm, có ô nhận diện sai hoặc bỏ sót. Đã thêm cảnh báo rõ, giữ màn hình kiểm tra/chỉnh sửa trước khi điền; không xem đây là nhận diện đầy đủ và chính xác. Muốn đánh giá chất lượng cần đối chiếu thêm nhiều mẫu và kiểm tra dịch vụ từ xa với token Turnstile hợp lệ.
2. **Catalog chưa được xác minh toàn bộ.** Có 85 mục `official_verified`, 479 `source_reported`, 412 `source_description`, 147 `requires_review`, 10 `scope_incomplete`, 12 `missing_evidence`, bốn `conflicting` và 266 `non_numeric`. Có hồ sơ không đồng nghĩa có công thức chính thức cho mọi phương thức. Đợt này không thay dữ liệu nghiên cứu.
3. **Lời giải phụ thuộc tài liệu nguồn.** Một số môn ngoại ngữ, công nghệ và Tin học chưa có lời giải chi tiết; ứng dụng thông báo đúng tình trạng này. Không tự tạo lời giải để giả là nguồn chính thức.
4. **PDF hiện là nội dung ảnh.** Xem/in được; chưa hỗ trợ chọn văn bản. Những danh sách tổ hợp dài có thể được rút gọn bằng dấu ba chấm để giữ 15 nguyện vọng/trang.
5. **Độ phân giải logo không xác minh danh tính logo.** Script kiểm tra chất lượng tệp; việc khẳng định mọi biểu tượng là phiên bản chính thức mới nhất cần đối chiếu website của từng trường.
6. Kiểm thử lỗi dịch vụ, chuyển tài khoản và gửi báo cáo bằng fixture không thay thế toàn bộ kiểm thử tích hợp tài khoản D1/Supabase/nhà cung cấp AI/Turnstile trên production. Chỉ ghi nhận những thao tác production đã thực hiện sau deploy.

## Kiểm chứng production sau triển khai

Thực hiện sau khi các kiểm tra trên đạt; kết quả được báo riêng trong thông báo triển khai. Phần trên là kết quả kiểm thử local và build, không phải cam kết đã kiểm thử mọi dịch vụ production.
