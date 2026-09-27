# External Security Scans — Tính Điểm THPT

- **Target:** https://tinhdiemthpt.tinh-diem-thpt.workers.dev/
- **Ngày chạy:** 2026-09-27
- **Phạm vi:** các bài quét công khai, không đăng nhập, không brute force và không thử khai thác phá hoại.

## Kết quả theo dịch vụ

| Dịch vụ | Trạng thái | Kết quả chính | Xử lý |
| --- | --- | --- | --- |
| ImmuniWeb Website Security Test | Đã gọi API; chỉ trả cache | Cache cũ đạt **C+ / 45**, ghi nhận 0 thành phần lỗi thời, 0 thành phần dễ tổn thương và 0 lỗ hổng ứng dụng. Cache được tạo trước bản vá header nên vẫn báo thiếu CSP/HSTS. Yêu cầu làm mới trả `Please login to refresh test`. | Không dùng các cảnh báo header trong cache cũ để đánh giá bản hiện tại. Cần đăng nhập ImmuniWeb nếu muốn ép quét lại. Báo cáo cache: https://www.immuniweb.com/websec/?id=swejEhuR |
| Pentest-Tools Website Scanner (Light) | Hoàn tất | **0 Critical, 0 High, 0 Medium, 2 Low, 2 Info** trên 40 kiểm tra. Hai mục Low là nhận diện công nghệ và cảnh báo chung rằng CSP `script-src 'self'` có thể nguy hiểm nếu site phục vụ JSONP/Angular/file người dùng. Hai mục Info là form upload và thiếu `security.txt`. | Upload không được public và không có JSONP/Angular nên cảnh báo CSP không tạo đường khai thác đã xác nhận. Đã bổ sung `security.txt`. Báo cáo: https://pentest-tools.com/website-vulnerability-scanning/website-scanner/scans/MTnQynR2IcMv58iq |
| HostedScan | Bị chặn bởi tài khoản | OWASP ZAP/OpenVAS/Nuclei của HostedScan yêu cầu tài khoản hoặc API key để khởi chạy và lấy báo cáo. Trang public chuyển sang luồng đăng ký 14 ngày. | Không tự tạo tài khoản, gửi email hoặc thêm phương thức thanh toán. |
| Mozilla Observatory | Hoàn tất | **A+ / 120**, 12/12 bài kiểm tra đạt, 0 bài thất bại. | Không cần sửa. Báo cáo: https://developer.mozilla.org/en-US/observatory/analyze?host=tinhdiemthpt.tinh-diem-thpt.workers.dev |
| SecurityHeaders | Hoàn tất | HTTPS đạt **A+**. Khi quét HTTP chỉ đạt A vì HTTP trả 200 thay vì chuyển sang HTTPS. | Đã thêm chuyển hướng 308 HTTP → HTTPS cho `/` và `/index.html`. Báo cáo HTTPS: https://securityheaders.com/?q=https%3A%2F%2Ftinhdiemthpt.tinh-diem-thpt.workers.dev%2F |
| Qualys SSL Labs | Hoàn tất | Cả 4 địa chỉ IPv4/IPv6 đều đạt **B**. TLS 1.0/1.1/1.2/1.3 được chấp nhận; không có RC4, POODLE, Heartbleed hoặc Logjam; scanner ghi nhận BEAST do TLS cũ. | TLS của `workers.dev` là edge dùng chung của Cloudflare, không điều chỉnh được từ repository. Khi dùng tên miền riêng, đặt Minimum TLS Version 1.2 trong Cloudflare. |
| Sucuri SiteCheck | Hoàn tất, ép quét mới | Security **A (6/6)**, domain **A (1/1)**, không có malware/blacklist trong kết quả; tổng **C** do thiếu HTTP→HTTPS và OCSP stapling. | Đã sửa HTTP→HTTPS trong Worker. OCSP/certificate thuộc edge Cloudflare. Báo cáo: https://sitecheck.sucuri.net/results/https/tinhdiemthpt.tinh-diem-thpt.workers.dev |
| Quttera | Hoàn tất | **No Malicious Content Detected / Minimal Security Risk**; 0 malicious, 0 suspicious, 0 potentially suspicious, 5 file sạch, không nằm trong blacklist. | Không cần sửa. Báo cáo: https://quttera.com/detailed_report/tinhdiemthpt.tinh-diem-thpt.workers.dev |
| UpGuard WebScan | Đã gửi; dịch vụ lỗi | Form public nhận URL nhưng trang kết quả trả **Inactivity Timeout** trong cả hai lần thử. API báo cáo đầy đủ yêu cầu tài khoản/API key. | Không có kết quả tin cậy để sửa; thử lại thủ công khi UpGuard hoạt động ổn định. |
| Internet.nl | Hoàn tất | **73%**. IPv6 và RPKI đạt. Trượt DNSSEC, HTTP→HTTPS, TLS cũ/cipher/hash; cảnh báo CAA, `security.txt`; Referrer-Policy hiện tại được xếp mức thông tin. | Đã sửa HTTP→HTTPS, thêm `security.txt` và đổi Referrer-Policy thành `no-referrer`. DNSSEC, CAA và TLS của `workers.dev` chỉ xử lý đầy đủ khi dùng tên miền riêng. Báo cáo: https://internet.nl/site/tinhdiemthpt.tinh-diem-thpt.workers.dev/4318644/ |
| VirusTotal | Hoàn tất, quét mới | **1/92** engine gắn nhãn phishing (LevelBlue); Google Safe Browsing, Bitdefender, Kaspersky, Fortinet, Sucuri, Quttera và phần còn lại đánh giá sạch hoặc chưa xếp hạng. | Đây là dương tính giả đơn lẻ, không phải lỗ hổng mã nguồn. Theo dõi và gửi yêu cầu phân loại lại cho LevelBlue nếu nhãn còn tồn tại. Báo cáo: https://www.virustotal.com/gui/url/2f9c1010594f93dffab980c8502a92cf7d84d1a527c1000cfc5cd75178931c80/detection |
| Detectify | Bị chặn bởi tài khoản/xác minh domain | Application Scanning chỉ có sau khi đăng nhập trial và thêm/xác minh asset. | Không tự tạo tài khoản hoặc xác minh quyền sở hữu thay chủ website. |

## Bản vá từ kết quả quét

1. Worker trả **308** từ HTTP sang đúng URL HTTPS trước khi đọc static asset.
2. Cloudflare chạy Worker trước cho `/` và `/index.html`, đủ để chặn truy cập trang chính qua HTTP mà không đưa mọi asset qua Worker.
3. Thêm `/.well-known/security.txt` với kênh báo lỗi qua GitHub Issues, ngày hết hạn, ngôn ngữ và canonical URL; không công khai email cá nhân.
4. Đổi `Referrer-Policy` từ `strict-origin-when-cross-origin` sang `no-referrer` để không gửi nguồn truy cập sang website ngoài.

## Giới hạn còn lại

- Điểm SSL Labs B và phần lớn lỗi Internet.nl liên quan DNS/TLS dùng chung của `workers.dev`, không thể sửa bằng JavaScript hoặc cấu hình trong repository.
- Deep scan của Pentest-Tools, HostedScan và Detectify cần tài khoản, xác minh asset và có thể cần gói trả phí.
- Scanner bên ngoài chỉ quan sát bề mặt công khai. Kết quả sạch không thay thế source review, dependency audit, test upload/OCR và giám sát production.
