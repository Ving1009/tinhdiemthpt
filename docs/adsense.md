# Google AdSense

Publisher: `ca-pub-5701300811077965`. Đây là mã công khai của tài khoản, không phải API key.

Website tự gắn meta xác minh tài khoản và mã AdSense trong `<head>`, đồng thời phục vụ [ads.txt](https://tinhdiemthpt.id.vn/ads.txt):

```text
google.com, pub-5701300811077965, DIRECT, f08c47fec0942fa0
```

Cloudflare dùng ba biến công khai trong `wrangler.jsonc`: `ADSENSE_CLIENT`, `ADSENSE_ENABLED`, `ADSENSE_CMP_READY`. Chạy Express dùng các biến tương ứng trong `.env`. Đặt `ADSENSE_ENABLED=false` để ngừng tải mã quảng cáo.

## Hoàn tất trong tài khoản AdSense

1. Trong **Sites**, thêm `tinhdiemthpt.id.vn`, xác minh bằng meta tài khoản hoặc ads.txt và gửi Google xét duyệt. Chỉ Google quyết định việc phê duyệt và phân phối quảng cáo.
2. Trong **Privacy & messaging**, tạo và xuất bản thông báo đồng ý theo yêu cầu của Google, dùng CMP được Google chứng nhận. Liên kết chính sách quyền riêng tư là `https://tinhdiemthpt.id.vn/#privacy-policy`. Sau khi CMP đã xuất bản và kiểm tra, đổi `ADSENSE_CMP_READY` thành `true` rồi deploy.
3. Trong **Ads → By site**, bật **Auto ads** cho website. Dùng bản xem trước để kiểm tra PC và điện thoại. Nên tắt quảng cáo phủ màn hình, quảng cáo ghim và các định dạng làm che nút tính điểm, quét học bạ hoặc bài thi. Loại trừ các vùng nhập điểm, kết quả, tài khoản, trợ lý và bài thi khỏi vị trí quảng cáo tự động.

Mã của website không tự làm mới quảng cáo khi người dùng sửa điểm hay chuyển hash, không tạo đơn vị quảng cáo riêng trong hộp thoại tài khoản hoặc trò chuyện, và không thay đổi CSS để ép kích thước quảng cáo. Google quyết định vị trí Auto ads theo cấu hình tài khoản, nên cần kiểm tra và loại trừ vùng tương tác trong bản xem trước; không thể thiết lập các tùy chọn đó chỉ bằng mã publisher.

## CSP và quyền riêng tư

HTML có quảng cáo dùng nonce ngẫu nhiên mới cho mỗi phản hồi và CSP theo cơ chế strict-dynamic của Google. Chỉ chính sách này cho phép `unsafe-eval` mà AdSense hỗ trợ, CSS nội tuyến và tài nguyên quảng cáo HTTPS; các script nội tuyến không có nonce vẫn bị chặn. API, xác minh tài khoản và worker Tesseract giữ CSP hiện có.

Khi `ADSENSE_CMP_READY=false`, mã quảng cáo không tải ở EEA, Anh, Thụy Sĩ hoặc khi chưa xác định được quốc gia. Các lượt truy cập đó vẫn có meta xác minh và dùng đầy đủ công cụ. Cloudflare lấy quốc gia từ `request.cf.country`, không tin header do khách tự gửi. Express không có nguồn geography tin cậy nên chỉ tải quảng cáo sau khi CMP đã sẵn sàng.

Chính sách quyền riêng tư đã bổ sung việc sử dụng cookie quảng cáo và cách quản lý lựa chọn. Thời hạn 15 phút của dữ liệu khách không áp dụng cho cookie bên quảng cáo.

Tài liệu Google: [tích hợp CSP](https://support.google.com/adsense/answer/16283098?hl=en), [ads.txt](https://support.google.com/adsense/answer/12171612?hl=vi), [Auto ads](https://support.google.com/adsense/answer/9261307?hl=vi), [yêu cầu CMP](https://support.google.com/adsense/answer/13554116?hl=vi), [vị trí quảng cáo](https://support.google.com/adsense/answer/1346295?hl=vi).
