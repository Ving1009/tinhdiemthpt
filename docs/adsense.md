# Google AdSense

Publisher công khai: `ca-pub-5701300811077965`.

## Phạm vi trong bản sửa final audit ngày 12/10/2026

Mã quảng cáo chỉ tải trên **8 bài cẩm nang** khi đủ điều kiện cấu hình và đồng ý. `ADSENSE_PAGE_PATHS` gồm 16 đường dẫn: 8 URL canonical và 8 alias `index.html` của cùng các bài đó. Trang thư viện cẩm nang không thuộc phạm vi này.

| Loại trang | Tải mã quảng cáo |
| --- | --- |
| 8 bài hướng dẫn trong `/cam-nang/<slug>/` | Có điều kiện |
| Trang chủ, công cụ tính điểm, tra cứu tổ hợp/trường/ngành | Không |
| Phòng thi, hộp thoại tài khoản, trợ lý | Không |
| Thư viện cẩm nang, Giới thiệu, Liên hệ, nguồn dữ liệu, điều khoản, quyền riêng tư | Không |
| API, lỗi, redirect, ảnh, PDF, JavaScript và tài nguyên khác | Không |

Danh sách HTML công khai được tách riêng thành `PUBLIC_HTML_PATHS`: 46 đường dẫn/alias tương ứng **23 URL canonical**. Hồ sơ trường/ngành hợp lệ có URL động và HTML tóm tắt từ dataset hiện có, nhưng không tải quảng cáo. Không lấy số trang HTML hay số URL trong sitemap làm số trang quảng cáo hoặc số trang đã được Google index.

Bản sửa `aad3068` đã được push và deploy theo yêu cầu tiếp theo. Kiểm tra production xác nhận loader chỉ có ở 8 bài cẩm nang. Sau đó chủ website yêu cầu khôi phục 17 bộ đề đầy đủ cùng đề luyện Ngữ văn; phạm vi quảng cáo ở phòng thi vẫn tắt. [Báo cáo cuối](final-adsense-readiness-audit.md) lưu ghi nhận trước khôi phục và chú thích cập nhật.

## Cách phục vụ HTML

Express và Worker dùng `isPublicHtmlPage()` để nhận diện HTML; `isAdSenseContentPage()` chỉ quyết định trang đủ điều kiện quảng cáo. `run_worker_first` bảo đảm HTML từ Static Assets được xử lý bởi Worker. HTML thành công được gắn mã xác minh khi publisher hợp lệ; HEAD không gửi body. API, 301/404 và tài nguyên giữ đúng loại phản hồi.

Mỗi HTML có nonce mới cho script và dùng `Cache-Control: no-store`, kể cả khi không có quảng cáo. CSS/JS giữ cơ chế revalidation hiện có; ảnh thương hiệu có cache riêng. Trang quảng cáo có đúng một loader, không tự chèn lại khi lọc, sửa điểm hoặc chuyển view bằng History API. Bản sửa không thêm slot hay cơ chế refresh quảng cáo.

`/ads.txt` trả 200 với cấu hình publisher hợp lệ:

```text
google.com, pub-5701300811077965, DIRECT, f08c47fec0942fa0
```

Các biến hiện có `ADSENSE_CLIENT`, `ADSENSE_ENABLED`, `ADSENSE_CMP_READY` không bị thay đổi trong audit. Publisher không hợp lệ không bật quảng cáo. Đặt `ADSENSE_ENABLED=false` ngừng tải mã. Không chạy `cf:secrets` hay gửi lại yêu cầu xét duyệt trong tác vụ này.

## CSP và Cloudflare

Trang có quảng cáo giữ CSP nonce/`strict-dynamic` theo [hướng dẫn tích hợp của Google](https://support.google.com/adsense/answer/16283098?hl=vi). Quyền `unsafe-eval` và tài nguyên quảng cáo HTTPS chỉ áp dụng cho HTML đang bật quảng cáo. Không thêm quyền script `unsafe-inline` hoặc nguồn HTTP. Chính sách này không được dùng cho API, công cụ hoặc worker OCR.

HTML không quảng cáo giữ CSP nguồn cụ thể, bổ sung nonce cho JavaScript Detections, `https://static.cloudflareinsights.com` cho beacon script và `https://cloudflareinsights.com` cho request đo lường. Script inline không có nonce vẫn bị chặn. Tesseract chỉ có quyền WebAssembly trong worker của nó. HSTS, chặn iframe ngoài và các header bảo vệ hiện có được giữ nguyên.

Các nguồn Cloudflare cần thiết được đối chiếu với [hướng dẫn JavaScript Detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/) và [CSP cho Web Analytics](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/). Kiểm thử bằng script/beacon giả lập kiểm tra quyền CSP; không xác nhận cấu hình WAF hay script đang được Cloudflare chèn thực tế trên production.

## Đồng ý và quyền riêng tư

Khi `ADSENSE_CMP_READY=false`, không tải quảng cáo ở EEA, Anh, Thụy Sĩ hoặc khi chưa xác định được quốc gia. Cloudflare dùng `request.cf.country`, không tin header quốc gia khách tự gửi. Express không có nguồn địa lý tin cậy nên chỉ bật quảng cáo sau khi CMP được đánh dấu sẵn sàng.

Loader giữ `data-privacy-treatments="disablePersonalization"` cho mọi người dùng, kể cả người dưới 18 tuổi. Không cá nhân hóa vẫn có thể dùng cookie; không thay thế yêu cầu đồng ý. Cờ `ADSENSE_CMP_READY=true` chỉ là cấu hình, không chứng minh CMP được Google chứng nhận đã xuất bản và hoạt động đúng.

Nút “Lựa chọn quảng cáo” dùng API mở lại của Google CMP, chỉ hiện khi có API và xác nhận GDPR áp dụng. Nội dung/công cụ vẫn dùng được nếu CMP hoặc quảng cáo bị chặn. Thời hạn dữ liệu khách 15 phút không áp dụng cho cookie quảng cáo hay tài khoản.

## Việc cần kiểm tra trong tài khoản trước xét duyệt

1. Sau khi cho phép phát hành, xác minh phạm vi loader thực tế: 1 trên bài đủ điều kiện, 0 trên công cụ, hồ sơ, phòng thi và chính sách. Mở lại ở cửa sổ mới và kiểm tra response/canonical để tránh nhầm bản cache cũ.
2. Kiểm tra CMP trong **Privacy & messaging**: domain đúng, thông báo xuất bản, đồng ý/từ chối/mở lại có hiệu lực ở vùng áp dụng. Không dùng cờ trong repo để kết luận mục này đã đạt.
3. Trong **Ads → By site**, xem trước desktop/mobile, kiểm tra vị trí và page/area exclusions. Đường dẫn chính sách là `https://tinhdiemthpt.id.vn/privacy`. Không đặt quảng cáo che mục lục, điều hướng, liên kết hoặc nội dung bài.
4. Kiểm tra **Sites**, ads.txt và các vấn đề được Google ghi trong tài khoản. Chủ website quyết định thời điểm gửi lại sau khi xử lý checklist trong báo cáo cuối.

Không dùng trình duyệt QA để nhấp quảng cáo hoặc tạo traffic thử. Audit chặn request quảng cáo thực, không xác nhận tỷ lệ lấp đầy, hiệu năng có quảng cáo hay quyết định phê duyệt.

## Lịch sử

Các báo cáo [google-policy-review.md](google-policy-review.md) và [adsense-content-improvement.md](adsense-content-improvement.md) ghi các đợt trước. Lần mở rộng quảng cáo ra 23 URL từng có 434/434 test; final audit thu hẹp về 8 bài và bổ sung kiểm thử. Các ghi nhận cấu hình tài khoản ngày 03/10 không thay thế việc kiểm tra lại CMP, Auto ads và trạng thái xét duyệt hiện tại.

Tài liệu thêm: [ads.txt](https://support.google.com/adsense/answer/12171612?hl=vi), [Auto ads](https://support.google.com/adsense/answer/9261307?hl=vi), [CMP](https://support.google.com/adsense/answer/13554116?hl=vi), [vị trí quảng cáo](https://support.google.com/adsense/answer/1346295?hl=vi).
