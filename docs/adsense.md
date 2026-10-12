# Google AdSense

Publisher: `ca-pub-5701300811077965`. Đây là mã công khai của tài khoản, không phải API key.

## Phạm vi quảng cáo từ 12/10/2026

Mã AdSense chỉ tải trên 8 bài cẩm nang có đường dẫn chính xác trong `content/admissionsGuides.js`. Bài mới cần được kiểm tra nội dung, ví dụ, nguồn và liên kết trước khi thêm vào module này. Không tạo hàng loạt bài chỉ đổi tên trường hoặc từ khóa để tăng số URL.

Trang chủ và các công cụ hash, tài khoản, phòng thi, thư viện cẩm nang, trang pháp lý, tài liệu rời, API và lỗi không tải mã quảng cáo. Trang công cụ vẫn có meta xác minh và ads.txt. Đây là biện pháp kiểm soát vị trí, không kết luận Google đã xác định trang công cụ vi phạm.

`lib/adsense.js` áp dụng cùng danh sách cho Express và Worker. `/cam-nang/*` đi qua Worker để việc giới hạn có hiệu lực trên Static Assets. HEAD trả body rỗng; redirect và 404 giữ đúng. Trang có quảng cáo dùng nonce mới và `no-store`; công cụ/API giữ CSP cũ.

Root không quảng cáo dùng nonce HTML riêng với `script-src 'self'` và Cloudflare hiện có, để xác minh có thể dùng nonce mà không mở quyền AdSense. Không thêm eval hoặc `unsafe-inline`; mỗi GET/HEAD dùng nonce mới và `no-store`. API/vendor giữ CSP cũ.

Nút “Lựa chọn quảng cáo” đã có ở chân bài viết, dùng chung `public/js/adConsent.js`. Chỉ hiện khi CMP có API mở lại và xác nhận GDPR áp dụng. CMP bị chặn hoặc lỗi không làm chặn nội dung. Mock của test không xác nhận cấu hình CMP thực tế.

Xem bằng chứng và giới hạn trong [google-policy-review.md](google-policy-review.md). Không tự gửi yêu cầu xét duyệt Google từ script deploy.

## Lịch sử cấu hình tài khoản

Những thông tin ngày 03/10 bên dưới ghi lại lần cấu hình trước, không chứng minh trạng thái phê duyệt, CMP hay vị trí quảng cáo hiện tại. Cần kiểm tra lại trong tài khoản.

Ngày 03/10/2026: Google đã xác minh quyền sở hữu website qua ads.txt và nhận yêu cầu xét duyệt. Thông báo Google CMP đã xuất bản cho tên miền này, có ba lựa chọn đồng ý, không đồng ý và quản lý lựa chọn; URL chính sách là `/privacy.html`. `ADSENSE_CMP_READY=true` tương ứng với cấu hình đã xuất bản trong tài khoản.

Auto ads đã bật cho banner trong trang. Đã tắt cả ba định dạng lớp phủ, định dạng dựa trên ý định, Multiplex, tự tối ưu và tự tìm thêm vị trí trong bài viết. Giới hạn banner đặt ở mức thấp nhất giao diện cho phép (tối đa 6), khoảng cách ở mức cao nhất (60 trên thang của AdSense). Tiền tố `/privacy` đã được loại trừ. Bản xem trước AdSense hiện chưa tải được website, nên chưa xác minh được từng vị trí banner hoặc cấu hình loại trừ vùng nhập điểm/bài thi; kiểm tra lại khi Google duyệt và bản xem trước hoạt động.

Website tự gắn meta xác minh tài khoản; chỉ bài cẩm nang đủ điều kiện được gắn mã AdSense trong `<head>`. Website tiếp tục phục vụ [ads.txt](https://tinhdiemthpt.id.vn/ads.txt):

```text
google.com, pub-5701300811077965, DIRECT, f08c47fec0942fa0
```

Cloudflare dùng ba biến công khai trong `wrangler.jsonc`: `ADSENSE_CLIENT`, `ADSENSE_ENABLED`, `ADSENSE_CMP_READY`. Chạy Express dùng các biến tương ứng trong `.env`. Đặt `ADSENSE_ENABLED=false` để ngừng tải mã quảng cáo.

## Hoàn tất trong tài khoản AdSense

1. Trong **Sites**, thêm `tinhdiemthpt.id.vn`, xác minh bằng meta tài khoản hoặc ads.txt và gửi Google xét duyệt. Chỉ Google quyết định việc phê duyệt và phân phối quảng cáo.
2. Trong **Privacy & messaging**, tạo và xuất bản thông báo đồng ý theo yêu cầu của Google, dùng CMP được Google chứng nhận. Liên kết chính sách quyền riêng tư là `https://tinhdiemthpt.id.vn/privacy`. Sau khi CMP đã xuất bản và kiểm tra, đổi `ADSENSE_CMP_READY` thành `true` rồi deploy.
3. Trong **Ads → By site**, xem trước các bài cẩm nang trên PC và điện thoại. Kiểm tra quảng cáo không che mục lục, liên kết, nút điều hướng hoặc nội dung. Trang công cụ, tài khoản và bài thi đã không tải mã quảng cáo từ website.

Mã của website không tải hoặc làm mới quảng cáo khi người dùng sửa điểm, chuyển hash, mở tài khoản hay trò chuyện. Google quyết định vị trí Auto ads trên bài đủ điều kiện theo cấu hình tài khoản; cần kiểm tra bằng bản xem trước. Cấu hình tài khoản không thể bật quảng cáo trên trang không tải mã AdSense.

## CSP và quyền riêng tư

HTML có quảng cáo dùng nonce ngẫu nhiên mới cho mỗi phản hồi và CSP theo cơ chế strict-dynamic của Google. Chỉ chính sách này cho phép `unsafe-eval` mà AdSense hỗ trợ, CSS nội tuyến và tài nguyên quảng cáo HTTPS; các script nội tuyến không có nonce vẫn bị chặn. Trang có quảng cáo dùng Referrer-Policy `strict-origin` để Google CMP nhận tên miền, không gửi đường dẫn hay query. API, trang chính sách riêng và worker Tesseract giữ CSP và `no-referrer` hiện có. Trang `privacy.html` không tải quảng cáo hoặc thông báo đồng ý; cập nhật nội dung cùng với hộp thoại chính sách trong `main.js`.

Khi `ADSENSE_CMP_READY=false`, mã quảng cáo không tải ở EEA, Anh, Thụy Sĩ hoặc khi chưa xác định được quốc gia. Các lượt truy cập đó vẫn có meta xác minh và dùng đầy đủ công cụ. Cloudflare lấy quốc gia từ `request.cf.country`, không tin header do khách tự gửi. Express không có nguồn geography tin cậy nên chỉ tải quảng cáo sau khi CMP đã sẵn sàng.

Chính sách quyền riêng tư đã bổ sung việc sử dụng cookie quảng cáo và cách quản lý lựa chọn. Thời hạn 15 phút của dữ liệu khách không áp dụng cho cookie bên quảng cáo.

Nút “Lựa chọn quảng cáo” ở chân bài viết chỉ hiện khi Google CMP đã sẵn sàng, có API mở lại và xác nhận GDPR áp dụng cho khách. Nút gọi API chính thức để mở lại thông báo và cho phép đổi hoặc rút lại lựa chọn. Nút không hiện khi quảng cáo/CMP chưa tải hoặc đã bị trình duyệt chặn. Yêu cầu không cá nhân hóa không có nghĩa được bỏ qua đồng ý hoặc quảng cáo không dùng cookie.

Tài liệu Google: [tích hợp CSP](https://support.google.com/adsense/answer/16283098?hl=en), [ads.txt](https://support.google.com/adsense/answer/12171612?hl=vi), [Auto ads](https://support.google.com/adsense/answer/9261307?hl=vi), [yêu cầu CMP](https://support.google.com/adsense/answer/13554116?hl=vi), [vị trí quảng cáo](https://support.google.com/adsense/answer/1346295?hl=vi).
