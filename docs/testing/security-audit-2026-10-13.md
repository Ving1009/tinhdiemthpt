# Kiểm thử bảo mật ngày 13/10/2026

## Phạm vi và cách kiểm tra

Website: https://tinhdiemthpt.id.vn/. Rà soát mã nguồn Express, Cloudflare Workers, tài khoản, bản sao dữ liệu, upload OCR, API tư vấn và kết quả thi thử. Gửi 24 yêu cầu có kiểm soát lên production: đọc trang, thử đường dẫn tệp nội bộ, gọi API khi chưa đăng nhập và gửi dữ liệu không hợp lệ. Không đăng ký tài khoản thật, đọc dữ liệu tài khoản khác, tải ảnh học bạ thật lên dịch vụ hay tạo tải để gây gián đoạn.

Các tình huống cần phiên đăng nhập, dịch vụ AI hoặc upload lớn được tái hiện bằng dữ liệu giả trên máy, bộ kiểm thử và Brave. Kết quả dưới đây mô tả những gì đã kiểm chứng; không phải cam kết website không còn bất kỳ lỗ hổng nào.

## Các lỗi đã tái hiện và sửa

### 1. Yêu cầu liên trang có thể gọi API tư vấn

Trước bản vá, API Worker nhận JSON trong `text/plain` từ Origin lạ; dịch vụ tư vấn giả vẫn được gọi. Express cũng xử lý POST từ Origin lạ. Việc không trả header CORS chỉ ngăn trang khác đọc phản hồi, không ngăn phía server xử lý yêu cầu và sử dụng hạn mức AI.

Thêm `lib/requestOrigin.js` và chặn phương thức thay đổi dữ liệu ở đầu `worker/index.js` và `server/server.js`, trước limiter, bộ đọc JSON, Turnstile và dịch vụ phía sau. Origin lạ, `null`, địa chỉ giả giống tên miền và `Sec-Fetch-Site: cross-site` bị trả 403 `INVALID_ORIGIN`. Công cụ không gửi Origin vẫn dùng được; Live Server chỉ được gọi chéo cổng khi cả nguồn và server đều là HTTP loopback.

Kiểm chứng: test trước sửa thất bại; sau sửa 5 test trong `tests/requestOrigin.test.js` đạt. Browser gọi API cùng trang vẫn trả 200 với provider giả. Biện pháp này chặn lạm dụng từ trang khác trong trình duyệt; rate limiter và các kiểm tra khác vẫn cần thiết để kiểm soát client gọi trực tiếp.

### 2. Phản hồi tài khoản cũ ảnh hưởng phiên mới giữa nhiều tab

Tái hiện ba trường hợp: tab A dùng cookie mới của B để đăng xuất; phản hồi `/auth/me` cũ khôi phục A hoặc xóa dữ liệu B; tác vụ logout của A hoàn tất sau khi local đã chuyển sang B. Ngoài dữ liệu local, phản hồi logout cũ có thể mang cookie xóa phiên và đến sau phản hồi login mới.

`public/js/account.js` gửi định danh tài khoản dự kiến khi logout, kiểm tra chủ dữ liệu trước khi áp dụng phản hồi cũ, giữ dữ liệu B và hủy auto-sync cũ. Đăng ký, đăng nhập và đăng xuất dùng cùng Web Lock để xếp thứ tự request thay đổi cookie giữa các tab. `worker/auth.js` kiểm tra tài khoản của cookie với định danh dự kiến trước khi xóa session; khi không khớp trả 409 `AUTH_ACCOUNT_CHANGED` và không gửi cookie xóa phiên.

Kiểm chứng: các test hồi quy trước sửa thất bại, sau sửa đạt. Trong Brave thật, request login ở tab thứ hai nằm trong hàng chờ Web Locks và chỉ chạy sau khi logout tab thứ nhất hoàn tất. Test đọc/ghi bản sao với ID tài khoản khác trong query/body vẫn chỉ truy cập dữ liệu thuộc session. Theme được giữ. Trình duyệt cũ không có Web Locks dùng nhánh dự phòng hiện có; kiểm tra định danh và chủ dữ liệu vẫn hoạt động nhưng việc tuần tự cookie giữa tab chưa được bảo đảm trên những trình duyệt đó.

### 3. HTML trong lịch sử thi thử được chèn vào trang kết quả

Một số bộ đếm trong kết quả đã lưu được nội suy trực tiếp vào `innerHTML`. Khi bản sao hoặc lịch sử local chứa bộ đếm giả, trang có thể tạo thẻ ảnh và liên kết dụ người dùng. Đây là lỗi hiển thị dữ liệu đã lưu; chưa chứng minh được một người lạ có thể sửa lịch sử của người khác hoặc chiếm tài khoản. CSP còn hạn chế việc chạy script inline.

`public/js/practiceExam.js` chuyển các bộ đếm thành số, xử lý điểm dạng chuỗi và bỏ qua chi tiết có cấu trúc sai. Hai test trong `tests/practiceResultSecurity.test.js` kiểm tra payload HTML và lịch sử thiếu dữ liệu.

Kiểm chứng DOM trong Brave: 0 thẻ ảnh/liên kết của payload, đủ 22 phần xem lại câu hỏi Toán và 7 hình minh họa; trang mobile rộng 390 px không tràn ngang và vẫn có 18 môn.

### 4. Upload OCR bằng chunked transfer vượt giới hạn tổng trước khi kiểm tra

Express giới hạn từng ảnh nhưng chỉ kiểm tra tổng sau khi Multer đã giữ toàn bộ ảnh trong RAM. Request không có `Content-Length` có thể đưa vào nhiều ảnh với tổng lớn hơn giới hạn của request trước khi bị từ chối.

`server/routes/scanTranscript.js` đếm byte trên luồng multipart bằng `Transform`, ngắt parser khi vượt 11 MiB, trước khi chuyển ảnh sang OCR. Giữ giới hạn 6 ảnh, 7 MiB mỗi ảnh và 10 MiB tổng nội dung ảnh. Worker đã có giới hạn luồng đọc nên không cần đổi luồng OCR production.

Kiểm chứng: test gửi hai ảnh giả 6 MiB, không có `Content-Length`, trả 413 `REQUEST_TOO_LARGE` và không gọi provider. Đây là bản vá cho backend Express khi chạy bằng Node; website production dùng Workers.

### 5. Cảnh báo bảo mật thư viện

Cập nhật lockfile tới `proxy-addr@2.0.8`, `wrangler@4.149.0`, `miniflare@5.20261006.1-alpha` và `sharp@0.35.5`; nâng mốc Wrangler trong `package.json` tương ứng. Không thêm dependency mới. `npm audit` giảm từ 4 cảnh báo xuống 0.

- [Advisory proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h): lỗi so khớp subnet liên quan địa chỉ IPv4 trong IPv6. Chưa chứng minh khai thác được trên cấu hình hiện tại: Express không bật trust proxy và production chạy Workers.
- [Advisory sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w): nằm trong công cụ phát triển Miniflare/Wrangler của repo, không phải bằng chứng có thể chạy mã trên Worker production.

## Các cơ chế đã kiểm tra và giữ nguyên

- `/api/auth/me` và `/api/auth/data` không có session trả 401; đọc/ghi bản sao ràng buộc với user của session, không dùng ID do client đưa vào.
- Kiểm thử đăng ký, đăng nhập, đăng xuất, session hết hạn, xóa session hết hạn và cookie `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` không có `Domain`.
- Scrypt và giới hạn mật khẩu tối đa 128 ký tự không bị giảm.
- Turnstile có test hostname không hợp lệ, cấu hình thiếu credential, token thiếu, sai action và sai hostname; trường hợp lỗi bị từ chối.
- Upload kiểm tra loại ảnh thật, số lượng và dung lượng; điểm đã lưu dùng cơ chế cô lập tài khoản. Không đưa ảnh học bạ hoặc khóa API vào báo cáo.
- Production trả 404 cho `.env`, `.git/config`, `package.json`, mã server và đường dẫn nội bộ `_worker-data` trực tiếp; một số đường dẫn encode trả redirect chuẩn hóa cần theo tới đích khi kiểm tra bản triển khai.
- HTTPS có HSTS, CSP, `X-Frame-Options: DENY` và `X-Content-Type-Options: nosniff`. OCR Worker riêng không mở endpoint công khai; provider dùng endpoint cấu hình cố định.

## Kết quả kiểm thử sau sửa

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run check` và `node --check lib/requestOrigin.js` | Đạt |
| `npm test` | 466/466 đạt, không bỏ qua; thêm 12 test so với 454 test trước tác vụ |
| `npm run verify:data` | Đạt; các ghi chú dữ liệu đã có vẫn được báo |
| `npm run audit:formulas` | Đạt; vẫn phân biệt công thức chưa xác minh, không sửa dữ liệu tuyển sinh |
| `npm run cf:dry-run` | Đạt cho cả OCR Worker và main Worker |
| `npm audit` | 0 cảnh báo ở thời điểm kiểm tra |
| Brave desktop/mobile và hai tab | Đạt các trường hợp DOM, Web Locks, API cùng trang và phòng thi |

Log trước/sau sửa và kết quả chi tiết nằm trong `.local/security-*.log` trên máy, không đưa vào Git vì chứa đầu ra kiểm thử tạm. Bản vá không thay đổi dữ liệu tuyển sinh, công thức tính điểm hoặc thiết kế giao diện.
