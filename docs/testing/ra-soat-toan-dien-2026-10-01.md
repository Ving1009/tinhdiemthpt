# Rà soát logic, bảo mật và UI/UX — 01/10/2026

## Phạm vi

Rà soát mã frontend, Express, hai Cloudflare Worker, tài khoản/session, API công khai, giới hạn tài nguyên, tính điểm, tra cứu, nguyện vọng/PDF, OCR, trợ lý và phòng thi. Kiểm tra thao tác trên Brave bằng Playwright CLI. Không thay dữ liệu tuyển sinh hay tự suy đoán công thức chưa có căn cứ.

Các tình huống ghi dữ liệu, đổi tài khoản, dịch vụ lỗi và upload ảnh dùng môi trường local/fixture. Không tạo tài khoản hoặc gửi báo cáo thử vào dữ liệu production. Đây là kiểm tra có phạm vi và bằng chứng, không phải chứng nhận website không còn bất kỳ lỗ hổng nào.

## Các vấn đề đã sửa

| Vấn đề | Nguyên nhân, bản sửa | File |
| --- | --- | --- |
| Dữ liệu có thể lẫn khi đổi tài khoản ở tab khác | Tab cũ còn điểm trong bộ nhớ và có thể ghi lên localStorage chung. Chặn ghi dữ liệu cá nhân khi chủ sở hữu local thay đổi hoặc đang chờ restore; sự kiện storage hủy timer và tải lại đúng tài khoản. Chỉ thao tác restore/clear đồng bộ được phép ghi trong quá trình chuyển tài khoản. Theme tiếp tục được lưu. | `public/js/account.js`, `public/js/utils.js` |
| Request backup đang chờ có thể dùng cookie của tài khoản mới | Frontend gửi `X-Account-User-Id`; backend so với user được xác định từ cookie, trả 409 khi không khớp trước khi đọc/ghi dữ liệu. Header là điều kiện kiểm tra bổ sung; quyền truy cập vẫn lấy từ session, không lấy từ header. | `worker/auth.js`, `public/js/account.js` |
| Cookie sai mã hóa gây lỗi máy chủ | `decodeURIComponent` có thể throw với `%` hoặc chuỗi UTF-8 hỏng. Xem cookie này như phiên không hợp lệ, trả 401 khi đọc tài khoản. | `worker/auth.js` |
| Giới hạn body chỉ có hiệu lực sau khi đã đọc toàn bộ request | Dùng bộ đọc stream chung, giới hạn theo byte thực tế và hủy stream ngay khi vượt ngưỡng; áp dụng JSON auth, dữ liệu, trợ lý và multipart OCR. Không tin riêng Content-Length. | `lib/requestBody.js`, `worker/auth.js`, `worker/dataApi.js`, `worker/ocrHandler.js` |
| Multipart lỗi hoặc file ngoài danh sách gây xử lý không rõ ràng | Trả JSON 400 với thông báo nhập liệu; chỉ chấp nhận các file `images[]`. Giữ các giới hạn 6 ảnh, 7 MB/ảnh, tổng ảnh 10 MB và multipart 11 MB của Worker. | `worker/ocrHandler.js` |
| Limiter thiếu/lỗi có thể bỏ qua bảo vệ | Fail-closed: thiếu binding hoặc lỗi dịch vụ trả 503; hết hạn mức trả 429 và Retry-After. OCR/báo sai kiểm tra limiter trước khi gọi xác minh Turnstile. | `worker/http.js`, `worker/index.js` |
| OCR service mất kết nối làm Worker throw | Bắt lỗi service binding, trả JSON 503 `SCAN_PROVIDER_UNAVAILABLE` để frontend tiếp tục luồng dự phòng hoặc nhập tay. | `worker/index.js` |
| Tìm tổ hợp với phần tử null gây TypeError; số trang có thể là số lẻ | Lọc phần tử không phải object trước khi đọc thuộc tính; chuẩn hóa page/pageSize về số nguyên rồi giới hạn như cũ. | `server/dataStoreCore.js` |
| Timeout kết thúc ngay khi nhận header, response body vẫn có thể treo | Giữ bộ đếm đến khi đọc xong JSON trong auth và ba loại dịch vụ AI. Lỗi đọc body do timeout được trả về đúng mã timeout, để cơ chế dự phòng có thể xử lý. | `public/js/account.js`, `server/services/groqAssistant.js`, `server/services/openAiCompatibleAssistant.js`, `server/services/cloudflareWorkersAssistant.js` |
| Thông báo lỗi điểm không nhất quán; lỗi rỗng bị timer xóa | Dùng chung validateScore cho THPT và học bạ; phân biệt số/range/độ chính xác; hiển thị lỗi ngay dưới ô với ARIA, xóa khi hợp lệ. Submit THPT hủy debounce auto-calculate đang chờ. | `public/js/utils.js`, `public/js/main.js`, `public/css/refinement.css` |
| Các bước học bạ có số bị khuyết, khó đi thẳng tới nhập tay | Ba bước luôn hiện có số 1 → 2 → 3; phần kiểm tra OCR có dấu kiểm vì chỉ xuất hiện sau nhận diện. Ghi rõ quét không bắt buộc, thêm nút cuộn/focus tới bảng nhập tay. | `public/index.html`, `public/js/main.js` |
| Điều hướng bàn phím và đóng hộp thoại chưa đầy đủ | Skip-link focus main và giữ hash route. Tab được giữ trong hộp thoại tài khoản/báo sai, bao gồm textarea. Escape đóng menu/tìm kiếm/tài khoản và trả focus về nút mở tương ứng. | `public/index.html`, `public/js/main.js`, `public/js/account.js` |
| Nút ở chế độ tối có chữ quá nhạt | Nút trắng dùng chữ tím đậm; nút tím nhạt dùng chữ tối. Đo màu computed style ở mobile/desktop, cả hover và trạng thái thường. | `public/css/refinement.css` |
| Dependency có advisory đã công bố | Cập nhật lockfile cho ip-address 10.7.2, Wrangler 4.145.0 và các phụ thuộc liên quan; chạy lại npm ci, audit, test và build. | `package-lock.json` |

Với hai nhóm nút vừa sửa, 16 trường hợp đo đạt tương phản 6,55–9,68:1. Ngưỡng tham chiếu cho chữ thông thường là 4,5:1 theo [W3C — Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); kết quả này không chứng nhận toàn bộ trang đạt WCAG.

Advisory của ip-address xác nhận nguy cơ làm tốn tài nguyên khi phân tích đầu vào đặc biệt: [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw). Việc chặn body theo stream và kiểm tra quota sớm phù hợp với hướng dẫn về [giới hạn tiêu thụ tài nguyên của OWASP](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/).

## Kiểm chứng tự động

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| `npm ci` | Đạt; cài lại từ lockfile |
| `npm run check` | Đạt |
| `npm test` | 262/262 đạt, không skip; thêm 15 ca so với đầu đợt 247/247 |
| `npm run verify:data` | 0 lỗi; 19 cảnh báo về hồ sơ hệ thống/đặc thù/sau đại học không có dòng ngành phổ thông riêng |
| `npm run audit:formulas` | Đạt kiểm tra ánh xạ và tính nhất quán; không đồng nghĩa mọi công thức đã được xác minh |
| `npm run audit:logos` | 319 tệp đọc được, 31 SVG/288 raster; không phát hiện tệp hỏng hoặc độ phân giải thấp theo tiêu chí script |
| `npm audit` | 0 advisory trong kết quả tại thời điểm kiểm tra |
| `npm run cf:dry-run` | Build và dry-run hai Worker đạt |
| `git diff --check` | Đạt |

Regression test mới kiểm tra cookie hỏng, đổi tài khoản khi cookie thay đổi, đổi tài khoản giữa tab, chặn ghi trong lúc restore, header chủ sở hữu, auth/AI body timeout, body streaming thiếu/giả Content-Length, JSON không phải object, multipart hỏng/ngoài danh sách, limiter thiếu/lỗi và OCR service mất kết nối. Các test đã có tiếp tục kiểm tra hash mật khẩu, cookie Secure/HttpOnly/SameSite, session hết hạn, origin, Turnstile fail-closed, định dạng response, ưu tiên và công thức tính.

Test được bổ sung/cập nhật trong `tests/requestBody.test.js`, `tests/authFlow.test.js`, `tests/accountFrontend.test.js`, `tests/cloudflareWorker.test.js`, `tests/dataStore.test.js`, `tests/multiProviderAssistant.test.js`, `tests/utils.test.js`, `tests/publicSourceCleanup.test.js`.

## Kiểm chứng chức năng và giao diện

- **326/326 hồ sơ:** 978 request local tới hồ sơ, ngành và công thức trả JSON thành công. Không sửa nội dung các trường chỉ để làm kiểm tra đạt.
- **Tính điểm:** THPT tự động/thủ công 9/9/8/8 + KV1 ra 26,40; KV1 + UT1 giảm đúng. Sáu cách tính học bạ và GDQP–AN giữ hành vi. Kiểm tra lỗi `11`, `-1`, `8.555`, `abc`, trống và dấu phẩy; lỗi không để lại kết quả cũ.
- **Công thức theo trường:** chạy đủ 30 quy tắc tự tính mới trong UI, kiểm tra kết quả và điểm vượt giới hạn. Những mục chưa đủ căn cứ tiếp tục hiển thị tình trạng xác minh và không tự tính sai.
- **Tìm ngành/nguyện vọng:** gõ rồi bấm ngay hoặc Enter, có 24 thẻ trang đầu; đổi bộ lọc/sort/xóa, cảnh báo điểm cũ, so sánh bốn lựa chọn, lưu 15 nguyện vọng, di chuyển/xóa và tải PDF.
- **Giao diện:** 80 tổ hợp gồm 8 route × 5 chiều rộng 360/390/768/1024/1366 × sáng/tối không tràn ngang toàn trang; có thêm kiểm tra 320 px. Hash routing giữ đúng section. Đã xem ảnh desktop/mobile và đo tương phản nút.
- **Truy cập bằng bàn phím:** 24 ca nhập liệu, số bước, nút nhập tay, Tab trong dialog, textarea, skip-link và Escape đạt.
- **Tài khoản:** A → logout → B → A chỉ restore/backup đúng dữ liệu; logout lỗi mạng không giả thành công. Bảy kiểm tra hai tab xác nhận tab cũ không ghi đè dữ liệu B, timer A không sao lưu vào B, UI cả hai tab chuyển sang B, theme được giữ; backup B mang header B.
- **OCR:** mười kiểm tra auth chậm không chặn tính điểm, lựa chọn ảnh sẵn, loại file/dung lượng/số lượng, đồng ý trước upload, lỗi 503 mở dự phòng, nhập tay đóng dialog/focus bảng/giải phóng spinner và không lưu ảnh hay dữ liệu chưa xác nhận vào localStorage.
- **Trợ lý/báo sai:** lỗi provider/quá hạn quay về tra cứu nội bộ, tìm đúng nhóm ngành điện/điện tử; báo sai kiểm tra nhập liệu, gửi lỗi cho phép thử lại và xác nhận nhận đúng một lần bằng fixture.
- **Phòng thi:** chạy cả 18 đề/môn đang có, kiểm tra đủ câu trong nhánh được chọn; dùng đáp án catalog để xác minh bộ chấm trả 10/10, chọn xem lời giải nếu có. Reload giữ đáp án và đồng hồ; bài thiếu câu có cảnh báo và không được chấm tối đa. Đây là kiểm tra bộ chấm theo đáp án hiện có, không phải đối chiếu độc lập mọi đáp án với tài liệu gốc.

Đo local với dữ liệu đã nạp: bootstrap gzip 39.139 byte, trung vị 3,1 ms; tìm tổ hợp tốt nhất 184,7 ms (5 lần). Không dùng số này để kết luận khả năng chịu tải production.

## Phần cần kiểm chứng thêm

1. Catalog có 85 mục `official_verified`, 479 `source_reported`, 412 `source_description`, 147 `requires_review`, 10 `scope_incomplete`, 12 `missing_evidence`, 4 `conflicting` và 266 `non_numeric`. Đã kiểm tra code xử lý các trạng thái này; chưa đối chiếu lại toàn bộ nguồn tuyển sinh trong đợt sửa logic này.
2. Chất lượng OCR ảnh thật vẫn cần đối chiếu thủ công. Ca chạy Tesseract với ba ảnh học bạ ở đợt trước không đọc đủ/sai một số ô; đợt này kiểm tra độ an toàn, giới hạn và luồng dự phòng, không coi việc hết spinner là nhận diện chính xác.
3. Một số đề chưa có lời giải chi tiết trong tài liệu nguồn; Ngữ văn là bài luyện nhanh trắc nghiệm, không thay thế chấm tự luận. Kiểm thử chấm theo đáp án catalog không xác nhận mọi nội dung đề là chính xác tuyệt đối.
4. PDF hiện là ảnh để xem/in; chưa chọn được văn bản, một số danh sách tổ hợp dài được rút gọn để giữ 15 nguyện vọng/trang.
5. Kiểm tra chất lượng logo không xác nhận mọi biểu tượng là bản chính thức mới nhất; cần đối chiếu từng website trường nếu yêu cầu kiểm chứng danh tính.
6. Fixture auth/báo sai/OCR không thay thế toàn bộ tích hợp D1/Supabase/provider/Turnstile thật. Kiểm tra production không tạo tài khoản hay báo cáo rác.
7. Cloudflare có thể chèn analytics/script inline bị CSP chặn. Giữ CSP chặt; không bật unsafe-inline để che thông báo console. Không đồng nhất các thông báo này với pageerror của ứng dụng.

## Phát hành

Bản sửa được commit/push lên GitHub và triển khai cả Worker chính lẫn OCR bằng `npm run cf:deploy`. Commit, phiên bản triển khai và kết quả kiểm chứng production được nêu trong thông báo hoàn tất tác vụ.
