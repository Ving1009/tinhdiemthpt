# Google AdSense

Publisher: `ca-pub-5701300811077965`. Đây là mã công khai của tài khoản, không phải API key.

## Phạm vi quảng cáo từ 12/10/2026

Theo yêu cầu mới của người vận hành, mã AdSense có thể tải trên toàn bộ 15 trang HTML công khai: trang chủ/các công cụ hash, thư viện và 8 bài cẩm nang, 4 trang thông tin, cùng trang quyền riêng tư. Các alias HTML hiện có cũng dùng cùng cấu hình. Bài mới cần được kiểm tra nội dung, ví dụ, nguồn và liên kết trước khi thêm vào danh mục.

Các màn hình tính điểm, tìm ngành, hồ sơ, phòng thi và tài khoản dùng chung HTML trang chủ nên dùng chung một lần tải mã. API, tài sản như ảnh/PDF/JavaScript, redirect và lỗi HTTP giữ kiểu phản hồi hiện có. Meta xác minh và ads.txt tiếp tục dùng publisher ở trên.

`ADSENSE_PAGE_PATHS` trong `lib/adsense.js` áp dụng cùng danh sách cho Express và Worker. Các URL HTML công khai đi qua Worker bằng `run_worker_first` để tích hợp có hiệu lực trên Static Assets. Chỉ phản hồi HTML 200 cho GET/HEAD được xử lý. HEAD trả body rỗng; redirect và 404 giữ đúng. Trang có quảng cáo dùng nonce mới và `no-store`; API và worker OCR giữ CSP riêng.

Khi quảng cáo tắt hoặc chưa đủ điều kiện CMP/geography, root vẫn có nonce HTML riêng cho Cloudflare, CSP mặc định và `no-store`. Thay đổi phạm vi không bỏ kiểm tra publisher, vùng truy cập hoặc yêu cầu đồng ý.

Nút “Lựa chọn quảng cáo” có ở chân ứng dụng, bài viết và trang quyền riêng tư, dùng chung `public/js/adConsent.js`. Chỉ hiện khi CMP có API mở lại và xác nhận GDPR áp dụng. CMP bị chặn hoặc lỗi không làm chặn nội dung. Mock của test không xác nhận cấu hình CMP thực tế.

Lần rà soát trước đó giới hạn quảng cáo vào 8 bài cẩm nang được ghi trong [google-policy-review.md](google-policy-review.md); yêu cầu mới này thay đổi phạm vi tải mã. Việc tải mã không xác nhận mọi vị trí được Google cho phép hoặc chắc chắn có quảng cáo. Script deploy không tự gửi yêu cầu xét duyệt Google.

Kiểm chứng lần mở rộng phạm vi: `npm run check`, **434/434 test** và `npm run cf:dry-run` đạt. Wrangler với Static Assets thật phục vụ 15 trang GET/HEAD và 15 alias đúng trạng thái, nonce mới, một loader mỗi HTML; API/vendor/lỗi giữ chính sách riêng. Brave kiểm tra 15 trang ở 1366/390 px, nút consent bằng mock và các công cụ chính; chuyển qua 9 mục hash vẫn giữ đúng một loader/một yêu cầu quảng cáo. Request quảng cáo được chặn trong QA để tránh tạo lượt hiển thị hoặc click thử.

## Lịch sử cấu hình tài khoản

Những thông tin ngày 03/10 bên dưới ghi lại lần cấu hình trước, không chứng minh trạng thái phê duyệt, CMP hay vị trí quảng cáo hiện tại. Cần kiểm tra lại trong tài khoản.

Ngày 03/10/2026: Google đã xác minh quyền sở hữu website qua ads.txt và nhận yêu cầu xét duyệt. Thông báo Google CMP đã xuất bản cho tên miền này, có ba lựa chọn đồng ý, không đồng ý và quản lý lựa chọn; URL chính sách là `/privacy.html`. `ADSENSE_CMP_READY=true` tương ứng với cấu hình đã xuất bản trong tài khoản.

Auto ads đã bật cho banner trong trang. Đã tắt cả ba định dạng lớp phủ, định dạng dựa trên ý định, Multiplex, tự tối ưu và tự tìm thêm vị trí trong bài viết. Giới hạn banner đặt ở mức thấp nhất giao diện cho phép (tối đa 6), khoảng cách ở mức cao nhất (60 trên thang của AdSense). Tiền tố `/privacy` đã được loại trừ. Bản xem trước AdSense hiện chưa tải được website, nên chưa xác minh được từng vị trí banner hoặc cấu hình loại trừ vùng nhập điểm/bài thi; kiểm tra lại khi Google duyệt và bản xem trước hoạt động.

Website tự gắn meta xác minh tài khoản; toàn bộ HTML công khai đủ điều kiện CMP/geography được gắn mã AdSense trong `<head>`. Website tiếp tục phục vụ [ads.txt](https://tinhdiemthpt.id.vn/ads.txt):

```text
google.com, pub-5701300811077965, DIRECT, f08c47fec0942fa0
```

Cloudflare dùng ba biến công khai trong `wrangler.jsonc`: `ADSENSE_CLIENT`, `ADSENSE_ENABLED`, `ADSENSE_CMP_READY`. Chạy Express dùng các biến tương ứng trong `.env`. Đặt `ADSENSE_ENABLED=false` để ngừng tải mã quảng cáo.

## Hoàn tất trong tài khoản AdSense

1. Trong **Sites**, thêm `tinhdiemthpt.id.vn`, xác minh bằng meta tài khoản hoặc ads.txt và gửi Google xét duyệt. Chỉ Google quyết định việc phê duyệt và phân phối quảng cáo.
2. Trong **Privacy & messaging**, tạo và xuất bản thông báo đồng ý theo yêu cầu của Google, dùng CMP được Google chứng nhận. Liên kết chính sách quyền riêng tư là `https://tinhdiemthpt.id.vn/privacy`. Sau khi CMP đã xuất bản và kiểm tra, đổi `ADSENSE_CMP_READY` thành `true` rồi deploy.
3. Trong **Ads → By site**, xem trước cả công cụ và các trang nội dung trên PC/điện thoại. Kiểm tra quảng cáo không che ô nhập điểm, câu hỏi, đồng hồ, nút gửi, mục lục hoặc điều hướng. Rà lại page/area exclusions trong tài khoản: lần cấu hình ngày 03/10 đã loại trừ `/privacy`, nên thay đổi mã không tự xóa loại trừ đó.

Website tải mã AdSense một lần cho mỗi HTML. Sửa điểm, chuyển hash, mở tài khoản hoặc trò chuyện không tự chèn lại mã hay yêu cầu làm mới quảng cáo. Google quyết định vị trí Auto ads theo trạng thái phê duyệt, lựa chọn đồng ý và cấu hình tài khoản; cần kiểm tra bằng bản xem trước.

## CSP và quyền riêng tư

HTML có quảng cáo dùng nonce ngẫu nhiên mới cho mỗi phản hồi và CSP theo cơ chế strict-dynamic của Google. Chỉ chính sách này cho phép `unsafe-eval` mà AdSense hỗ trợ, CSS nội tuyến và tài nguyên quảng cáo HTTPS; các script nội tuyến không có nonce vẫn bị chặn. Trang có quảng cáo dùng Referrer-Policy `strict-origin` để Google CMP nhận tên miền, không gửi đường dẫn hay query. API và worker Tesseract giữ CSP và `no-referrer` hiện có. Trang `privacy.html` dùng module nội dung nhẹ để mở lại lựa chọn quảng cáo; nội dung chính sách vẫn đồng bộ với hộp thoại trong `main.js`.

Khi `ADSENSE_CMP_READY=false`, mã quảng cáo không tải ở EEA, Anh, Thụy Sĩ hoặc khi chưa xác định được quốc gia. Các lượt truy cập đó vẫn có meta xác minh và dùng đầy đủ công cụ. Cloudflare lấy quốc gia từ `request.cf.country`, không tin header do khách tự gửi. Express không có nguồn geography tin cậy nên chỉ tải quảng cáo sau khi CMP đã sẵn sàng.

Chính sách quyền riêng tư đã bổ sung việc sử dụng cookie quảng cáo và cách quản lý lựa chọn. Thời hạn 15 phút của dữ liệu khách không áp dụng cho cookie bên quảng cáo.

Nút “Lựa chọn quảng cáo” ở chân bài viết chỉ hiện khi Google CMP đã sẵn sàng, có API mở lại và xác nhận GDPR áp dụng cho khách. Nút gọi API chính thức để mở lại thông báo và cho phép đổi hoặc rút lại lựa chọn. Nút không hiện khi quảng cáo/CMP chưa tải hoặc đã bị trình duyệt chặn. Yêu cầu không cá nhân hóa không có nghĩa được bỏ qua đồng ý hoặc quảng cáo không dùng cookie.

Tài liệu Google: [tích hợp CSP](https://support.google.com/adsense/answer/16283098?hl=en), [ads.txt](https://support.google.com/adsense/answer/12171612?hl=vi), [Auto ads](https://support.google.com/adsense/answer/9261307?hl=vi), [yêu cầu CMP](https://support.google.com/adsense/answer/13554116?hl=vi), [vị trí quảng cáo](https://support.google.com/adsense/answer/1346295?hl=vi).
