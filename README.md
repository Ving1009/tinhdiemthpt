# Tính Điểm THPT

Website Vanilla JavaScript với Cloudflare Workers để tính điểm THPT, học bạ, tra cứu hồ sơ tuyển sinh 2026, xem công thức đã xác minh và tìm ngành theo điểm. Express vẫn được giữ để chạy backend cục bộ khi biên tập dữ liệu.

## Triển khai Cloudflare Workers

Production dùng hai Worker:

- `tinhdiemthpt`: giao diện, Static Assets, API trường/ngành và tiếp nhận báo sai qua Supabase.
- `tinhdiemthpt-ocr`: Gemini và OCR.space. Worker này không có URL public; Worker chính gọi qua Service Binding.

Việc tách OCR khỏi API tra cứu giúp mỗi tiến trình giữ bộ nhớ riêng. Dữ liệu nguồn trong `data/` không được public trực tiếp: lệnh build chỉ tạo bản đã loại metadata thu thập vào `.cloudflare/public/_worker-data/`, và Worker chặn mọi request bên ngoài đến đường dẫn này.

```powershell
npm.cmd install
npm.cmd run cf:dry-run
npm.cmd exec -- wrangler login
npm.cmd run cf:deploy
npm.cmd run cf:secrets
```

`cf:deploy` luôn triển khai Worker OCR trước rồi mới triển khai Worker chính. `cf:secrets` đọc `.env`, chỉ gửi nhóm khóa Gemini/OCR.space vào Worker OCR và nhóm Supabase vào Worker chính; script không in giá trị khóa. Không commit `.env`, `.dev.vars`, `.cloudflare/` hoặc `.wrangler/`.

Chạy local Cloudflare bằng hai terminal:

```powershell
npm.cmd run cf:dev:ocr
npm.cmd run cf:dev
```

Khi cả hai lệnh đang chạy, Wrangler tự nối Service Binding. Website mở tại địa chỉ mà `cf:dev` in ra. Lệnh `npm.cmd start` bên dưới vẫn dùng Express tại `http://127.0.0.1:3000` cho quy trình phát triển cũ.

## Cài đặt và chạy

Yêu cầu Node.js 20 trở lên.

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd start
```

Điền các khóa riêng vào `.env`, rồi mở `http://127.0.0.1:3000`. Hệ thống hỗ trợ tối đa 5 khóa Gemini qua `GEMINI_API_KEY`, `GEMINI_API_KEY_2` đến `GEMINI_API_KEY_5`, và 5 khóa OCR.space qua `OCR_SPACE_API_KEY_1` đến `OCR_SPACE_API_KEY_5`. Cũng có thể dùng `GEMINI_API_KEYS` hoặc `OCR_SPACE_API_KEYS` với các khóa ngăn cách bằng dấu phẩy. Không đưa `.env` vào Git hoặc sao chép khóa sang HTML, JavaScript phía trình duyệt, fixture và tài liệu.

Trên Windows, dùng `npm.cmd` để tránh lỗi PowerShell chặn `npm.ps1`. VS Code đã có task `Website: chạy backend tự cập nhật`, dùng trực tiếp `node.exe` và tự chạy khi mở thư mục. Nếu dùng Live Server, cấu hình trong `.vscode/settings.json` đã đặt thư mục gốc là `public/`; backend vẫn cần chạy ở cổng `3000` để cung cấp API.

Các lệnh kiểm tra:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run verify:data
npm.cmd run audit:formulas
```

`npm.cmd run verify:data` trả mã lỗi 1 khi gặp dữ liệu sai thật. Hồ sơ trường đã phân loại nhưng chưa có dòng ngành được báo warning để không tạo ngành giả.

Các lệnh kiểm tra và đóng gói ở trên áp dụng cho repository nguồn đầy đủ. `outputs/tinh-diem-thpt.zip` là bản runtime gọn, chỉ giữ `npm.cmd start` và `npm.cmd run dev`; ZIP không quảng cáo các lệnh cần `tests/`, `scripts/` hoặc dữ liệu kiểm toán đã chủ động loại khỏi gói.

## Kiến trúc

- `public/`: nguồn giao diện duy nhất được Express và Live Server phục vụ, gồm HTML, CSS, JavaScript, logo và công thức chạy trên trình duyệt.
- `worker/`: entry Worker chính, Worker OCR và router Web API dành cho Cloudflare.
- `server/`: Express API cục bộ cùng các service dùng chung với Worker OCR.
- `server/dataStoreCore.js`: tạo các `Map` và chỉ mục dùng chung; Worker nạp lười bản dữ liệu public từ Static Assets.
- `data/`: dữ liệu nội bộ về trường, ngành, tổ hợp và bộ công thức đã xác minh. Thư mục này không được phục vụ tĩnh.
- `lib/`: validator, bộ làm sạch response và các engine dùng chung.
- `scripts/`: công cụ kiểm tra hoặc nhập dữ liệu nội bộ.
- `tests/`: kiểm thử engine, dữ liệu, API, bảo mật và hiệu năng tải ban đầu.
- `formulas/`: registry công thức nội bộ phục vụ kiểm tra và biên tập dữ liệu; thư mục này không được web server công khai.

Frontend chỉ nạp danh mục nhẹ qua `/api/bootstrap`: trường, tổ hợp, môn và metadata tổng hợp. Hơn 17.000 dòng ngành không nằm trong gói đầu; tìm kiếm, bộ lọc, hồ sơ và phân trang gọi API khi cần. Server vẫn nạp dữ liệu một lần và tạo chỉ mục trong RAM nên mỗi thao tác không đọc lại JSON. HTML/CSS/JavaScript dùng `no-cache` để nhận phiên bản mới; logo có cache một tuần.

Hồ sơ trường lấy 25 dòng mỗi trang từ API. Bộ tính theo trường dùng `/api/universities/:id/major-options`, là danh mục lựa chọn gọn để không bỏ sót chương trình hoặc phương thức nhưng không buộc modal hồ sơ tải hàng trăm dòng chi tiết.

Các API public chính:

- `GET /api/bootstrap`
- `GET /api/universities`
- `GET /api/universities/:id`
- `GET /api/universities/:id/majors`
- `GET /api/universities/:id/major-options`
- `GET /api/universities/:id/admission-formulas`
- `GET /api/majors`
- `POST /api/majors/best-combinations`
- `GET /api/search?q=...`
- `GET /api/catalog/combinations`
- `GET /api/catalog/subjects`
- `POST /api/data-reports` (lưu hàng chờ cục bộ và đồng bộ Supabase; không có API public để đọc báo cáo)

Response thành công có dạng `{ "success": true, "data": ... }`; lỗi có `error.code` và `error.message`. API làm sạch metadata dùng cho thu thập và kiểm toán. `university.website` được giữ vì đó là trang chính của trường.

## Tính điểm

Chế độ THPT mặc định nhận đúng bốn môn, đối chiếu với catalog tổ hợp thật, tính mọi tổ hợp ba môn hợp lệ và xếp theo tổng điểm. Khóa canonical của từng ngoại ngữ ngăn Tiếng Anh khớp nhầm tổ hợp Tiếng Pháp, Đức, Nhật, Nga, Trung hoặc Hàn. Chế độ chọn một tổ hợp cụ thể vẫn dùng chung engine.

Tính học bạ hỗ trợ một môn tùy chọn có hệ số 2. Khi bật, điểm thô dùng thang 40 và không áp dụng trực tiếp công thức ưu tiên thang 30. Engine chỉ chuẩn hóa về thang 30 và cộng ưu tiên khi nhận cấu hình chuẩn hóa đã xác minh.

Registry public chỉ chứa công thức generic có quy tắc rõ ràng. Công thức riêng của trường chỉ được bật tính khi cả formula và dòng ngành có trạng thái xác minh; nếu thiếu, giao diện hiện “Đang cập nhật” hoặc “Chưa xác minh”. Hiện ba dòng chương trình đã liên kết công thức của Trường Đại học Bách khoa Hà Nội (BKA) hỗ trợ tính trực tiếp: A00/A01 theo tổng ba môn và K01 theo công thức trọng số được khai báo trong dữ liệu. Các trường còn lại vẫn tra cứu được nhưng chưa sinh điểm theo trường. Năm 2027 đang bị khóa cho tới khi có công thức riêng.

## Dữ liệu tuyển sinh

Thêm trường trong `data/universities.json`. Mỗi trường cần `id`, `code`, tên, miền và trạng thái hồ sơ. Logo rõ nét được lưu trong `public/assets/logos/` và đường dẫn public được ghi ở trường `logo`. Chỉ dùng `logoStatus: "verified"` sau khi đã kiểm tra tệp; logo chưa chắc chắn dùng `logoStatus: "updating"` để giao diện hiện ký hiệu thay thế.

Thêm ngành hoặc phương thức trong `data/majors.json`. `combination` có thể chứa nhiều mã ngăn cách bằng dấu chấm phẩy; parser dùng token chính xác. Cutoff `verified` và `reference` phải có năm, điểm hữu hạn, thang điểm thật, điểm không vượt thang và URL kiểm toán nội bộ hợp lệ. `unverified` và `not_published` không được mang điểm số công bố. Không mặc định thang 30.

Thêm công thức generic ở `formulas/` cho nghiệp vụ nội bộ hoặc `public/formulas/` nếu trình duyệt cần tính. Công thức riêng của trường phải khai báo đầy đủ hệ số, thang thô, chuẩn hóa, cách áp dụng ưu tiên và trạng thái xác minh trước khi đăng ký vào public registry.

Metadata thu thập như `sourceUrl`, `sourceTitle`, `referenceSources`, `methodsSourceUrl` và `formulaSourceUrl` được giữ trong dữ liệu private để kiểm toán. Không đưa các trường này vào `public/`; bộ làm sạch API loại chúng đệ quy trước khi trả response. Metadata bootstrap có số trường, số dòng ngành và thống kê trạng thái để theo dõi mức độ hoàn thiện, không chứa liên kết thu thập.

## Công thức xét tuyển theo trường

`data/admission-formulas-2026.json` chỉ chứa công thức được nguồn chính thức nêu trực tiếp, map bằng `universityId`, mã trường và nhãn phương thức trong repository. UI luôn liệt kê phương thức của trường, nhưng phương thức chưa đủ căn cứ chỉ hiện “Chưa có công thức chính thức được xác minh.”. Công thức hợp lệ xuất hiện trong cả công cụ theo trường và hồ sơ trường; quy đổi chứng chỉ chỉ được mô tả bên trong công thức cụ thể khi nguồn chính thức có nêu.

`npm.cmd run audit:formulas` đối chiếu toàn bộ `công thức thpt2.md` với 326 trường, 17.617 dòng ngành, phương thức, anchor, code fence, trạng thái, nguồn và dấu hiệu sao chép bất thường. Không map theo tên gần giống và không tự tạo công thức còn thiếu.

## Nguyện vọng, so sánh và xuất dữ liệu

Danh sách nguyện vọng được lưu trên thiết bị, giữ năm, trường, ngành/chương trình, cơ sở, phương thức, tổ hợp, thang điểm và mốc điểm chuẩn có sẵn. Định danh phương án phân biệt chương trình, cơ sở, năm, phương thức, tổ hợp và quy tắc; mỗi mục cá nhân có `wishId` riêng để xóa hoặc di chuyển đúng mục. Người dùng có thể đổi thứ tự, hoàn tác xóa và so sánh 2–4 mục. Khu vực xuất chỉ có một nút `Xuất file PDF`; module PDF được tải khi bấm và file `nganh-phu-hop-YYYY-MM-DD.pdf` tự tải về ngay.

Khi chuyển lần đầu từ localStorage v1/v2 sang v3, ứng dụng giữ một bản phục hồi ở `thpt-saved-wishes-migration-backup`. Điểm trong nguyện vọng là điểm tại thời điểm lưu; nếu hồ sơ điểm hiện tại thay đổi, giao diện thông báo riêng thay vì âm thầm thay số đã lưu.

Đường dẫn `#truong/<id-truong>` và `#nganh/<id-truong>/<id-nganh>` mở trực tiếp hồ sơ tương ứng, tải lại được và không chứa điểm cá nhân.

Danh sách này là bản chuẩn bị cá nhân, không phải hồ sơ nguyện vọng đã gửi lên hệ thống tuyển sinh. Trường học phí, cơ sở hoặc điều kiện chưa có dữ liệu được ghi rõ “Chưa có dữ liệu”, không tự suy ra.

## Quét học bạ

Trình duyệt kiểm tra tệp, rồi giải mã và tối ưu lần lượt từng ảnh thành JPEG với cạnh dài tối đa 2.000 px và chất lượng 0,86. Hướng EXIF được áp dụng trước khi vẽ lại ảnh; bitmap và canvas được giải phóng ngay sau mỗi lượt. Giới hạn đầu vào vẫn là 12 ảnh, 7 MB mỗi ảnh và 24 MB tổng.

Ảnh đã tối ưu được gửi đến backend để thử Gemini rồi OCR.space. Trong từng nhóm dịch vụ từ xa, bộ điều phối xoay vòng khóa khỏe và tạm ngừng khóa gặp quota, lỗi xác thực, timeout hoặc lỗi máy chủ. Khóa Gemini và OCR.space chỉ tồn tại ở backend, không xuất hiện trong HTML hay JavaScript phía trình duyệt.

Nếu các dịch vụ từ xa không dùng được, frontend mới tải động Tesseract.js, core WASM và dữ liệu ngôn ngữ Việt–Anh. Một worker chạy tuần tự toàn bộ ảnh của lượt quét và luôn được `terminate()` sau khi hoàn tất hoặc gặp lỗi. Backend chỉ phục vụ các tệp tĩnh này; backend không import, khởi tạo hay chạy worker Tesseract.

OCR.space nhận từng ảnh JPEG với `language=vnm`, `isTable=true`, `scale=true` và tự nhận hướng ảnh. `OCR_SPACE_ENGINE` nhận `2` hoặc `3`; `OCR_SPACE_TIMEOUT_MS` giới hạn tổng thời gian OCR.space cho một yêu cầu. Nếu gói OCR.space cho phép tệp lớn hơn, có thể tăng `OCR_SPACE_MAX_IMAGE_BYTES` nhưng không quá giới hạn tải lên 7 MB. Xem giới hạn hiện hành trong [tài liệu OCR.space chính thức](https://ocr.space/ocrapi).

Kết quả từ mọi bộ máy đi qua cùng parser, validator và bước xem trước; chỉ sau khi người dùng xác nhận mới điền bảng điểm. Website không lưu ảnh, raw response hoặc ảnh trong `localStorage`. Bảng mơ hồ không được đoán điểm.

Hai môn Công nghệ công nghiệp và Công nghệ nông nghiệp có ánh xạ riêng. Nếu ảnh chỉ ghi “Công nghệ”, bước xem trước bắt buộc người dùng chọn định hướng; hệ thống không chép điểm sang cả hai môn và không ghi đè điểm đã nhập khi còn xung đột.

Các điểm nhập thủ công và nguyện vọng đã lưu chỉ nằm trong `localStorage` của thiết bị. Mỗi khu vực có nút xóa dữ liệu tương ứng. Báo dữ liệu sai chỉ được ghi khi người dùng bấm gửi. Trên Cloudflare, Worker ghi thẳng vào bảng Supabase `data_reports` và chỉ trả thành công sau khi Supabase xác nhận. Khi chạy Express cục bộ, backend vẫn lưu trước vào `.local/pending-data-reports.ndjson` rồi đồng bộ để hỗ trợ biên tập ngoại tuyến. Thư mục `.local/` không được phục vụ tĩnh và không nằm trong bản ZIP chia sẻ.

Tạo bảng cloud bằng cách chạy [supabase/data-reports.sql](supabase/data-reports.sql) trong Supabase SQL Editor. Sau đó đặt `SUPABASE_URL`, `SUPABASE_SECRET_KEY` và `SUPABASE_REPORTS_TABLE` trong `.env`. Secret key chỉ được dùng ở backend; bảng bật RLS, thu hồi quyền của `anon` và `authenticated`, nên trình duyệt không thể đọc danh sách báo cáo.

## Quản lý dữ liệu nội bộ

Công cụ này chỉ có trong repository nguồn và chạy trong terminal của máy chủ; bản runtime ZIP không chứa script quản trị hay hàng chờ riêng tư. Không có route đọc hoặc sửa báo cáo trên web. Tệp hàng chờ và nhật ký duyệt nằm trong `.local/`, bị loại khỏi Git, static server và ZIP chia sẻ.

```powershell
npm.cmd run admin:data -- overview
npm.cmd run admin:data -- reports --status pending_review
npm.cmd run admin:data -- review <id> --status in_review --note "Đang đối chiếu"
npm.cmd run admin:data -- review <id> --status resolved --note "Đã kiểm tra nguồn chính thức"
npm.cmd run admin:data -- sync-reports
```

`overview` liệt kê số hồ sơ theo trạng thái, các trường chưa có dòng ngành và số báo cáo theo trạng thái. `sync-reports` gửi lại các báo cáo chưa đồng bộ. Mỗi lần đổi trạng thái báo cáo được ghi nối tiếp vào `.local/data-report-audit.ndjson`, đồng thời cập nhật bản ghi Supabase nếu kết nối hoạt động; thao tác này không sửa `data/universities.json` hoặc `data/majors.json`.

## Tạo bản ZIP để chia sẻ

```powershell
npm.cmd run package:share
```

Lệnh tạo `outputs/tinh-diem-thpt.zip` từ danh sách cho phép gồm mã chạy, dữ liệu runtime, README, cấu hình VS Code và `.env.example`. Script tự từ chối `.env`, `node_modules`, cache, tệp tạm và nội dung giống khóa API. Bản ZIP không gồm script thu thập hay tài liệu kiểm toán nội bộ.
