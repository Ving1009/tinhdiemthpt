# Final audit — Tính Điểm THPT

> Cập nhật sau audit: theo yêu cầu khôi phục của chủ website, 17 bộ đề đầy đủ cùng ảnh đề, đáp án và lời giải được đưa trở lại phòng thi. Các mục chặn đề và thay bằng 18 đề luyện ngắn bên dưới là ghi nhận của bản audit trước khôi phục, không còn mô tả bản hiện tại. Việc khôi phục không thay đổi kết luận chưa xác minh quyền trong báo cáo kiểm kê. Bản audit `aad3068` đã được push và deploy thành công theo yêu cầu tiếp theo; phạm vi quảng cáo vẫn chỉ ở 8 bài cẩm nang.

Ngày thực hiện: **12/10/2026**. Repository: `G:/Codex/tinhdiemthpt`, nhánh `main`, bắt đầu từ `8c403c8` (`origin/main`). Website: https://tinhdiemthpt.id.vn/.

**Kết luận cho website đang public: Chưa sẵn sàng yêu cầu xét duyệt lại.** Các lỗi kỹ thuật đã được sửa và kiểm thử ở local/build Cloudflare, nhưng production vẫn là bản cũ, tài liệu chưa xác minh vẫn có URL trả 200, và CMP/quyền tài liệu/Search Console còn cần kiểm tra thủ công. Không deploy, thay secrets, push hay gửi yêu cầu Google trong audit này. Kết quả nội bộ không bảo đảm AdSense chấp thuận.

## A. Các vấn đề đã phát hiện

| Mức độ | Vấn đề và bằng chứng | File/phạm vi | Xử lý |
| --- | --- | --- | --- |
| Cao | 17 bộ đề có nhãn người dùng cung cấp, không có hồ sơ giấy phép; 150 ảnh và module câu hỏi/đáp án/lời giải có thể được lấy trực tiếp dù chỉ ẩn thẻ đề. HEAD production của ảnh Toán và module câu hỏi vẫn trả 200. | `public/assets/practice-2026/`, 3 module `official*2026.js`, phòng thi, Express/Worker/build | Chặn URL, loại khỏi build; giữ bản gốc và lịch sử điểm. Quyền/GitHub/production còn cần xử lý. |
| Vừa | Một danh sách URL vừa quyết định phục vụ HTML vừa bật quảng cáo; phạm vi gồm công cụ, phòng thi và chính sách. Tài liệu từng ghi 23 URL không phân biệt alias/trang quảng cáo. | `lib/adsense.js`, `docs/adsense.md`, hai server | Tách danh sách HTML và quảng cáo; chỉ 8 bài có loader có điều kiện. |
| Vừa | Sau khi thu hẹp quảng cáo, HTML tĩnh cần nonce cho Cloudflare và quyền beacon cụ thể, không nên dùng CSP quảng cáo trên mọi trang. | `lib/securityHeaders.js`, `server/server.js`, `worker/index.js` | Nonce trên mọi HTML; thêm đúng 2 host Web Analytics, giữ CSP riêng cho API/OCR. |
| Vừa | HTML trả về có H1 trang chủ ẩn, công cụ dùng H2. Hồ sơ URL động không có tóm tắt dữ liệu riêng khi tắt JS. | `lib/appPages.js`, `public/js/core/appRoutes.js`, `main.js` | Một H1 theo view ở server/client; render tóm tắt trường/ngành từ dữ liệu thật. |
| Vừa | Nội dung SSR của một số công cụ thiếu ví dụ/giải thích kết quả trước khi tương tác. | `public/index.html` | Bổ sung hướng dẫn ngắn cho công thức, tổ hợp, hồ sơ, tìm ngành. |
| Vừa | Đo local thấy CLS 0,199 ở tổ hợp/phòng thi, 0,364 ở hồ sơ, 0,108 ở thư viện. Danh sách và bộ lọc xuất hiện sau khi JS chạy làm dịch footer/nội dung. | `redesign.css`, HTML, `main.js`, `content.js`, `lib/contentPages.js` | Giữ chỗ khi tải; render bộ lọc từ HTML, mở khóa khi JS sẵn sàng. Đo lại 0–0,014 ở các trang này. |
| Vừa | Chính sách chỉ nêu Gemini/Groq/OCR.space nhận ảnh, trong khi code hỗ trợ HF/Requesty khi bật `*_VISION_MODEL`. | `public/privacy.html`, hộp thoại trong `main.js`, `server/configuredScanProviders.js` | Nói rõ điều kiện nhận ảnh và chuyển tiếp qua nhà cung cấp mô hình; đồng bộ hai bản. |
| Vừa | Một số nguồn bên ngoài chưa mở được bằng công cụ audit: thông cáo HUST và PDF văn bản hợp nhất tốt nghiệp. Không có bằng chứng chắc chắn link đã hỏng. | Nguồn 2 bài cẩm nang | Giữ link nguồn đã có, đánh dấu cần kiểm tra thủ công; không thay bằng nguồn đoán. |

Biện pháp chặn web/build không biến các file đã có trong GitHub công khai thành riêng tư. Không sửa lịch sử Git hoặc tự xóa bản gốc. Danh sách chi tiết và cách xác minh nằm trong [exam-rights-review-2026.md](exam-rights-review-2026.md).

## B. Thay đổi đã thực hiện

| Nhóm file | Thay đổi |
| --- | --- |
| **Mới:** `lib/examPublication.js` | Nhận diện đường dẫn tài liệu rút khỏi công bố, bao gồm mã hóa URL, chặn trước static binding. |
| `server/server.js`, `worker/index.js`, `wrangler.jsonc`, `scripts/build-cloudflare.mjs` | 404 tài liệu chưa xác minh; filter khi copy assets; tách phục vụ HTML khỏi phạm vi quảng cáo; nonce/header đúng cho GET/HEAD. |
| `public/js/data/practiceExams2026.js`, `public/js/practiceExam.js` | Không import 17 bộ vào danh mục public. Dùng 18 bộ luyện ngắn tự biên soạn đã có; ghi nhãn nguồn/giới hạn. Kết quả cũ còn điểm và ngày, không phân phối lại câu/ảnh. Giữ draft của bộ đang tạm ngừng; chỉ thay khi người dùng xác nhận bắt đầu bài mới. |
| `lib/adsense.js`, `lib/securityHeaders.js` | 23 URL canonical/46 HTML alias tách khỏi 8 bài/16 đường dẫn quảng cáo. Không nới CSP API, không thêm script inline tự do. |
| `lib/appPages.js`, `public/js/core/appRoutes.js`, `public/js/main.js` | H1 theo view; summary trường/ngành có năm, mã, phương thức, điểm/trạng thái/nguồn nếu có; escape nội dung, chỉ tạo link HTTP(S). Bỏ summary SSR khi giao diện tương tác tiếp quản, tránh hiển thị trùng. |
| `public/index.html`, `public/css/{style,refinement,responsive,redesign}.css` | Giữ giao diện hiện có khi heading chuyển H1/H2; thêm ví dụ/hướng dẫn và vùng giữ chỗ danh sách. Không đổi công thức tính. |
| `lib/contentPages.js`, `public/js/content.js`, `public/cam-nang/index.html` | Bộ lọc hiện ngay, disabled trước JS; danh sách bài vẫn đọc và mở được không cần JS. |
| `content/projectPages.js`, `public/nguon-du-lieu-va-bao-sai/index.html` | Công khai trạng thái đề tạm ngừng, không gọi bài luyện ngắn là đề chính thức hay đề đủ cấu trúc. |
| `public/privacy.html`, hộp thoại trong `main.js` | Bổ sung HF/Requesty có thể nhận ảnh khi cấu hình vision được bật; ngày cập nhật 12/10/2026. Không hứa thời hạn phản hồi hoặc biện pháp lưu trữ chưa thực hiện. |
| **Mới:** `tests/finalReadiness.test.js` | 8 regression test: đề tự biên soạn; chặn 17 bộ/150 ảnh/3 module; giữ bản nháp/xác nhận thay thế; giữ lịch sử; SSR/H1/escaping; scope/CSP; chính sách OCR; CLS/filter. |
| `tests/{adsense,appRoutes,contentPages,navigation,practiceExam,practicePublication,publicApiSecurity,publicSourceCleanup}.test.js`, `package.json` | Cập nhật kỳ vọng đúng scope mới, giữ kiểm tra dữ liệu đề đã lưu bằng fixture riêng và thêm file guard vào `check`. Không xóa/skip test để né lỗi. |
| `docs/adsense.md`, `docs/google-policy-review.md`, `docs/adsense-content-improvement.md`; hai báo cáo mới | Đồng bộ cấu hình và ghi rõ lịch sử phiên bản, bằng chứng local, phần chưa deploy và việc thủ công. |

Không thay `data/`, `formulas/`, `public/formulas/`, nội dung ba module đề gốc, 150 ảnh gốc, secrets hoặc database. Không thêm dependency/framework, không tạo hàng loạt hồ sơ/bài mới, không rewrite công thức đúng.

### Phạm vi quảng cáo đã triển khai

- **Bật có điều kiện:** 8 bài cẩm nang, và alias HTML của cùng bài.
- **Không có loader:** trang chủ, thư viện, công cụ, kết quả, hồ sơ/tra cứu, phòng thi, tài khoản, AI, chính sách, điều khoản, API và lỗi.
- Giữ mã xác minh và `/ads.txt`; không tự refresh quảng cáo. Yêu cầu tắt cá nhân hóa vẫn có trong loader. Kiểm tra CMP/vị trí thật trong tài khoản là việc riêng, không được suy ra từ biến `ADSENSE_CMP_READY`.

Chọn phạm vi này để công cụ/bài thi không có quảng cáo gần ô nhập và nút thao tác, đồng thời chỉ đặt khả năng quảng cáo ở nội dung hướng dẫn đã rà soát. Đây là quyết định cho phiên bản hiện tại, không phải tuyên bố Google cấm mọi website công cụ chạy quảng cáo.

### Rà soát 8 bài cẩm nang

Đã đọc `content/admissionsGuides.js` và HTML tạo ra. Các bài có 4–5 mục, tổng 22 mục nguồn tham chiếu (có nguồn dùng chung); mỗi bài có ví dụ/lỗi thường gặp, liên kết công cụ, bài liên quan và cảnh báo 2026/2027. Không kéo dài bài hoặc viết lại phần đang đáp ứng yêu cầu.

| Bài | Giá trị/kiểm tra cụ thể | Kết quả |
| --- | --- | --- |
| Tính điểm tốt nghiệp | Phân biệt điểm tốt nghiệp với xét tuyển; H = 44/6 → 7,33; (6,75 + 7,33)/2 → 7,04; điều kiện môn >1,0. | Nội dung và số học rõ. Trang công cụ hiện tính tổ hợp xét tuyển, không có form xét tốt nghiệp riêng; không giới thiệu sai tính năng. PDF hợp nhất 2026 cần mở lại thủ công. |
| Điểm xét tuyển và ưu tiên | P = 0,50 + 1,00 = 1,50; S = 24 → ưu tiên 1,20 → 25,20. Mốc 22,49/22,50/30 và 26 + KV1 được kiểm thử trong bộ tính điểm. | Đạt; nguồn Bộ GDĐT/FPT, phân biệt ưu tiên tốt nghiệp và tuyển sinh. |
| Xét học bạ | Phân biệt điểm cả năm/HK, nhiều chế độ mô phỏng, thiếu điểm không thay bằng 0; kiểm tra OCR và điều kiện nguồn tuyển. | Đạt; thông tin học bạ 3 năm đối chiếu được với trả lời Bộ trên Cổng Chính phủ. Không gọi mọi chế độ cũ là quy tắc 2027. |
| Đọc điểm chuẩn | Phân biệt sàn/chuẩn, cùng thang chưa đủ để so sánh, cùng mã/năm/phương thức; minh họa quy đổi CTU/HUST. | CTU 2026 mở được và nêu quy đổi; link HUST cần kiểm tra lại. Không bịa điểm ngành hoặc xác suất trúng tuyển. |
| Chọn tổ hợp | A00 = 22,80; A01 = 24,50; D01 = 23,70 từ các điểm trong bài; đối chiếu đúng ngành/cơ sở. | Đạt về số học và cách dùng; danh mục 2026 là tham khảo. |
| Sắp xếp nguyện vọng | Thứ tự mong muốn học, phương án nhiều mức điểm, PDF chỉ là bản chuẩn bị. | Đạt; không biến danh sách lưu trên web thành đăng ký chính thức. |
| Các phương thức xét tuyển | Phân biệt THPT/học bạ/ĐGNL/V-SAT/chứng chỉ/điều kiện; chỉ dùng công thức có nguồn. | Đạt; không suy diễn một công thức cho mọi trường/ngành. |
| Lỗi thường gặp | Sai môn, năm, phương thức, ưu tiên, dữ liệu thiếu và nguyện vọng; hành động sửa gắn công cụ. | Đạt; không lặp toàn bộ bài khác để tăng độ dài. |

Các quy tắc hiện có dẫn tới văn bản tuyển sinh **2026**; nguồn 2027 vẫn đang cập nhật. Đã mở lại trang Thông tư 06/2026, trả lời học bạ của Bộ, FPT và CTU trong audit. Kiểm tra số học không đồng nghĩa xác minh từng dòng trong 326 hồ sơ hay toàn bộ tài liệu pháp luật cho kỳ thi 2027.

### SEO và minh bạch

Sitemap giữ **23 URL canonical thực**, sinh từ route/content catalog; không đưa API, file đề rút khỏi công bố hoặc hàng nghìn tổ hợp/trang sinh tự động vào sitemap. Robots cho phép crawler và CSS/JS, chặn API/dữ liệu nội bộ; tài liệu rút khỏi công bố được bảo vệ bằng 404, không dựa vào robots.

HTML có title/description/canonical phù hợp; một H1; bài có breadcrumb/Article JSON-LD và nội dung không cần JS. Test parse structured data và URL; đây không phải xác nhận Rich Results hay Google đã index. Hồ sơ động trả tóm tắt thật nếu mã tồn tại, 404 khi sai trường/ngành; không tạo điểm/nguồn giả khi thiếu.

Giới thiệu, Liên hệ, Điều khoản, nguồn dữ liệu và quyền riêng tư đã có email hỗ trợ, nguồn/năm/trạng thái, lưu ý AI/OCR và cách yêu cầu xóa. Nhập tay là lựa chọn; chỉ upload khi đồng ý; bản preview cần người dùng kiểm tra. Chính sách nói đúng thời điểm xóa khách ở lần quay lại, bản sao tài khoản không tự xóa sau 15 phút, và việc xóa tài khoản qua email chưa có nút tự phục vụ. Việc phản hồi email/xử lý quyền đúng hạn vẫn cần quy trình người vận hành; không sửa thành cam kết chưa thực hiện.

## C. Kiểm thử và bằng chứng

Trên Windows dùng `npm.cmd` thay `npm.ps1`. Các lệnh trong bảng thực sự đã chạy.

| Lệnh | Kết quả cuối | Bằng chứng local |
| --- | --- | --- |
| `npm run check` | PASS | `.local/final-check-5.log` |
| `npm test` | **448/448 pass**, 0 fail/cancelled/skipped/todo | `.local/final-all-tests-5.log` |
| `npm run verify:data` | PASS, **0 lỗi / 19 cảnh báo** | `.local/final-verify-data.log` |
| `npm run audit:formulas` | PASS; không cập nhật hay promote công thức thiếu căn cứ | `.local/final-audit-formulas.log` |
| `npm run cf:dry-run` | PASS cả Worker chính và OCR; chỉ build/dry-run | `.local/final-dry-run-4.log` |
| `npm run measure:performance` | PASS phép đo API local | `.local/final-performance.log` |
| `git diff --check` | PASS, không có lỗi whitespace; có thông báo LF/CRLF Windows | Git diff cuối |

Dataset giữ 326 hồ sơ, 17.617 dòng ngành, 293 tổ hợp. 19 warning liên quan hồ sơ tuyển sinh đặc thù/chưa có dòng ngành riêng, không phải crash. Catalog có 1.419 mục phương thức: 209 biểu thức đối chiếu chính thức, 92 quy tắc tự tính mới trong catalog đã tồn tại; 133 `requires_review`, 10 `scope_incomplete`, 12 `missing_evidence`, 4 `conflicting` vẫn giữ trạng thái. Độ phủ hồ sơ không chứng minh mọi công thức đã đầy đủ/chính thức. Anchor lỗi 0, nhóm chính thức trùng bất thường 0.

Các lần test đầu đã tìm ra kỳ vọng cũ về phạm vi ads/cache/nhãn đề và fixture đề rút khỏi danh mục. Đã chỉnh fixture/kỳ vọng theo hành vi mới, giữ kiểm tra câu/đáp án/lời giải gốc. Kết quả cuối không bỏ qua test lỗi.

### HTTP với Express và Static Assets thật

Chạy `npm start` tại `127.0.0.1:3000`, Wrangler local HTTPS tại `127.0.0.1:8787` trên bản build, không dùng deploy. Mỗi server kiểm tra:

- 23 URL canonical + 2 hồ sơ thực × GET/HEAD = **50 response**: 200, canonical/H1 đúng, HEAD rỗng, nonce mới và no-store.
- 23 URL × 3 user-agent (desktop/mobile/Googlebot) = **69 response**: nội dung HTML giống nhau sau khi bỏ nonce. Không có nhánh nội dung riêng cho bot.
- 7 đường dẫn tài liệu/nội bộ/lỗi trả 404; `/ads.txt` 200 đúng publisher.
- Unit/integration test kiểm tra toàn bộ 150 ảnh + 3 module và đường dẫn mã hóa cho cả GET/HEAD ở Express/Worker, chặn trước asset binding. Tests route kiểm tra alias, redirect thư mục và 404 thật.

Build còn **529 tài sản / khoảng 110,8 MiB**, giảm từ 682 tài sản vì bỏ 153 file bị hạn chế. Không có file bị hạn chế trong thư mục deploy. Đối chiếu 14 giá trị credential đang có local với 155 tài sản text public: **0 trùng khớp**; không ghi giá trị key vào báo cáo. Đây là phép kiểm tra các khóa đã biết, không phải chứng nhận không thể rò rỉ mọi secret.

Bằng chứng: `.local/final-http-audit-3.log`, `.local/final-http-summary.json`. Log `.local` và ảnh QA chỉ được giữ trên máy, không phải artifact public trên GitHub.

### Trình duyệt Brave thật

Dùng Playwright CLI mở Brave đã cấu hình. Không click quảng cáo; chặn request quảng cáo/nhà cung cấp ngoài. Các mẫu/mocks không ghi vào database production.

- **138 kiểm tra layout**: 23 trang × 1366/768/390 px × sáng/tối; status/canonical/title/H1, không tràn ngang. Thêm 27 lượt mở 9 công cụ trên ba kích thước.
- **23 trang tắt JS** vẫn đọc được nội dung chính; 25 link nội bộ duy nhất được kiểm tra HTTP 200. Hồ sơ riêng được kiểm tra qua HTML/HTTP.
- Legacy hash, URL trực tiếp, back/forward, reload hồ sơ hoạt động; điểm nhập/kết quả còn khi chuyển view.
- THPT 9/9/8/8 + KV1 cho **26,40**; học bạ lớp 12 với bộ điểm tương ứng + KV1 cũng **26,40**.
- Tìm `toán`, `công nghệ thông tin`, `y khoa`, `điện`, `kinh tế` đều có 24 thẻ/trang và summary tương ứng; mở ngành/trường, lưu nguyện vọng, so sánh hai ngành, tải PDF thành công.
- Lỗi `11`, `-1`, `8.555`, `abc`, rỗng có đúng thông điệp dưới ô và `aria-invalid`; `8,5` xóa lỗi. Kiểm tra cơ bản heading/label/điều hướng; chưa kiểm định WCAG đầy đủ bằng screen reader.
- 18 thẻ luyện ngắn có bộ đếm, chấm điểm/lời giải tự biên soạn; 0 ảnh đề bị rút. Unit test giữ chấm điểm/lịch sử của dữ liệu gốc mà không phân phối lại qua web.
- Kiểm tra riêng trên Brave mobile: reload vẫn giữ draft đề bị rút; chọn bài mới rồi hủy không thay draft; chỉ ghi bài mới sau nút xác nhận. Bằng chứng `.local/final-browser-draft.log`.
- AI gặp response 503 giả lập vẫn chuyển sang hỗ trợ từ dữ liệu local; không kết luận các provider thật đều đang hoạt động.
- Mở/đóng tài khoản trên trình duyệt. Bộ test auth có register/login/logout/me/data, phiên hết hạn, cookie Secure/HttpOnly/SameSite, origin lạ, user A/B, restore/autobackup cũ và Turnstile fail-closed. Database/auth/provider dùng fixture; không tạo tài khoản production để thử.
- Không ghi nhận pageerror, lỗi CSP hoặc missing asset không mong đợi trong các lượt QA này.

Bằng chứng: `.local/final-browser-core-2.log`, `.local/final-browser-content-2.log`, ảnh trong `output/playwright/`.

### OCR và CSP

Brave kiểm tra file sai loại, vượt 7 MB, quá 6 ảnh có lỗi tiếng Việt; không đồng ý thì nút quét bị vô hiệu và không upload. Hai request OCR từ xa được intercept trả 503: nút nhập tay đóng hộp thoại đúng, và lựa chọn Tesseract chạy **WASM/Tesseract thật trên máy** đọc đúng hàng mẫu Toán lớp 10 (0,9 / 5 / 6), hiện 1 hàng preview. 0 upload tới nhà cung cấp bên ngoài trong QA.

Test/service code kiểm tra timeout, quota, fallback, đồng ý, validate ảnh, không đưa ảnh/OCR thô vào backup. Kết quả mẫu một hàng không chứng minh đọc đủ mọi ảnh học bạ; người dùng vẫn cần đối chiếu điểm trước xác nhận. Bằng chứng: `.local/final-browser-ocr-2.log`, `output/playwright/final-local-ocr-mobile.png`.

Probe CSP trên HTML `/privacy` cho phép inline có nonce, host beacon và request RUM được mock, đồng thời chặn inline không nonce. Có **1 violation cố ý** trong probe để xác nhận bảo vệ; không phải lỗi ứng dụng. Bằng chứng `.local/final-browser-csp-2.log`. Script Cloudflare/AdSense thật và CMP còn cần kiểm tra sau khi cho phép deploy.

### Hiệu năng

| Trang | CLS trước | CLS sau |
| --- | ---: | ---: |
| Tổ hợp | 0,199 | 0 |
| Hồ sơ trường | 0,364 | 0,014 |
| Phòng thi | 0,199 | 0 |
| Thư viện cẩm nang | 0,108 | 0 |

LCP trong 23 lượt đo local sau sửa: **124–244 ms**; các trang còn lại không ghi nhận CLS. Không throttle mạng, không tải quảng cáo thật, không đo cold-start điện thoại phổ thông. Observer không có đủ interaction event để kết luận **INP**; chưa có dữ liệu CrUX/Search Console. Không dùng số local để tuyên bố production đạt Core Web Vitals.

Bootstrap gzip 39.130 byte, giải nén 327.150 byte, median 7 ms; danh sách 17.617 ngành chưa nằm trong bootstrap. API tìm tổ hợp tốt nhất median 222,7 ms trong 5 lần local, response 55.114 byte. Không chạy load test hay bỏ kiểm tra dữ liệu/rate limit để đạt số này.

## D. Phân loại trạng thái

| Trạng thái | Hạng mục |
| --- | --- |
| **PASS** | 448 test, check, verify:data, audit:formulas, hai Worker dry-run; URL/canonical/heading/noscript, API và các luồng UI đã nêu. |
| **FIXED** | Đề unverified bị loại khỏi web/build; lịch sử cũ được giữ; phạm vi ads tách HTML; nonce/CSP; SSR/H1; hướng dẫn công cụ; CLS; chính sách OCR. |
| **WARNING** | Production vẫn có tài liệu URL trả 200; GitHub/lịch sử có bản chuyển đổi; 19 warning dữ liệu và một số công thức còn trạng thái chưa xác minh; OCR/AI không bảo đảm mọi lần; chưa kiểm định WCAG/INP thực địa. |
| **MANUAL CHECK** | Quyền từng đề/lời giải, xử lý bản GitHub đã public, CMP/Auto ads/page exclusions, Search Console/indexing, nguồn HUST/PDF hợp nhất, quy trình email và yêu cầu dữ liệu. |
| **BLOCKED** | Phát hành lên production và gửi xét duyệt: prompt yêu cầu không tự thực hiện. Không tự đổi secrets hoặc tự vào dashboard để thay đổi trạng thái xét duyệt. Không có bằng chứng tài khoản Search Console/CMP hiện tại trong audit. |

### Trạng thái production thực sự đã kiểm tra

HEAD `/`, `/tinh-diem-thpt/`, `/cam-nang/`, `/privacy`, `/phong-thi/`, `/ads.txt` đều 200; các trang HTML còn CSP quảng cáo của bản cũ. `/js/data/officialQuestionContent2026.js` và `/assets/practice-2026/math/pages/1.webp` cũng **200**. Vì vậy không báo bản sửa đã bảo vệ production hoặc đã được Google crawl. Chưa có thao tác deploy/push trong tác vụ này.

## E. Checklist trước khi yêu cầu xét duyệt

1. **Quyền nội dung:** rà 17 bộ trong báo cáo quyền; giữ chặn bộ chưa có căn cứ. Quyết định bản lưu riêng và xử lý file đã public trên GitHub/lịch sử; không chỉ ẩn thẻ đề.
2. **Cho phép phát hành:** sau khi xem diff, phê duyệt push/deploy riêng. Deploy cả Worker chính/OCR theo script hiện có, không cần đổi secrets cho bản sửa này. Kiểm tra lại 404 ảnh/module, 18 bài luyện, các URL HTML, canonical, H1 và ads.txt trên domain thật.
3. **AdSense/CMP:** kiểm tra Sites và Privacy & messaging. Thử đồng ý/từ chối/mở lại ở vùng áp dụng và xem trước vị trí desktop/mobile; loader chỉ có ở 8 bài. Không nhấp quảng cáo để thử. Cờ cấu hình không thay việc này.
4. **Search Console:** mở thuộc tính đúng domain; gửi/kiểm tra `/sitemap.xml`. URL Inspection: trang chủ, một công cụ, hai bài và một hồ sơ. So sánh canonical Google chọn, HTML render, robots, Coverage/Page indexing và Manual actions. Chỉ đánh dấu index khi dashboard cho bằng chứng; gửi sitemap không đồng nghĩa đã index.
5. **Nội dung/nguồn:** kiểm tra lại link HUST và PDF hợp nhất tốt nghiệp bằng trình duyệt, cập nhật khi nguồn chính thức thay đổi. Tiếp tục ghi 2026 là tham khảo cho 2027; không nâng trạng thái công thức thiếu căn cứ chỉ để làm đầy hồ sơ.
6. **Quyền riêng tư/vận hành:** bố trí người theo dõi email hỗ trợ, xác minh chủ tài khoản và xử lý yêu cầu xóa/bản sao; kiểm tra thời hạn chính sách với quy trình thực. Chưa thêm tên người vận hành vì người dùng trước đó yêu cầu không công khai; không tạo danh tính giả. Kiểm tra Core Web Vitals/INP bằng dữ liệu thực khi có.
7. **Gửi lại:** đọc các vấn đề cụ thể trong AdSense sau khi các mục trên xong, rồi chủ website quyết định yêu cầu xét duyệt. Không đặt thời hạn chắc chắn được duyệt.

## F. Đánh giá sẵn sàng

**Chọn kết luận 1: Chưa sẵn sàng yêu cầu xét duyệt lại đối với bản đang public.** Bản sửa local đã đáp ứng các kiểm tra kỹ thuật nêu trên và cải thiện phần nội dung còn thiếu, nhưng chưa được phát hành theo đúng ràng buộc của prompt. Quyền tài liệu ngoài web, CMP và bằng chứng index/hiệu năng production chưa được xác nhận. Khi bản sửa được cho phép phát hành và các mục thủ công có bằng chứng, có thể đánh giá lại mức sẵn sàng; không bảo đảm Google chấp thuận.

## Tài liệu đối chiếu

- [AdSense: nội dung và trải nghiệm người dùng](https://support.google.com/adsense/answer/10015918?hl=vi): hữu ích/nguyên bản/điều hướng; không có số bài hay số từ bảo đảm được duyệt.
- [Search Console: manual actions](https://support.google.com/webmasters/answer/9044175?hl=vi): không tự suy ra hình phạt Search từ việc AdSense từ chối.
- [Publisher Policies: Google Web Search spam policies](https://support.google.com/publisherpolicies/answer/11035931?hl=vi) và [intellectual property abuse](https://support.google.com/publisherpolicies/answer/10402772?hl=en).
- [Google: CSP cho AdSense](https://support.google.com/adsense/answer/16283098?hl=vi); [Cloudflare JavaScript Detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/); [Cloudflare Web Analytics/CSP](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/).
- [Thông tư 06/2026/TT-BGDĐT](https://vanban.chinhphu.vn/?docid=217071&pageid=27160), [Bộ trả lời về học bạ](https://chinhsachonline.chinhphu.vn/tuyen-sinh-2026-xet-hoc-ba-3-nam-phai-co-toan-hoac-ngu-van-87653.htm), [CTU: thông báo điểm chuẩn 2026](https://tuyensinh.ctu.edu.vn/chuong-trinh-dai-tra/177-thong-tin/1163-thong-bao-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-nam-2026.html). Các link trường/văn bản còn lại được lưu trong từng bài cẩm nang; trạng thái chưa kiểm tra lại được đã nêu rõ ở trên.
