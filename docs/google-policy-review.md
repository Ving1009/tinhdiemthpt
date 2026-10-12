# Đối chiếu ba chính sách Google — 12/10/2026

Website: https://tinhdiemthpt.id.vn/. Phạm vi: mã nguồn, các mục công cụ, 15 trang HTML công khai, nội dung luyện tập, cách tải quảng cáo và đường dẫn phục vụ người đọc/crawler.

## Chính sách được đọc

| Tài liệu | Áp dụng trong lần rà soát |
| --- | --- |
| [Nội dung và trải nghiệm người dùng trên AdSense](https://support.google.com/adsense/answer/10015918?hl=vi) | Nội dung có giá trị riêng, đủ thông tin, điều hướng dễ dùng; tránh sao chép hoặc đổi từ máy móc để tạo bài. Không có ngưỡng số từ bảo đảm được duyệt. |
| [Hình phạt thủ công — nội dung chất lượng thấp](https://support.google.com/webmasters/answer/9044175?hl=vi#thin-content) | Kiểm tra nội dung cóp nhặt, trang ngõ và nội dung không bổ sung giá trị. Đây là hướng dẫn Search Console, không tự chứng minh website đang có hình phạt hoặc bị từ chối AdSense vì cùng lý do. |
| [Chính sách Search áp dụng cho quảng cáo Google](https://support.google.com/publisherpolicies/answer/11035931?hl=vi) | Không đặt quảng cáo trên màn hình vi phạm chính sách Search, tránh nhồi từ khóa và hứa chức năng không cung cấp. Tài liệu này không phải chính sách riêng về màn hình trống. |

Không đối xử khác với Googlebot để che nội dung. Không dùng bài đăng hàng loạt, từ khóa ẩn, đánh dấu tác giả/chuyên môn không có thật hoặc lời hứa chính xác tuyệt đối để xử lý từ chối.

## Điểm đã có và được giữ

- 8 bài cẩm nang có nội dung riêng, ví dụ, nguồn chính thức, mục lục, liên kết công cụ và bài liên quan. Bài đọc được không cần đăng nhập hoặc JavaScript. Không tạo thêm bài chỉ để đạt một số lượng hay số từ.
- Các trang giới thiệu, liên hệ, điều khoản, nguồn dữ liệu và quyền riêng tư có URL riêng, canonical và liên kết hỗ trợ. Không công khai tên cá nhân theo lựa chọn của bên vận hành.
- 2027 là năm thí sinh chuẩn bị; dữ liệu, quy tắc và đề 2026 được ghi rõ là tham khảo. Không biến điểm chuẩn năm trước thành điểm chuẩn tương lai, không khẳng định kết quả là trúng tuyển.
- Công cụ tính điểm, học bạ/OCR, công thức trường, tổ hợp, tìm ngành, hồ sơ, nguyện vọng/PDF, thi thử, tài khoản và trợ lý giữ chức năng hiện có. Không dùng nút công cụ để dẫn tới quảng cáo.
- Sitemap chỉ chứa 15 URL công khai chính tắc; API và dữ liệu nội bộ không thành trang kết quả tìm kiếm. URL thiếu trả 404; không trả trang chủ giả thay cho mọi đường dẫn.
- Không thấy mẫu trang ngõ, nhồi từ khóa hay redirect theo User-Agent trong các trang được kiểm tra. Kiểm tra này không thay cho toàn bộ báo cáo Search Console.

## Vấn đề được sửa

### 1. Phạm vi quảng cáo quá rộng

Trước sửa, AdSense được chèn vào `/` và `/index.html` khi cấu hình cho phép. Các hash công cụ, tài khoản và bài thi dùng chung tài liệu đó, nên server không phân biệt được màn hình đang mở.

Sau sửa, chỉ 8 URL bài cẩm nang có trong module nội dung được tải mã quảng cáo. Trang công cụ vẫn có meta xác minh và ads.txt; thư viện, trang pháp lý, tài liệu rời, API, lỗi và redirect không tải mã. Đây là biện pháp phòng ngừa vị trí không phù hợp, không khẳng định Google đã xác định mọi màn hình công cụ vi phạm.

File: `lib/adsense.js`, `server/server.js`, `worker/index.js`, `wrangler.jsonc`. Giữ kiểm tra CMP/geography, không cá nhân hóa, nonce mới, CSP, HEAD và trạng thái HTTP. `/cam-nang/*` đi qua Worker để kiểm soát thực tế trên Static Assets; asset và API khác giữ cơ chế hiện có.

Sau khi bỏ quảng cáo ở trang công cụ, root dùng nonce HTML riêng để Cloudflare có thể gắn xác minh vào nonce đó. `lib/securityHeaders.js` chỉ thêm nonce vào `script-src 'self'` hiện có, không bật quyền AdSense, `unsafe-inline`, eval hay HTTPS tùy ý cho công cụ. Root có nonce mới mỗi GET/HEAD và `no-store`; API/vendor giữ CSP cũ.

### 2. Mở lại lựa chọn đồng ý trên bài viết

Trước sửa, nút quản lý lựa chọn chỉ có trong ứng dụng chính. Khi bài viết có quảng cáo, người đọc cũng cần mở lại thông báo tại đó.

File: `public/js/adConsent.js`, `public/js/main.js`, `public/js/content.js`, `lib/contentPages.js`, các HTML sinh. Nút chỉ xuất hiện khi CMP có API phù hợp và xác nhận vùng áp dụng. CMP bị chặn hoặc lỗi không làm chặn nội dung/công cụ. Không suy ra đồng ý từ cấu hình `ADSENSE_CMP_READY`.

### 3. Nhãn nguồn đề và đáp án gây hiểu nhầm

17 bộ tài liệu dùng `sourceKind=official-paper`, nhưng nguồn chỉ ghi người dùng cung cấp. Trước sửa UI tự suy ra “Đề chính thức” từ loại dữ liệu.

File: `public/js/practiceExam.js`, `public/index.html`, `content/projectPages.js`, HTML nguồn dữ liệu. Nhãn đổi thành tài liệu tham khảo 2026; thẻ, bài đang làm và kết quả đều ghi nguồn. Tên/mã trong tài liệu giữ để nhận diện, kèm giới hạn xác minh. Đáp án số hóa, nguồn đối chiếu và lời giải tham khảo được phân biệt; không nói một liên kết đáp án tự chứng minh nguồn chính thức. Không đổi ID, bài làm đã lưu hoặc cách chấm.

### 4. Nội dung Sinh học không khớp trang đề

Đối chiếu ảnh đã lưu phát hiện 6 câu Phần III không khớp đề nguồn; hai trang đề lại nằm trong nhóm ảnh lời giải. Một số lời giải mất ký hiệu gene, allele và phép tính.

File: `public/js/data/officialQuestionContent2026.js`, `public/js/data/officialPracticeExams2026.js`, `public/js/data/officialSolutions2026.js`. Chỉ khôi phục phần đọc được trên ảnh nguồn, dùng Unicode để giữ ký hiệu. Nguồn trực tiếp: `public/assets/practice-2026/biology/solutions/1.webp`, `2.webp` là trang 5–6 của đề; các ảnh lời giải của bộ tài liệu được đối chiếu riêng. Giữ câu trả lời chấm đã khớp bảng đáp án nguồn, không đoán dữ kiện thiếu. Câu có hình cần đối chiếu hình trong đề gốc.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run check` | Đạt; có kiểm tra module consent mới |
| `npm test` | **434/434 đạt**, không skip; gồm 13 test mới cho nội dung phòng thi, consent, placement và nonce |
| `npm run verify:data` | Đạt: 0 lỗi, 19 cảnh báo hồ sơ đặc thù đã có; không sửa dữ liệu tuyển sinh |
| `npm run audit:formulas` | Đạt: 326 trường, 17.617 dòng; giữ trạng thái công thức thiếu căn cứ |
| `npm run cf:dry-run` | Đạt cho main và OCR Worker; 761 tài sản tĩnh |
| Wrangler HTTPS loopback với Static Assets thật | 13 trang GET/HEAD; nội dung khớp file sinh, quảng cáo chỉ trên 8 bài. Redirect, 404, robots, sitemap 15 URL, ads.txt và module consent đúng. Root GET/HEAD nonce mới, `no-store`, không mở CSP quảng cáo |
| Brave PC/mobile | 14 trang × 1366/390 px = 28 lượt layout, không tràn ngang. Bài có nguồn, đọc được không JavaScript; tìm bài, reset bằng bàn phím và giao diện tối đạt |
| CMP giao diện bằng mock | Hiện/ẩn nút đúng điều kiện, mở lại API đúng 1 lần; lỗi CMP không chặn nội dung |
| Công cụ trên Brave | 9/9/8/8 + KV1 = 26,40 và giải thích đúng. 5 từ khóa ngành cho 24 thẻ/lượt, tên phù hợp, đổi sắp xếp không mất kết quả. UI tài khoản, phòng thi và liên kết cẩm nang hoạt động; root không yêu cầu quảng cáo |
| Sinh học trên Brave | 6 prompt Phần III và 6 ảnh đề đúng, ảnh trang 5–6 tải được. Chọn đáp án fixture qua UI 28 câu, nộp đạt 10/10, có 28 mục xem lại; không tràn ngang ở 390 px. Đây là kiểm tra khớp fixture, không chứng nhận đáp án chính thức |
| HTTP với desktop/mobile/Googlebot | 15 trang × 3 User-Agent = 45 GET có nội dung chính như nhau; 23 đường dẫn liên kết công khai HEAD 200, đường dẫn thiếu 404 |
| Soát khóa trong build | So 15 giá trị credential với 94 tài sản văn bản: không khớp tệp nào; không xuất giá trị khóa trong log/báo cáo |

Lần chạy đầu có một assertion ghim câu mô tả đề cũ; đã đổi kiểm tra sang nội dung mới và bổ sung điều kiện nguồn người dùng/giới hạn xác minh, rồi chạy lại toàn bộ 434 test. Ca cache cũ được cập nhật để kiểm tra root/index `no-store` khi có nonce; CSS/JS/HTML tĩnh vẫn bắt buộc `no-cache`. Không xóa hoặc skip test.

Mock CMP chỉ chứng minh nút giao diện/luồng API của website, không xác nhận cấu hình Google CMP thực tế. Lượt browser chặn host ngoài để không gửi ảnh học bạ hoặc dữ liệu tài khoản tới dịch vụ quảng cáo, OCR hay AI. Log, ảnh kiểm tra và script riêng trong `.local/google-policy-*` bị Git ignore.

## Những việc không thể kết luận chỉ từ mã nguồn

1. Trạng thái phê duyệt AdSense, Policy Center, hình phạt thủ công và canonical Google chọn cần xem trong tài khoản Google. Không tự gửi yêu cầu xét duyệt/xem xét lại trong tác vụ này.
2. Quyền đăng lại từng đề, ảnh và lời giải vẫn cần bằng chứng từ chủ thể có quyền. Nguồn công khai, tài liệu người dùng đưa, lời nhắc tham khảo hoặc việc không đặt quảng cáo đều không thay cho quyền sử dụng. Không tự đánh dấu đã có giấy phép.
3. Đã sửa các lỗi nội dung có bằng chứng tìm được; không tuyên bố đã thẩm định độc lập từng câu của mọi đề hay toàn bộ 17.617 dòng tuyển sinh. Trạng thái công thức thiếu căn cứ được giữ và không nâng nhãn xác minh.
4. Lượt browser có thể chặn tài nguyên bên ngoài để kiểm tra riêng ứng dụng. Cần kiểm tra thêm CMP thật ở vùng áp dụng, vị trí quảng cáo thực tế và Cloudflare JavaScript Detections/CSP bằng phiên sạch.

Tài liệu này ghi bằng chứng và phạm vi sửa, không phải chứng nhận website đã được Google chấp thuận.
