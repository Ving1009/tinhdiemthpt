# Security Audit — Tính Điểm THPT

- **Phạm vi:** repository hiện tại, Express backend cục bộ, Cloudflare Worker chính, OCR Worker, API công khai, frontend và website production.
- **Production:** https://tinhdiemthpt.id.vn/
- **Ngày kiểm tra:** 2026-09-27
- **Bản production đã retest:** `6ae2825f-0184-4883-b624-d1e5c64fc886`
- **Nguyên tắc:** kiểm thử có kiểm soát; không flood, DDoS, brute force, khai thác sâu, xóa dữ liệu hoặc tấn công dịch vụ bên thứ ba.

Không phát hiện lỗ hổng Critical hoặc High đã được xác nhận. Các thiếu sót có thể sửa an toàn trong repository đã được vá mà không thay đổi dữ liệu tuyển sinh, công thức tính điểm hoặc giao diện.

## Kết quả 20 hạng mục

| # | Hạng mục | Trước khi kiểm tra | Hành động | Kết quả |
| --- | --- | --- | --- | --- |
| 1 | Password hashing | Website dùng tài khoản tên đăng nhập và mật khẩu. | PASS | Mật khẩu được băm PBKDF2-SHA256 với salt ngẫu nhiên riêng và 210.000 vòng; không lưu bản rõ. |
| 2 | Login rate limit | Endpoint đăng nhập và đăng ký có thể bị dò tự động. | PASS | Cloudflare Rate Limiting giới hạn chung 5 lần/phút/IP; đăng ký còn bắt buộc Turnstile. |
| 3 | Session expiration | Tài khoản cần phiên đăng nhập phía máy chủ. | PASS | Token ngẫu nhiên hết hạn sau 30 ngày; D1 chỉ lưu SHA-256 của token và trình duyệt chỉ nhận cookie Secure, HttpOnly, SameSite=Lax. |
| 4 | Debug log | Log lỗi provider đã che khóa; lỗi Worker chưa biết trước đó có thể ghi nguyên đối tượng lỗi. | FIXED | Log production chỉ giữ `event`, tên lỗi và mã lỗi đã giới hạn độ dài; không ghi ảnh, học bạ, token, khóa hoặc stack. Log chẩn đoán Tesseract phía trình duyệt chỉ chạy ở localhost. |
| 5 | Secret không nằm ở frontend | Secret nằm trong environment/Cloudflare Secret; frontend chỉ nhận Turnstile site key công khai. `.env` đã bị Git ignore. | PASS | Không tìm thấy secret thật trong frontend, file đang tracked hoặc lịch sử Git. Chuỗi giống `sk-...` trong lịch sử là anchor mã trường QSK/DSK, không phải credential. |
| 6 | File upload — file type | Đã whitelist MIME JPG/PNG/WEBP và kiểm tra magic bytes phía server/Worker. Tên file gốc vẫn được chuyển sâu hơn vào pipeline. | FIXED | Giữ kiểm tra MIME + signature; thay tên phía backend thành `hoc-ba-N.jpg/png/webp` trước OCR. SVG, HTML, file giả MIME và định dạng khác bị từ chối. |
| 7 | File upload — whitelist | Whitelist đã tồn tại ở frontend, Express và Cloudflare OCR Worker; file không được lưu hoặc public. | PASS | Upload chỉ tồn tại trong bộ nhớ trong thời gian xử lý và không tạo URL public. |
| 8 | File size limit | Có giới hạn 7 MB/ảnh, 12 ảnh và 24 MB tổng; tổng dung lượng chỉ được kiểm tra sau khi parser multipart đọc dữ liệu. | FIXED | Bổ sung chặn sớm request khai báo trên 25 MB trước `formData`/Multer; giữ nguyên giới hạn hiện có và kiểm tra tổng thực tế 24 MB. |
| 9 | Server-side validation | Điểm/OCR/API/report đã validate độc lập; JSON sai hoặc quá lớn ở Express có thể bị trả thành lỗi 500 chung. | FIXED | JSON sai trả 400 `INVALID_JSON`; body trên 100 KB trả 413 `REQUEST_TOO_LARGE`; các giới hạn số, năm, tổ hợp, OCR và báo lỗi tiếp tục được kiểm tra server-side. |
| 10 | IDOR / predictable ID | API tuyển sinh là công khai; dữ liệu sao lưu tài khoản là riêng tư. | PASS | API sao lưu lấy user ID từ phiên D1 hợp lệ, không nhận user ID do trình duyệt gửi nên không thể đổi ID để đọc tài khoản khác. |
| 11 | Admin authorization | Không có admin/dashboard/private management route trên web. Script quản trị chỉ chạy trong terminal repository. | N/A | Không có API đọc danh sách báo sai hoặc sửa dữ liệu từ production. |
| 12 | Database / injection | Supabase chỉ được gọi server-side qua REST với tên bảng từ cấu hình đã giới hạn regex; input người dùng nằm trong JSON body. Không chạy shell/SQL từ input. | PASS | Không xác nhận được SQL, NoSQL hoặc command injection. |
| 13 | HTTPS | Production chạy HTTPS; tài nguyên production dùng HTTPS hoặc cùng origin. HTTP chỉ xuất hiện ở nhánh localhost Live Server. | PASS | Không phát hiện mixed active content trên production. |
| 14 | Security headers | Production trước audit không có CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy hoặc chống framing. | FIXED | Thêm CSP không dùng `unsafe-inline`, `unsafe-eval` hay wildcard; thêm HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` và `X-Frame-Options: DENY` cho static asset, API và lỗi. |
| 15 | Cookie security | Phiên tài khoản dùng cookie riêng. | PASS | Cookie có tiền tố `__Host-`, Path=/, Secure, HttpOnly và SameSite=Lax; logout xóa token trong D1 và cookie trình duyệt. |
| 16 | CORS | Chỉ phản chiếu origin HTTP loopback phục vụ VS Code Live Server; không bật credentials và không dùng wildcard. | PASS | Origin ngoài danh sách không nhận ACAO; preflight chỉ cho GET, POST, OPTIONS và hai header cần thiết. |
| 17 | Database không public | Supabase secret chỉ có ở Worker/Express; public API chỉ cho gửi báo cáo sau Turnstile và không có route đọc/quản trị. | PASS | Dữ liệu nguồn nội bộ bị sanitize khi build; `/_worker-data/*` bị Worker chặn 404. |
| 18 | Error / stack trace | Client đã nhận lỗi chung, nhưng log Worker cho lỗi chưa biết có thể chứa message/stack. Express cũng chưa phân loại JSON parser error. | FIXED | Client không nhận stack/path/config; log lỗi chưa biết chỉ còn metadata an toàn; JSON/body errors có schema và status chính xác. |
| 19 | Cloudflare protection | Đã có Turnstile, service binding OCR, rate limit 10 OCR/phút và 3 báo cáo/phút, cache policy; thiếu headers và chặn sớm request upload lớn. | FIXED | Bổ sung headers cho cả Static Assets lẫn Worker response, chặn sớm multipart và giữ nguyên các lớp miễn phí hiện có. |
| 20 | Backup + monitoring | Git cho phép rollback; Workers Observability đang bật. Trạng thái backup Supabase và cảnh báo trên Dashboard không thể xác minh bằng repository. | PASS | Không thêm dịch vụ trả phí. Việc cần thao tác Dashboard được ghi ở Remaining Issues. |

## Lỗi đã sửa

### 1. Thiếu security headers trên production

- **Severity:** Medium
- **File:** `lib/securityHeaders.js`, `worker/http.js`, `worker/index.js`, `server/server.js`, `scripts/build-cloudflare.mjs`
- **Nguyên nhân:** response của Worker và Cloudflare Static Assets chưa dùng một chính sách header thống nhất.
- **Cách sửa:** tạo một cấu hình dùng chung; áp dụng cho API, OCR service response, static assets, trang lỗi và Express. CSP chỉ cho phép same-origin, Google Fonts và Cloudflare Turnstile; worker Tesseract được phép từ same-origin/blob.
- **Test:** unit/integration test header; Cloudflare dry-run; mở production ở desktop/mobile; kiểm tra console; đọc header trực tiếp trên HTML, CSS, API và 404.
- **Retest:** production trả đủ CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors 'none'` và X-Frame-Options. Không có lỗi console mới; Google Fonts và JavaScript tải bình thường.

### 2. Multipart có thể tiêu thụ bộ nhớ trước khi kiểm tra tổng 24 MB

- **Severity:** Medium, đã được giảm rủi ro sẵn bởi Turnstile, rate limit, giới hạn 7 MB/tệp và giới hạn của Cloudflare.
- **File:** `server/routes/scanTranscript.js`, `worker/ocrHandler.js`
- **Nguyên nhân:** tổng dung lượng thực chỉ được cộng sau khi multipart parser hoàn tất.
- **Cách sửa:** từ chối sớm `Content-Length` trên 25 MB, giới hạn số part/field ở Multer, rồi vẫn kiểm tra từng file và tổng byte thực sau parse.
- **Test:** request khai báo vượt giới hạn trả 413 trước scanner; file giả JPEG trả 400; ba ảnh học bạ thật tổng khoảng 13,3 MB đi qua route thành công.
- **Retest:** giới hạn 7 MB/ảnh, 12 ảnh và 24 MB tổng không thay đổi; OCR schema không đổi.

### 3. Tên file người dùng được giữ trong pipeline OCR

- **Severity:** Low
- **File:** `server/routes/scanTranscript.js`, `worker/ocrHandler.js`
- **Nguyên nhân:** tên file không được dùng làm đường dẫn hay HTML nhưng vẫn được truyền cho provider/parser.
- **Cách sửa:** tạo tên trung tính theo thứ tự và MIME đã xác minh.
- **Test:** ba file thật được backend nhận thành `hoc-ba-1.jpg`, `hoc-ba-2.jpg`, `hoc-ba-3.jpg`.
- **Retest:** nhiều ảnh vẫn giữ đúng thứ tự và loại MIME.

### 4. Phân loại JSON/body error của Express chưa chính xác

- **Severity:** Low
- **File:** `server/server.js`
- **Nguyên nhân:** lỗi parser JSON không thuộc `AppError` nên rơi vào response 500.
- **Cách sửa:** map JSON sai sang 400 và body quá lớn sang 413 mà không trả message nội bộ.
- **Test:** gửi JSON thiếu dấu đóng và body trên 100 KB.
- **Retest:** response dùng schema công khai, không có stack.

### 5. Log lỗi chưa biết có thể ghi quá nhiều dữ liệu

- **Severity:** Low
- **File:** `worker/http.js`, `server/server.js`
- **Nguyên nhân:** Worker gọi `console.error(error)`.
- **Cách sửa:** chỉ log event, tên và code đã cắt độ dài.
- **Test:** rà soát source và test provider xác nhận không ghi ảnh hoặc API key.
- **Retest:** client vẫn nhận lỗi chung; logging vận hành vẫn đủ nhận biết loại sự cố.

## Kiểm tra bổ sung

| Nhóm | Kết quả |
| --- | --- |
| XSS / DOM XSS | Không xác nhận được đường khai thác. Dữ liệu động đưa vào template được escape; OCR preview escape chuỗi và dùng `textContent` cho tên học sinh. CSP bổ sung lớp phòng thủ. |
| CSRF | Không có cookie authentication. Hai thao tác ghi/chi phí cao dùng Turnstile; CORS không cho origin tùy ý. |
| Open redirect | Không có endpoint hoặc tham số redirect. |
| Path traversal / source exposure | `/.env`, `/server/server.js`, `/_worker-data/majors.json`, đường dẫn traversal mã hóa đều trả 404 trên production. |
| Prototype pollution / mass assignment | API chỉ đọc trường đã định nghĩa và sanitize output; không merge input vào cấu hình hoặc model nội bộ. |
| Clickjacking | Đã chặn bằng CSP `frame-ancestors 'none'` và X-Frame-Options DENY. |
| Dependency / supply chain | `npm audit`: 0 lỗ hổng trên 224 dependency được npm thống kê. Không nâng version vô cớ. |
| `eval`, `new Function`, `postMessage` | Không tìm thấy trong source ứng dụng. |
| localStorage/sessionStorage | Chỉ lưu điểm biểu mẫu, trạng thái UI và nguyện vọng cá nhân trên thiết bị; không lưu API key/token/cookie. Không dùng sessionStorage. |
| OCR | MIME/signature/size được kiểm tra trước OCR; output OCR được coi là dữ liệu không tin cậy, giới hạn điểm 0–10, lớp 10–12 và đối chiếu danh mục môn trước khi điền. UI nói đúng rằng ảnh dùng để nhận diện; README nêu rõ ảnh tối ưu được gửi tới backend, Gemini/OCR.space rồi mới fallback Tesseract trên thiết bị. |
| Logic tính điểm | Các test cho 0, 10, dấu phẩy/dấu chấm, số ngoài khoảng, NaN/Infinity, môn trùng, tổ hợp và ưu tiên đều pass. Không thay đổi công thức hoặc dữ liệu tuyển sinh. |
| Production UI | Tính 4 môn 8.5/8/7.5/9 cho kết quả A01 25.50, D07 25.00, A00 24.00; tìm BKA trả Đại học Bách khoa Hà Nội; không overflow ở 1440 px hoặc 390 px; không có console warning/error. |

## Kiểm thử đã chạy

- `npm.cmd run check`
- `npm.cmd test` — 130/130 test pass
- `npm.cmd audit --json` — 0 vulnerability
- `npm.cmd run verify:data` — 326 trường, 17.617 dòng ngành, 0 lỗi dữ liệu
- `npm.cmd run audit:formulas` — 326/326 trường và 17.617/17.617 dòng ngành được ánh xạ; 6 công thức chính thức có nguồn vẫn nguyên vẹn
- `npm.cmd run audit:logos` — 319 logo được kiểm tra, không có file hỏng hoặc raster độ phân giải thấp
- `npm.cmd run cf:dry-run`
- Upload integration với ba ảnh học bạ thật do chủ website cung cấp, dùng scanner mock để không gửi ảnh ra dịch vụ thứ ba
- Retest production có kiểm soát: header, CORS, search, malformed JSON, 404, source exposure, path traversal, XSS reflection, desktop/mobile và console browser

## Strix

Đã cài Strix OSS CLI chính thức phiên bản `1.6.2` vào `%LOCALAPPDATA%\Programs\Strix\strix.exe`. Binary chạy được và đã đối chiếu checksum release. Theo quickstart chính thức, scan self-hosted cần Docker đang chạy và LLM provider key; máy hiện chưa có Docker/WSL runtime dùng được nên không thể chạy agent Strix mà không cài thêm thành phần hệ thống lớn và có thể cần quyền quản trị/khởi động lại. Audit này vì vậy dựa trên source review, test tự động, dependency audit và pentest production có kiểm soát; không giả vờ có báo cáo Strix.

Tài liệu: https://github.com/usestrix/strix/blob/main/docs/quickstart.mdx

## Remaining Issues

1. **Cloudflare Dashboard:** repository không chứng minh trạng thái Managed WAF/Bot Fight Mode, notification hoặc log retention của tài khoản. Có thể bật các mục miễn phí phù hợp trong Dashboard, nhưng không cần chúng để bản vá hiện tại hoạt động.
2. **Supabase backup/restore:** cần kiểm tra chính sách backup, export định kỳ và thử restore trong Supabase Dashboard. Không có quyền/dashboard data trong repository để xác nhận thay chủ website.
3. **Cảnh báo vận hành:** Workers Observability đã bật, nhưng alert khi tỷ lệ 5xx/OCR failure tăng cần cấu hình trong Cloudflare Dashboard nếu gói hiện tại hỗ trợ.
4. **Strix full scan:** cần Docker Desktop/WSL2 đang chạy và cấu hình LLM tương thích, hoặc đăng nhập Strix Cloud. Máy có khoảng 8 GB RAM và dung lượng đĩa hạn chế nên cần chủ máy quyết định trước khi cài Docker.
5. **Giới hạn request không có Content-Length:** ứng dụng chặn sớm multipart khi có `Content-Length`, rồi kiểm tra tổng byte thực sau parse. Request chunked không có header vẫn dựa thêm vào Turnstile, rate limit, giới hạn từng file/số file và giới hạn request của Cloudflare.
