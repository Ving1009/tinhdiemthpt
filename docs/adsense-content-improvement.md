# Cải thiện nội dung và khả năng truy cập trước khi xét duyệt AdSense

Kết quả dưới đây thuộc đợt bổ sung nội dung trước. Sau lần mở rộng quảng cáo toàn HTML, bản final audit ngày 12/10 giới hạn quảng cáo về 8 bài cẩm nang và chặn tài liệu đề chưa xác minh quyền sử dụng khỏi web/build. Xem [adsense.md](adsense.md) và [final-adsense-readiness-audit.md](final-adsense-readiness-audit.md) cho cấu hình và kiểm thử mới. Production chưa được deploy trong final audit; báo cáo cũ này không xác nhận hành vi production hiện tại.

Ngày rà soát: **12/10/2026**. Website: https://tinhdiemthpt.id.vn/. Phạm vi: nội dung công khai, điều hướng, metadata, build Cloudflare, các điểm tiếp giáp API/OCR/AI/tài khoản và bộ kiểm thử hiện có.

Tác vụ bổ sung 8 bài hướng dẫn gốc, trang cẩm nang, 4 trang thông tin dự án, sitemap và robots.txt. Các công cụ, dataset tuyển sinh, bộ máy tính điểm, API, database, secrets và cấu hình bảo mật được giữ nguyên. Không thêm dependency hay framework. Việc cải thiện này **không bảo đảm Google phê duyệt** và không xác định được nguyên nhân duy nhất của thông báo “Low value content” nếu chưa xem bằng chứng trong tài khoản AdSense.

## 1. Phát hiện và cách xử lý

### Lỗi hoặc thiếu sót đã xác nhận

| Phát hiện | Bằng chứng | Xử lý |
| --- | --- | --- |
| Cẩm nang trước đây chỉ là ba FAQ, chưa có thư viện bài độc lập | `public/index.html`, `public/js/main.js`; kiểm tra Brave trước thay đổi: phần hướng dẫn khoảng 599 ký tự, không có liên kết bài viết | Giữ route `#guide` và FAQ; bổ sung liên kết thật tới thư viện và 8 bài |
| Các màn hình công cụ dùng fragment và chung một bộ metadata | `public/index.html`, `public/js/utils.js`, `public/js/main.js` | Giữ bookmark và hash routing; chỉ tạo URL HTML riêng cho nội dung biên tập |
| Chưa có sitemap do repository quản lý | Production trước thay đổi: `/sitemap.xml` trả 404 | Sinh XML gồm 15 URL canonical: trang chủ, quyền riêng tư, thư viện, 8 bài và 4 trang dự án |
| Chưa có robots.txt do repository quản lý | Production trước thay đổi: `/robots.txt` trả 200 với phần Cloudflare quản lý về content signals, chưa có quy tắc crawl/sitemap của dự án | Bổ sung file cho phép nội dung công khai, khai báo sitemap, không cho crawl `/api/` và `/_worker-data/` |
| Canonical quyền riêng tư không khớp URL thực được phục vụ | Production: `/privacy.html` chuyển 307 sang `/privacy`, nhưng canonical cũ là `/privacy.html` | Canonical và liên kết mới dùng `/privacy`; Express hỗ trợ đường dẫn sạch; alias cũ vẫn hoạt động |
| Thiếu trang độc lập giới thiệu, liên hệ, điều khoản và nguồn/báo sai | Kiểm tra cây `public/` và footer | Tạo bốn trang, liên kết từ footer chung |
| Phạm vi điểm THPT và giới hạn các mô phỏng học bạ chưa đủ rõ | Đọc `public/formulas/hocba.js`, `public/js/core/academicCalculator.js` và HTML công cụ | Nêu rõ công cụ THPT tính điểm tổ hợp xét tuyển, không tính điểm xét tốt nghiệp; bổ sung ví dụ, giới hạn học bạ, link hướng dẫn |
| Ghi chú học bạ nhân hệ số không khớp hành vi hiện tại | Engine đang mô phỏng ưu tiên trên thang 40; HTML cũ nói chỉ cộng khi đã xác minh quy đổi | Sửa ghi chú để mô tả đúng phép mô phỏng và yêu cầu đối chiếu trường; không sửa engine |
| README mô tả lưu dữ liệu cũ | Đoạn cũ nói chỉ localStorage và hết hạn sau 30 ngày, khác code hiện tại | Đồng bộ mô tả phiên khách 15 phút, bản sao tài khoản và đổi người dùng; cập nhật mô tả OCR đa dịch vụ |
| CSS mới có nguy cơ tác động nền công thức cũ | Rà soát trước phát hành thấy selector `.formula-box` chưa giới hạn phạm vi | Giới hạn dưới `.article-section`; Brave xác nhận công thức cũ vẫn chữ sáng trên nền tối |
| JavaScript Detections do Cloudflare chèn bị CSP chặn trên trang tĩnh | Production có script inline `window.__CF$cv$params`; Brave ghi nhận 2 lỗi CSP inline khi mở thư viện/bài, không có `pageerror` và nội dung vẫn đọc được | Ghi nhận để kiểm tra tích hợp nonce với Cloudflare riêng; không nới CSP hoặc đổi `run_worker_first` trong tác vụ này theo ràng buộc bảo mật |

Fragment là điều hướng hợp lệ cho ứng dụng, nhưng không tạo các tài liệu độc lập có URL/metadata riêng. Google khuyến nghị URL truy cập được và liên kết thực để khám phá nội dung. [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

### Rủi ro có căn cứ, chưa kết luận vi phạm

- Chất lượng và nguồn dữ liệu khác nhau giữa hồ sơ. Một số công thức mới có mô tả nguồn hoặc còn mâu thuẫn; độ phủ 326 trường không có nghĩa mọi công thức đã xác minh. Không tự nâng nhãn độ tin cậy hay điền số còn thiếu.
- Auto ads được chèn vào tài liệu ứng dụng chung, trong khi màn hình hash có thể là biểu mẫu, kết quả trống hoặc bài thi. Cần kiểm tra vị trí quảng cáo thực tế và loại trừ vùng không phù hợp trong tài khoản. Các trang biên tập/pháp lý mới không tải quảng cáo hoặc CMP.
- Quyền đăng lại đề, ảnh và lời giải chưa có hồ sơ đầy đủ. Chức năng chấm bài tạo giá trị sử dụng nhưng không thay bằng chứng quyền phân phối.
- Chính sách có mô tả thời hạn và quyền dữ liệu, nhưng quy trình nhận thư, xác minh người yêu cầu và thực hiện xóa cần người vận hành kiểm tra. Không thêm cam kết phản hồi mà người vận hành chưa bảo đảm.

Google nhấn mạnh nội dung riêng, hữu ích và điều hướng rõ; số bài hoặc số từ không phải điều kiện bảo đảm duyệt. [Chuẩn bị trang cho AdSense](https://support.google.com/adsense/answer/7299563?hl=en). Nội dung sao chép và quyền sử dụng cần được đánh giá riêng. [Replicated content](https://support.google.com/publisherpolicies/answer/11190248?hl=en), [Intellectual property abuse](https://support.google.com/publisherpolicies/answer/10402772?hl=en).

### Chưa thể kiểm chứng trong tác vụ này

- Thông báo chi tiết hiện tại tại AdSense Sites/Policy Center, Google đã crawl bản nào và ngày crawl.
- Search Console: trạng thái index, canonical Google chọn, báo cáo render, manual actions.
- CMP hiện được xuất bản đúng domain, luồng đồng ý/từ chối/mở lại ở từng vùng; cờ `ADSENSE_CMP_READY=true` không tự chứng minh các thao tác này.
- Auto ads thực tế, tín hiệu không cá nhân hóa gửi tới Google và các vùng loại trừ quảng cáo. Kiểm thử giao diện cục bộ chặn mạng quảng cáo nên không xác nhận vị trí quảng cáo thực.
- Quyền xuất bản từng tài liệu đề thi và việc hộp thư hỗ trợ đang được theo dõi.
- Mọi tài khoản thật/nhà cung cấp OCR và AI đang khả dụng cùng lúc. Kiểm thử không tạo tài khoản thật, không gửi báo cáo thật và không tải ảnh học sinh tới nhà cung cấp.

Cloudflare mô tả việc JavaScript Detections tự chèn script và tích hợp nonce với CSP. Phát hiện console ở trên chưa chứng minh người dùng bị chặn hoặc Googlebot không đọc được trang; cần xem cấu hình WAF và kết quả render/crawl thực. Không dùng nonce tĩnh tái sử dụng hoặc bật `unsafe-inline` để che lỗi. [Cloudflare: JavaScript Detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/).

## 2. Nội dung đã bổ sung

Tám bài có giải thích, ví dụ được ghi là minh họa, trường hợp đặc biệt, nguồn chính thức, ngày cập nhật, mục lục, công cụ liên quan và bài đọc tiếp:

| Nội dung | URL |
| --- | --- |
| Điểm xét tốt nghiệp THPT và các điều kiện cần kiểm tra | `/cam-nang/tinh-diem-tot-nghiep-thpt/` |
| Điểm xét tuyển và ưu tiên từ mốc 22,5 | `/cam-nang/diem-xet-tuyen-va-uu-tien/` |
| Xét tuyển học bạ, phép tính và giới hạn mô phỏng | `/cam-nang/xet-tuyen-hoc-ba/` |
| Đọc điểm chuẩn để chọn nguyện vọng | `/cam-nang/doc-diem-chuan-dai-hoc/` |
| Chọn tổ hợp xét tuyển | `/cam-nang/chon-to-hop-xet-tuyen/` |
| Sắp xếp nguyện vọng | `/cam-nang/sap-xep-nguyen-vong/` |
| Phân biệt phương thức xét tuyển | `/cam-nang/cac-phuong-thuc-xet-tuyen/` |
| Các lỗi thường gặp khi tính điểm và đăng ký | `/cam-nang/loi-thuong-gap-khi-xet-tuyen/` |

Trang `/cam-nang/` có danh mục, bộ lọc từ khóa tiếng Việt, trạng thái không có kết quả và nút xóa lọc. Nếu JavaScript bị tắt, cả tám bài vẫn hiện và đọc được; bộ lọc được ẩn vì không thể hoạt động. Không tạo URL cho các bộ lọc nội bộ.

Các trang tin cậy: `/gioi-thieu/`, `/lien-he/`, `/dieu-khoan-su-dung/`, `/nguon-du-lieu-va-bao-sai/`. Nội dung không công khai tên cá nhân theo yêu cầu của người vận hành, không tự nhận chứng nhận, đối tác hay tư cách đại diện Bộ GD&ĐT. Email và mạng xã hội dùng thông tin đã được cung cấp. Điều khoản nêu phạm vi tham khảo và cách yêu cầu kiểm tra nội dung.

## 3. Căn cứ năm dữ liệu và công thức

Website hướng tới thí sinh **2027**, còn dữ liệu tuyển sinh và quy chế **2026 là tham chiếu**. Bài và công cụ đều nêu giới hạn này; không tạo lịch, điểm chuẩn hoặc quy định 2027 chưa công bố.

- Xét tuyển/ưu tiên: [Thông tư 06/2026/TT-BGDĐT](https://vanban.chinhphu.vn/?docid=217071&pageid=27160), [bản PDF](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/06-bgddt.pdf). Kiểm tra mốc giảm ưu tiên 22,5; khu vực cộng với một nhóm đối tượng đủ điều kiện; yêu cầu dữ liệu học bạ cả năm 10/11/12 và trọng số Toán hoặc Văn; giới hạn/nguyên tắc sắp xếp nguyện vọng cùng điều kiện xét ngang điểm.
- Tốt nghiệp: [Văn bản hợp nhất 02/VBHN-BGDĐT ngày 17/04/2026](https://congbao.chinhphu.vn/van-ban/van-ban-hop-nhat-so-02-vbhn-bgddt-469408/64429.htm), [Thông tư 24/2024](https://vqa.moet.gov.vn/uploads/news/2024_12/final-quy-che-thi-tot-nghiep-thpt.pdf), [Thông tư 13/2026](https://vanban.chinhphu.vn/?docid=217189&pageid=27160&typegroupid=6). Bài phân biệt ưu tiên tốt nghiệp với ưu tiên xét tuyển đại học.
- Ví dụ tổ hợp, điểm chuẩn, phương thức và quy đổi dùng tài liệu tuyển sinh chính thức của Đại học Cần Thơ, Đại học Bách khoa Hà Nội và các nguồn cơ quan nhà nước; không sao chép bảng dữ liệu của nguồn vào bài.

Trang thông cáo quy đổi 2026 của Bách khoa Hà Nội có kết quả lập chỉ mục trên domain chính thức nhưng truy xuất trực tiếp bị timeout trong đợt nghiên cứu. Bài chỉ nói về tồn tại/phạm vi thông cáo, không lấy mức điểm từ bảng chưa đọc được; không tuyên bố tất cả nguồn ngoài luôn trả HTTP 200.

## 4. Triển khai kỹ thuật và bảo mật

- Nội dung gốc nằm trong hai module `content/`; renderer sinh HTML tĩnh bằng Node stdlib, không runtime fetch nội dung và không cần đăng nhập.
- Từng bài có title/description/canonical riêng, `og:*`, `twitter:*`, một H1, heading theo mục, breadcrumb và JSON-LD Article/BreadcrumbList. Tác giả là tên dự án, không tạo tiểu sử chuyên gia.
- Sinh HTML trước khi copy Static Assets. `prestart`/`predev` cũng sinh lại nội dung để bản chạy Express không bị cũ.
- Alias thư mục/index và `/privacy.html` vẫn truy cập được; URL thiếu có 404 thật, không trả app shell 200.
- Sitemap không liệt kê hash, API, dữ liệu nội bộ, trang thiếu hoặc kết quả lọc. Sitemap hỗ trợ phát hiện URL, không bảo đảm lập chỉ mục. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview).
- Metadata và JSON-LD được escape; slug không nhận traversal. Phần thân HTML chỉ từ module biên tập trong repo, không từ input người dùng.
- Script cẩm nang chỉ lưu theme; không tải auth/AI/OCR, không lưu tìm kiếm, ảnh, tên học sinh hay nội dung riêng tư.
- Giữ nguyên `run_worker_first`, publisher ID, nonce/CSP, HSTS, rate limit, Turnstile, D1/Supabase và Cloudflare Secrets. `/ads.txt` vẫn đúng publisher công khai.
- Các trang mới không có quảng cáo; chỉ root/index tiếp tục dùng cơ chế AdSense hiện có. Không tăng vị trí quảng cáo. Không cá nhân hóa không đồng nghĩa bỏ yêu cầu đồng ý/cookie: cần kiểm tra CMP theo vùng. [Ad personalization settings](https://support.google.com/adsense/answer/7670312?hl=en), [CMP requirements](https://support.google.com/adsense/answer/13554116?hl=en).

## 5. Rà soát quyền xuất bản phòng thi

Trong bộ đề đang hoạt động có **17 đề** mang nhãn đề gốc do người dùng cung cấp. Kiểm tra module thấy **556 đối tượng câu hỏi lưu**, **554 câu được lựa chọn theo nhánh**, **230 lời giải số hóa**, **150 ảnh WEBP** gồm đề/đáp án/lời giải. 16/17 trường `answerSource` chưa có giá trị; một bộ có nguồn OLM. Thư mục nguồn người dùng có 52 tệp và một số tên/ảnh mang dấu bên thứ ba. Đây là thống kê nội bộ, không xác nhận chủ sở hữu hoặc phạm vi cấp phép.

Kiểm tra mẫu phát hiện một ảnh lời giải Toán có ghi tạo bằng AI và một số ảnh trong nhóm “lời giải” Sinh học thực tế chứa trang đề hoặc nội dung pha trộn. Không được suy ra tất cả lời giải là đáp án chính thức đã duyệt. Đã thêm lưu ý tham khảo và kênh yêu cầu kiểm tra/gỡ tài liệu; không thêm, sao chép hoặc sửa dataset đề thi trong tác vụ này.

Việc cần làm trước khi khai thác quảng cáo rộng hơn:

1. Lập sổ theo từng đề, ảnh, đáp án và lời giải: nguồn, chủ thể quyền nếu xác định được, phạm vi cho phép đăng lại, sử dụng thương mại và bằng chứng đồng ý.
2. Đối chiếu quyền riêng cho đề gốc và lời giải/bản trình bày bên thứ ba. Truy cập công khai hoặc người dùng gửi file không tự tạo giấy phép đăng lại.
3. Với phần chưa có căn cứ, cân nhắc tạm ẩn, thay bằng bài tự biên soạn hoặc dẫn nguồn được phép; giữ bản gốc nội bộ để đối chiếu. Quyết định này cần người vận hành xác nhận.
4. Kiểm tra nhãn đáp án/lời giải, loại trừ quảng cáo tại vùng làm bài và tài liệu có quyền chưa rõ. Hash SPA không mặc nhiên tạo URL quảng cáo riêng.

## 6. File thay đổi

Nguồn và bộ sinh:

- `content/admissionsGuides.js`
- `content/projectPages.js`
- `lib/contentPages.js`
- `scripts/build-content.mjs`
- `scripts/build-cloudflare.mjs`
- `package.json`

Giao diện, ứng dụng và tài liệu:

- `public/index.html`
- `public/privacy.html`
- `public/css/content.css`
- `public/js/content.js`
- `server/server.js`
- `README.md`
- `tests/contentPages.test.js`
- `docs/adsense-content-improvement.md`

File sinh và được lưu trong Git:

- `public/cam-nang/index.html`
- `public/cam-nang/{tinh-diem-tot-nghiep-thpt,diem-xet-tuyen-va-uu-tien,xet-tuyen-hoc-ba,doc-diem-chuan-dai-hoc,chon-to-hop-xet-tuyen,sap-xep-nguyen-vong,cac-phuong-thuc-xet-tuyen,loi-thuong-gap-khi-xet-tuyen}/index.html`
- `public/{gioi-thieu,lien-he,dieu-khoan-su-dung,nguon-du-lieu-va-bao-sai}/index.html`
- `public/sitemap.xml`
- `public/robots.txt`

Khi biên tập, sửa module `content/` rồi chạy `npm run build:content`; không sửa riêng file HTML sinh. `npm run cf:build` đã gọi bước này. Không đưa log, ảnh học bạ, file nguồn đề, `.env`, `.local/` hoặc output riêng vào commit.

## 7. Kiểm thử và giới hạn bằng chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run build:content` | Đạt: 13 HTML, sitemap và robots |
| `npm run check` | Đạt; kiểm tra cú pháp hiện có và module mới |
| `npm test` | **421/421 đạt**, không skip; gồm 7 test nội dung/SEO/route mới |
| `npm run verify:data` | Đạt: 0 lỗi, 19 cảnh báo hồ sơ đặc thù đã tồn tại |
| `npm run audit:formulas` | Đạt: 326 trường, 17.617 dòng ngành; không thay trạng thái các công thức chưa đủ bằng chứng |
| `npm run cf:dry-run` | Đạt cho cả OCR Worker và main Worker |
| Express HTTP và Worker regression | GET/HEAD, metadata, canonical, assets, JSON-LD, sitemap/robots, alias/404, API không bị static nuốt và hash cũ: đạt |
| Wrangler thật, HTTPS loopback, Static Assets thật | 13 trang GET/HEAD 200; nội dung trùng file sinh; CSP/nosniff giữ đúng; redirect index/slash/privacy đúng; nội bộ và URL thiếu 404; sitemap 15 URL; ads.txt đúng |
| Brave desktop/mobile | 14 trang × 1366/390/320 px = 42 lượt; không tràn ngang, đúng một H1, có nội dung. Giao diện sáng/tối đã xem ảnh và kiểm tra màu chữ sau khi transition hoàn tất |
| Tìm bài và bàn phím | Từ khóa `ĐIỂM ƯU TIÊN`, danh mục, không có kết quả, reset về 8 bài; Tab/Enter dùng nút xóa lọc: đạt |
| Không JavaScript | Bài ưu tiên có đầy đủ nội dung/nguồn/công thức để đọc: đạt |
| Công cụ hiện có trên Brave | 9/9/8/8 + KV1 = 26,40, giải thích đúng; tìm “toán” ra 24 thẻ/862 kết quả, sắp xếp giữ kết quả; hồ sơ Bách khoa Hà Nội và công thức mở đúng; UI phòng thi/tài khoản hiện bình thường |
| OCR/AI trên Brave | Chặn upload khi chưa đồng ý; mock OCR 503 mở dự phòng; nhập tay đóng hộp thoại và focus ô điểm; Tesseract thật đọc đúng ba giá trị Toán trên mẫu HUNRE công khai; AI nhận và hiện phản hồi API giả lập đúng |
| Soát khóa trong tài sản công khai | So 15 giá trị credential đang cấu hình với 93 tài sản văn bản trong bản build: không có tệp khớp; `.env`/`.dev.vars`/`.local` không được Git theo dõi |
| HTTP production sau deploy | 13 trang GET/HEAD 200, nội dung biên tập khớp sau khi tách script kiểm tra do CDN tự chèn; canonical/redirect/404/CSP đúng; sitemap 15 URL, robots có sitemap, ads.txt đúng |
| Brave production sau deploy | 8 bài hiện, không tràn ngang ở 390 px; bài đọc được, link về công cụ hoạt động, 9/9/8/8 + KV1 = 26,40; hash `#guide` còn 8 liên kết; không có `pageerror`. Có 2 console CSP inline liên quan script Cloudflare tự chèn, được ghi nhận riêng |

Test lần đầu phát hiện cụm từ trong trang nguồn không khớp quy ước public hiện có; đã sửa câu chữ và chạy lại **toàn bộ test đạt**, không xóa/né test. Một lần build gặp Windows `EBUSY` vì Wrangler local đang giữ thư mục assets; đã dừng đúng dev process và chạy lại build/dry-run đạt, không thay cấu hình để né lỗi.

Test đối chiếu file sinh chuẩn hóa riêng LF/CRLF để không báo “file cũ” sai khi Git checkout trên Windows; mọi nội dung và điều kiện kiểm tra khác vẫn được giữ nguyên.

Các kiểm thử UI chặn host bên ngoài; lỗi mạng do chặn font/quảng cáo không được coi là lỗi JavaScript ứng dụng. Không có `pageerror` trong lượt kiểm tra nội dung/công cụ. OCR từ xa và AI dùng mock để không gửi ảnh thật, không tiêu hạn mức hoặc tạo dữ liệu production; một mẫu Tesseract đúng không chứng minh nhận diện đúng mọi học bạ. UI tài khoản/phòng thi được mở trên browser, còn session/đổi tài khoản/chấm bài/PDF do bộ regression hiện có kiểm tra. Không tuyên bố đã dùng tài khoản học sinh thật hay tải lên tất cả dịch vụ.

Wrangler local có meta tài khoản AdSense, nhưng ad script đang được chặn bởi cấu hình môi trường phát triển; cơ chế chèn quảng cáo được test bằng cấu hình explicit trong regression. Cần kiểm tra HTML production riêng, không sửa gating để ép tải quảng cáo ở local.

Đã deploy bằng `npm run cf:deploy` theo quyền tự cập nhật GitHub/Cloudflare đã được người vận hành cho phép trong cuộc trò chuyện. Main Worker version đã đối chiếu nội dung: **d95b822a-2706-446f-b934-4580c8113342**. HTML root production có script AdSense đúng publisher, `disablePersonalization` và nonce CSP; các trang bài/pháp lý không có AdSense. Không gửi yêu cầu xét duyệt Google. Log production: `.local/adsense-production-probe.log` và `.local/adsense-browser-production.log`.

Log/ảnh đối chiếu được giữ trong `.local/` bị Git ignore: `adsense-full-tests.log`, `adsense-browser-content.log`, `adsense-dark-keyboard.log`, `adsense-browser-core.log`, `adsense-browser-local-ocr.log`, `adsense-wrangler-probe.log`, ảnh trước/sau phần hướng dẫn và ảnh bài ưu tiên sáng/tối. Không chứa secrets trong báo cáo công khai.

## 8. Checklist production và trước khi gửi xét duyệt lại

- [x] Sau deploy, GET/HEAD 13 trang mới, `/privacy`, `/sitemap.xml`, `/robots.txt`, `/ads.txt`; kiểm tra canonical, redirect, 404 và header bằng HTTP thật.
- [x] Xác nhận root vẫn có script AdSense đúng publisher, nonce/CSP; trang bài/pháp lý không bị chèn quảng cáo ngoài dự kiến.
- [x] Mở website trên Brave/mobile; đọc bài không cần đăng nhập; thử tính điểm, tra cứu và liên kết quay về công cụ.
- [ ] Đối chiếu JavaScript Detections/WAF với CSP trên trang tĩnh; chọn cách tích hợp nonce hợp lệ nếu cần, giữ bảo mật và kiểm tra khách mới/crawler sau thay đổi.
- [ ] Trong Search Console, gửi sitemap và kiểm tra mẫu URL bằng URL Inspection: crawl/render, canonical được chọn, không bị robots/noindex/soft-404. Theo dõi theo thời gian; không cần ép index hàng nghìn trang mẫu.
- [ ] Trong AdSense, đọc lại nguyên văn lý do từ chối và mọi mục Policy Center; xác nhận Google đã có cơ hội truy cập bản mới trước khi gửi lại.
- [ ] Kiểm tra CMP và lựa chọn quảng cáo bằng phiên sạch ở vùng áp dụng; xác nhận hành vi từ chối, đồng ý và mở lại, thay vì chỉ dựa vào biến cấu hình.
- [ ] Kiểm tra Auto ads không che ô điểm, nút quét, modal, tài khoản, trợ lý và bài thi; lưu vùng loại trừ cần thiết trong tài khoản.
- [ ] Hoàn tất quyền xuất bản đề/ảnh/lời giải và xử lý những tài liệu chưa đủ căn cứ. Lưu ý tham khảo không thay giấy phép.
- [ ] Thử hộp thư hỗ trợ, quy trình tiếp nhận báo sai và yêu cầu dữ liệu; xác định cách kiểm chứng tài khoản khi không có email đăng ký.
- [ ] Duyệt lại nội dung sau khi có quy chế/thông báo 2027; thay đúng phần có căn cứ, giữ năm tham khảo với dữ liệu còn cũ.

Các mục tài khoản Google, quyền xuất bản và quy trình vận hành chưa được đánh dấu hoàn tất chỉ từ việc mã nguồn đạt test. Không tự gửi lại yêu cầu xét duyệt AdSense trong tác vụ này.
