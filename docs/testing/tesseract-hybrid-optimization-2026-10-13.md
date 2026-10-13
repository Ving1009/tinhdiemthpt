# Kiểm tra OCR học bạ trên thiết bị và quét bổ sung — 13/10/2026

## Kết quả đã xác minh

Website bắt đầu quét bằng Tesseract trên thiết bị. Người dùng có thể kiểm tra điểm ngay sau lượt quét này; ảnh chỉ được gửi để quét bổ sung khi họ chọn cách quét trực tuyến và đánh dấu ô đồng ý.

Ba lượt đo sạch cuối của bộ ba ảnh học bạ giấy mất 21,3, 21,5 và 21,1 giây, đều đúng 81/81 ô khi đối chiếu cả giá trị, môn, lớp và kỳ. Không có ô sai hoặc thiếu, không gửi request OCR trực tuyến. Trung vị là 21,3 giây, so với 35,6 giây của hai lượt trước khi sửa, giảm khoảng 40,2%. So với mốc local trực tiếp chưa cắt vùng ảnh là 32,9 giây, giảm khoảng 35,3%. Đây là kết quả trên một bộ ảnh và một máy kiểm thử, không phải cam kết tốc độ hoặc độ chính xác cho mọi học bạ.

Mẫu vnEdu đọc đúng 9/9 ô trung bình thuộc các môn đang hỗ trợ; mẫu biểu mẫu điện tử một hàng đọc đúng 3/3 ô. Các mẫu thiếu lớp, lớp ngoài THPT, kỳ học mâu thuẫn hoặc chỉ có điểm thành phần vẫn bị từ chối nhập vào bảng THPT.

Trạng thái của tài liệu: báo cáo trong quá trình kiểm thử. Các lượt production, cache lạnh, kiểm thử toàn dự án và thông tin phát hành còn chờ cập nhật ở cuối tài liệu.

## Môi trường và cách đối chiếu

- Windows, Brave thật, Intel Core i5-5200U, khoảng 8 GB RAM; thử website chạy trên máy kiểm thử.
- Bộ ba ảnh gốc đã được chủ website cho phép dùng: 27 hàng môn, 81 ô số cần đối chiếu. Ô đánh giá Đạt được loại khỏi phép đếm điểm số.
- Bảng chuẩn nằm riêng trong `.local/`. Kiểm thử so khớp từng ô theo môn, lớp và kỳ; số ô có dữ liệu riêng lẻ không được dùng để kết luận độ chính xác.
- Các lượt đo tốc độ ở bảng dưới dùng tài nguyên Tesseract đã được làm nóng bởi những lượt trước. Phép đo tải lần đầu trên storage/cache mới chưa hoàn tất.
- Các lượt trước khi sửa dùng luồng cũ: request OCR từ xa trả lỗi 503 giả lập, sau đó người dùng chọn quét local. Các lượt mới bắt đầu local trực tiếp. Vì vậy phép so sánh là thời gian thực tế của luồng thao tác, bao gồm phần xử lý ảnh được bỏ đi, không chỉ thời gian nhận diện trong worker.
- Ảnh, bảng chuẩn, tên học sinh, điểm từng ô và OCR thô không được đưa vào tài liệu này, GitHub hoặc Static Assets. Nhật ký riêng được dùng để lấy số liệu tổng hợp.

Đây chưa phải phép đo trên điện thoại thật. Việc giả lập kích thước màn hình mobile chỉ kiểm tra giao diện và thao tác; không đại diện cho CPU hoặc RAM của điện thoại.

## Những phần gây chậm và cách sửa

### Xử lý ảnh hai lần trước lượt quét local

Luồng cũ tối ưu toàn bộ ảnh cho API, rồi Tesseract lại xử lý các ảnh gốc ở chất lượng và kích thước riêng. Luồng mới chuyển file gốc vào engine, giải mã và xử lý từng ảnh theo thứ tự. Chỉ khi người dùng chọn quét trực tuyến, website mới tạo các JPEG dùng để upload.

Ảnh local giữ cách chuẩn bị đã kiểm thử: cạnh dài 1.600 px cho ảnh lớn; ảnh nhỏ có thể được phóng lên 2.400 px. Cách xử lý ảnh ngang được giữ để đọc các bảng điện tử. Tác vụ này không đổi quy tắc ảnh upload của API.

### Giải mã lại cả ảnh cho mỗi ô điểm

Trong Tesseract.js 7 đang cài, `recognize(blob, { rectangle })` vẫn nạp và giải mã toàn bộ ảnh trước khi giới hạn vùng đọc. Một lượt ba ảnh có 130 lần đọc lại tên môn, tiêu đề và ô khó ở bản đo chưa tối ưu vùng ảnh. Phần đọc lại mất khoảng 15,84 giây.

Bản mới giải mã ảnh chi tiết một lần cho mỗi trang, rồi cắt các vùng ô điểm thành PNG giữ nguyên pixel. Vùng cắt có thêm 128 px xung quanh để Tesseract còn đủ ngữ cảnh xử lý tương phản; `SetRectangle` vẫn chỉ đọc đúng phần ô ban đầu. Các lần thử PSM 13/7, vùng inset, đọc ảnh gốc và quy tắc đồng thuận được giữ.

Một thử nghiệm cắt sát ô chỉ mất 22,2 giây nhưng còn thiếu một ô, đúng 80/81. Thử nghiệm đó bị loại. Vùng đệm 128 px đọc đủ 81/81 trong các lượt kiểm tra tiếp theo. Không bỏ qua lần đọc mâu thuẫn, không đoán dấu thập phân hoặc sửa riêng theo bộ ảnh mẫu.

### Tạo ảnh chi tiết khi không cần đọc lại

Engine chỉ tạo bản chi tiết 2.400 px khi tiêu đề, tên môn hoặc ô điểm cần đọc lại. Một bảng đã rõ không phải giải mã và tạo thêm bản ảnh này. Bitmap/canvas được giải phóng sau từng ảnh; ảnh không được xử lý song song bằng nhiều worker.

### Hủy quét và giới hạn chờ

Mỗi lượt dùng một worker. Engine nhận `AbortSignal`, có giới hạn chờ khi tải module, khởi tạo và nhận diện từng ảnh. Hủy quét dừng việc nhận kết quả và các ảnh kế tiếp; bitmap hoặc worker hoàn thành muộn được giải phóng. Mã phiên thao tác ở scanner ngăn kết quả cũ ghi lên lượt mới.

Tesseract 7 tạo native worker đồng bộ nhưng chỉ trả handle API sau khi khởi tạo xong. Website theo dõi đúng worker của lượt OCR bằng một Proxy tạm trong lời gọi đồng bộ `createWorker`, rồi khôi phục constructor ngay trước khi chờ Promise. Nhờ vậy, hủy, timeout hoặc lỗi khởi tạo có thể terminate native worker ngay cả khi Promise không bao giờ hoàn tất. Worker khác không bị bắt hoặc dừng. Các test kiểm tra cả constructor chỉ đọc, lỗi throw và handle đến muộn; nếu nâng Tesseract trong tương lai, cần kiểm tra lại giả định tạo worker đồng bộ này.

## Tốc độ và độ chính xác

### Bộ ba ảnh giấy

| Phiên bản / lượt | Tổng thời gian từ thao tác quét | Ô đúng | Ô thiếu | Ô sai | Ghi chú |
| --- | ---: | ---: | ---: | ---: | --- |
| Trước khi sửa, lượt 1 | 36,3 giây | 81/81 | 0 | 0 | Luồng cũ, API lỗi giả lập để vào local |
| Trước khi sửa, lượt 2 | 34,9 giây | 81/81 | 0 | 0 | Cùng bộ ảnh, cache đã ấm |
| Local trực tiếp, chưa cắt vùng PNG | 32,9 giây | 81/81 | 0 | 0 | Mốc đo các bước xử lý |
| Cắt sát ô, thử nghiệm bị loại | 22,2 giây | 80/81 | 1 | 0 | Không dùng để phát hành |
| Vùng đệm 128 px, lượt đầu | 33,5 giây | 81/81 | 0 | 0 | Chạy trùng lúc `npm test` dùng CPU; loại khỏi phép tính tốc độ |
| Vùng đệm 128 px, lượt sạch 1 | 21,3 giây | 81/81 | 0 | 0 | Không có request OCR API |
| Vùng đệm 128 px, lượt sạch 2 | 21,5 giây | 81/81 | 0 | 0 | Không có request OCR API |
| Vùng đệm 128 px, lượt sạch 3 | 21,1 giây | 81/81 | 0 | 0 | Không có request OCR API |

Trung vị trước được tính từ hai lượt: `(36,3 + 34,9) / 2 = 35,6` giây. Trung vị sau là 21,3 giây của ba lượt 21,1/21,3/21,5. Các lượt trước không được reset toàn bộ cache để chứng minh trạng thái lạnh; đây là phép so sánh trong điều kiện máy/cache hiện tại. Cần thêm mẫu, lượt tải lạnh và thiết bị khác trước khi suy rộng kết quả.

Nhật ký riêng: `.local/hybrid-baseline-1.log`, `hybrid-baseline-2.log`, `hybrid-after-instrumented-1.log`, `hybrid-after-crop-1.log`, `hybrid-after-context-1.log`, `hybrid-after-context-2.log`, `hybrid-after-context-3.log`, `hybrid-after-context-4.log`.

### Thời gian theo bước, ba ảnh

| Bước trong engine | Local trực tiếp, chưa cắt vùng | Vùng đệm 128 px, sạch 1 | Vùng đệm 128 px, sạch 2 |
| --- | ---: | ---: | ---: |
| Khởi tạo worker | 0,82 giây | 0,29 giây | 0,30 giây |
| Giải mã, tạo ảnh và cắt vùng | 4,17 giây | 5,02 giây | 5,12 giây |
| OCR toàn trang lần đầu | 11,68 giây | 12,06 giây | 11,71 giây |
| OCR các vùng cần đọc lại | 15,84 giây | 3,44 giây | 3,93 giây |
| Phân tích bảng, không gồm OCR/xử lý ảnh | 0,17 giây | 0,15 giây | 0,16 giây |
| Số lần đọc vùng cần thử lại | 130 | 136 | 136 |
| Tổng trong engine | 32,79 giây | 20,99 giây | 21,24 giây |

Việc cắt PNG thêm thời gian xử lý ảnh nhưng giảm đáng kể chi phí giải mã ảnh trong mỗi lần OCR ô nhỏ. Số lần đọc lại không bị cắt bỏ để đạt tốc độ.

Timings còn tách thời gian import module, đọc danh mục môn, tải/khởi tạo core, đọc dữ liệu ngôn ngữ và khởi tạo API của Tesseract. Các mốc core/ngôn ngữ gồm cả đọc cache, giải nén hoặc khởi tạo, nên không được coi toàn bộ là thời gian tải mạng. Không dùng `performance.memory` để suy ra tổng RAM của worker; RAM chưa được đo bằng phương pháp đáng tin cậy.

### Một và sáu ảnh

| Bộ ảnh | Thời gian | Đối chiếu | Worker | Request OCR API |
| --- | ---: | --- | ---: | ---: |
| Một ảnh của bộ giấy | 8,0 giây | 27/27 đúng, không sai/thiếu | 1 | 0 |
| Sáu file: mỗi ảnh trong bộ ba được lặp lại một lần | 43,1 giây | 81/81 ô duy nhất đúng, không sai/thiếu | 1 | 0 |

Lượt sáu ảnh kiểm tra việc nhận và xử lý sáu file tuần tự, không phải sáu trang học bạ khác nhau. Có 162 vị trí điểm nhìn thấy qua sáu file, nhưng chỉ 81 khóa môn/lớp/kỳ duy nhất; phép đánh giá khử trùng các khóa này để ảnh lặp không bị báo thiếu. Engine thực hiện 272 lần đọc vùng, không mở thêm worker. Nhật ký riêng: `.local/hybrid-after-one.log`, `.local/hybrid-after-six.log`.

## Mẫu công khai và các trường hợp phải từ chối

Kết quả dưới đây được lấy từ `.local/hybrid-public-qa.log`, chạy engine thật trên ảnh minh họa. Mẫu công khai không phải bộ dữ liệu đại diện cho tất cả trường hoặc phần mềm quản lý học sinh.

| Mẫu | Kết quả sau khi tối ưu | Thời gian | Giới hạn |
| --- | --- | ---: | --- |
| vnEdu, người kiểm thử chọn lớp/kỳ phù hợp | 9/9 ô thuộc các môn hỗ trợ đúng, không sai/thiếu | 4,9 giây | Có thêm môn GDCD chưa ánh xạ vào danh mục hiện tại; cần người dùng kiểm tra. Không tự chuyển thành Giáo dục kinh tế và pháp luật. |
| Biểu mẫu điện tử HUNRE một hàng | 3/3 ô đúng | 2,3 giây | Bảng nhỏ hoàn chỉnh không bị gợi ý API chỉ vì có ít điểm. |
| vnEdu không có lớp và không chọn gợi ý | Không nhập vào THPT | 3,0 giây | Không suy đoán lớp. |
| vnEdu chọn kỳ mâu thuẫn với bảng | Từ chối | 3,3 giây | Không đổi điểm sang kỳ người dùng chọn sai. |
| vnEdu Connect lớp ngoài THPT | Từ chối | 2,5 giây | Gợi ý lớp THPT không ghi đè lớp trong ảnh. |
| SMAS chỉ còn cột thành phần | Từ chối | 4,6 giây | Không dùng TX/GK/CK làm điểm trung bình. |
| Bảng in chụp nhỏ/mờ của VTC News | Chưa đọc được | 10,0 giây | Chưa có cấu trúc đủ tin cậy để ước lượng số ô cần đọc. |
| Học bạ viết tay trong hướng dẫn HUNRE | Chưa đọc được | 9,6 giây | Chưa hỗ trợ tốt chữ viết tay. |
| Ảnh ứng dụng nhiều bảng/điểm dự đoán | Chưa nhập được | 4,3 giây | Không tự chọn bảng hoặc coi điểm dự đoán là điểm trường cấp. |

Ở mẫu vnEdu, 9 ô thuộc các môn hỗ trợ đều đúng nhưng một số header/cột thành phần và môn GDCD chưa được xác định đủ. Bản cuối trả độ đầy đủ là chưa xác định, không dùng mẫu này để tuyên bố đã đọc toàn bảng. Không có gợi ý gửi API tự động; người dùng có thể chủ động chọn quét bổ sung. Môn Công nghệ chưa rõ định hướng và Ngoại ngữ chưa rõ tên vẫn cần chọn đúng trước khi áp dụng. Kiểm tra lại sau các guard cuối vẫn đạt 9/9, 0 ô sai hoặc thêm sai, khoảng 4,9 giây; mẫu điện tử nhỏ vẫn đạt 3/3 trong 2,4 giây.

Nguồn ảnh, phần che thông tin cá nhân và kỳ/lớp gợi ý dùng trong kiểm thử được ghi trong manifest riêng. Các nguồn đã tra cứu và giới hạn của mẫu xem thêm trong [báo cáo OCR local trước đó](tesseract-2026-10-13.md). Không tải thêm ảnh hoặc dùng dữ liệu học sinh chưa được phép cho báo cáo này.

## Đánh giá chất lượng và khi nào gợi ý API

Ngưỡng tập trung ở `public/js/core/transcriptHybrid.js`:

| Điều kiện | Cách xử lý |
| --- | --- |
| Số ô nhìn thấy có cơ sở đáng tin cậy và độ phủ dưới 60% | Gợi ý quét bổ sung |
| Có ít nhất 8 vị trí điểm nhìn thấy trong cấu trúc đã xác định, nhưng chỉ nhận được 0–4 ô hợp lệ | Gợi ý quét bổ sung |
| Chưa xác định được bảng/lớp/cột hoặc số ô cần đọc | Giữ trạng thái chưa rõ mức độ đầy đủ; không tự suy ra thiếu nhiều điểm |
| Bảng nhỏ được đọc đầy đủ | Không gợi ý API vì số ô thấp |
| Còn ô mâu thuẫn, môn/cột chưa xác định | Hiển thị cần kiểm tra; không dùng confidence tổng làm bằng chứng đúng |

Chỉ các vị trí điểm nhìn thấy được nhận vào số cần đọc; không lấy số hàng nhân ba hoặc danh sách môn chuẩn để ép mọi kỳ phải có điểm. Điểm 0 được tính là điểm hợp lệ. Các cột thành phần và ô đánh giá không được tính thành điểm trung bình cần nhập. Khi không có khóa môn/lớp/kỳ chắc chắn, phép đếm được giữ ở mức chưa xác định.

Phép đếm gồm vị trí số chưa đọc thành điểm hợp lệ và môn có nhãn bị hỏng, nên đọc đủ một số ô hợp lệ không đồng nghĩa đã đọc đủ ảnh. Ngược lại, ảnh lặp được khử trùng theo môn/lớp/kỳ. Các cảnh báo này hỗ trợ người dùng kiểm tra, không xác nhận ảnh chính xác tuyệt đối.

## Quét bổ sung và bảo vệ điểm đã nhập

Luồng mới: quét local → xem trước và đánh giá → người dùng chọn quét bổ sung nếu cần → đồng ý gửi ảnh → xác minh Turnstile → API → đối chiếu → xác nhận điểm.

- Khi local đọc tốt, không tải ảnh tới API. Nút quét local không yêu cầu người dùng đồng ý upload.
- Hộp thoại cho biết ảnh sẽ được gửi khi chọn quét trực tuyến; người dùng có thể quét lại trên thiết bị hoặc chuyển sang nhập tay.
- API giữ thứ tự Groq → Gemini → OCR.space và các provider vision được cấu hình rõ ràng. Tác vụ này không đổi model, khóa hoặc chính sách key rotation của backend.
- Upload giữ JPG/PNG/WEBP, tối đa 6 file, mỗi file tối đa 7 MB; ảnh gửi API vẫn là JPEG tối đa 1.600 px, chất lượng 0,8 và tổng ảnh đã xử lý không quá 10 MB.
- Timeout/lỗi/quota của API giữ lại kết quả local để người dùng kiểm tra hoặc nhập tay. Không tự quét local theo vòng lặp vô hạn và không tự gửi lại ảnh sau khi người dùng hủy.
- Điểm local và API giống nhau được giữ; ô local trống có thể được API bổ sung; điểm khác nhau vẫn để trống và yêu cầu người dùng chọn theo ảnh gốc. Không lấy trung bình hai giá trị hoặc mặc định tin API hơn local.
- Mâu thuẫn giữa hai ảnh cùng môn/lớp/kỳ cũng được giữ, không dùng confidence để tự chọn một giá trị.
- Các chỉnh sửa ở bảng xem trước được bảo toàn khi API trả về. Điểm người dùng đã nhập hoặc xác nhận trong bảng chính không bị âm thầm ghi đè.
- Dòng đã xóa không quay lại khi quét bổ sung. Lịch sử tên môn/lớp đã sửa được giữ tạm để API không thêm lại nhận dạng cũ; chọn bộ ảnh mới sẽ xóa lịch sử này. Tên môn có khoảng trắng hoặc Unicode được chuẩn hóa khi đối chiếu mà vẫn giữ điểm người dùng đang sửa, kể cả giá trị chưa hợp lệ cần chỉnh lại.
- Chỉ điểm đã kiểm tra và xác nhận mới đi vào công cụ tính. Ảnh, OCR thô và tên học sinh không đi vào localStorage hoặc bản sao tài khoản của luồng quét này.

Các API thật của phiên bản trước đã được kiểm thử trong [báo cáo độ trễ API](ocr-api-latency-2026-10-13.md). Số đo Groq 7,45–8,51 giây ở báo cáo đó không được dùng để khẳng định tốc độ của luồng mới; production của luồng hybrid còn chờ kiểm tra.

### Số lần gọi API theo tình huống

| Tình huống | Bằng chứng hiện có | Request OCR trực tuyến |
| --- | --- | ---: |
| Local đọc đúng bộ ba ảnh, ba lượt sạch | Brave thật, engine thật | 0 mỗi lượt |
| Một ảnh giấy | Brave thật, engine thật | 0 |
| Sáu file lặp | Brave thật, engine thật | 0 |
| Mẫu công khai chạy trực tiếp engine local | Engine thật; không thực hiện bước upload | 0 |
| Bảng nhỏ đủ điểm, thiếu nhiều ô, từ chối consent, timeout/quota, merge mâu thuẫn | Test hồi quy; cần bổ sung kết quả UI đầy đủ | Chờ cập nhật |
| Chấp nhận quét bổ sung qua Turnstile và API thật | Chờ kiểm tra production | Chờ cập nhật |
| Tài khoản đăng nhập và phiên khách | Chờ bổ sung kết quả UI của luồng mới | Chờ cập nhật |

Test dùng mock kiểm tra điều kiện gọi và bảo toàn dữ liệu; chúng không chứng minh provider ngoài hoạt động hoặc còn quota.

## Cache và bộ nhớ

Tesseract, worker, core/WASM và dữ liệu `vie`/`eng` được phục vụ từ `/vendor/` của website. `cacheMethod: "write"` dùng cache đọc/ghi của Tesseract cho traineddata, kết hợp cache HTTP của các tài nguyên tĩnh. Mã OCR local đổi phiên bản import riêng; URL worker, WASM và traineddata không bị đổi chỉ vì thuật toán bảng điểm thay đổi.

Không xóa cache hoặc tự tải lại trang trong khi quét/nhập điểm. Khi nâng binary hoặc traineddata trong tương lai, cần cập nhật phiên bản và kiểm tra cache tương ứng; tác vụ này không nâng chúng.

Ảnh được giải mã tuần tự. Mỗi trang có thể giữ bitmap gốc và bitmap chi tiết khi đọc ô khó, sau đó đóng chúng trước trang tiếp theo. Các canvas vùng nhỏ được thu hồi sau khi tạo blob. Cách này tránh giữ cùng lúc sáu bitmap gốc, nhưng chưa có số đo RAM tổng của worker và tab, nên không đưa ra mức RAM tối thiểu hay khẳng định phù hợp mọi điện thoại.

Kiểm tra cache lạnh, cache nóng qua production và dữ liệu mạng thực tế: chờ cập nhật. Những thời gian core/ngôn ngữ ngắn trong các lượt đã chạy chỉ mô tả điều kiện cache hiện tại.

## File thay đổi

- `public/js/clientTranscriptOcr.js`: file gốc vào local trực tiếp; một worker, tín hiệu hủy, timeout, timings, cắt vùng có ngữ cảnh, evidence và giữ mâu thuẫn trước validator.
- `public/js/transcriptImageOptimizer.js`: cắt PNG đúng pixel, đóng canvas; dừng chuỗi tối ưu ảnh khi hủy và giải phóng blob đã tạo.
- `public/js/core/localTranscriptTable.js`: evidence vị trí số và cấu trúc bảng, giữ riêng điểm nhận diện với số ô cần kiểm tra.
- `public/js/core/transcriptHybrid.js`: ngưỡng chất lượng, khử trùng ô, đối chiếu local/API và giữ mâu thuẫn.
- `public/js/transcriptScanner.js`, `public/js/turnstile.js`: local trước, consent khi upload, hủy và bảo vệ luồng đang chạy; giới hạn chờ bước xác minh và request.
- `public/js/transcriptPreview.js`, `public/js/autoFillTranscript.js`, `public/js/main.js`: hiển thị lựa chọn ô mâu thuẫn, giữ chỉnh sửa của người dùng và bảo vệ điểm bảng chính; tăng phiên bản import cần thiết.
- `public/index.html`, `public/css/refinement.css`: các nút quét lại/quét bổ sung/hủy, hướng dẫn và phần hiển thị cần thiết trong giao diện học bạ.
- `public/privacy.html`, phần chính sách hiện có trong `public/js/main.js`, `README.md`: mô tả đúng luồng local trước và consent khi quét trực tuyến; viết thông báo theo Humanizer.
- `package.json` và các file test OCR/hybrid/autofill/scanner: thêm kiểm tra module và test hồi quy.
- Tài liệu này: số liệu tổng hợp, giới hạn và tình trạng kiểm chứng.

Không sửa dữ liệu tuyển sinh, công thức, điểm ưu tiên, model/khóa AI, tài khoản, phòng thi, PDF hoặc cấu hình AdSense. Những phần đọc/ghi điểm đã có chỉ được gia cố tại ranh giới xác nhận kết quả OCR.

## Kiểm thử và những phần còn chờ

Các test tập trung của engine, bảng, bộ xử lý ảnh, đối chiếu và giao diện đã đạt. Các ca gồm tạo một worker, đọc tuần tự, hủy trước/trong khi khởi tạo, worker đến muộn, hủy khi OCR/giải mã, đóng bitmap hoàn thành muộn, timeout, dữ liệu riêng tư, cache, cắt đúng pixel, điểm mâu thuẫn, dấu thập phân, header mất, noise chữ ký, chọn ngôn ngữ/định hướng và giữ ô trống. Bộ toàn dự án đạt 555/555, không hủy hoặc bỏ qua test.

| Lệnh hoặc phép thử | Trạng thái |
| --- | --- |
| `npm.cmd run check` | Đạt, exit 0 |
| `npm.cmd test` | Đạt 555/555, fail/cancelled/skipped 0, khoảng 57,7 giây |
| `npm.cmd run verify:data` | Đạt: 326 trường, 17.617 dòng ngành, 293 tổ hợp, 0 lỗi; 19 cảnh báo đã có |
| `npm.cmd run audit:formulas` | Đạt: anchor lỗi 0, 6/6 nguồn công thức tích hợp đạt; 1.212 cặp chưa đủ căn cứ vẫn được loại như trước |
| `npm.cmd run cf:dry-run` | Đạt: build 830 assets, dry-run Worker OCR và Worker chính thành công |
| Brave 1366 px và 390 px, sáng/tối | Đạt: trang không tràn ngang; bảng ở 390 px cuộn trong khung riêng |
| Chọn nhập tay trong hộp thoại | Đạt: đóng hộp thoại và focus ô nhập điểm |
| Hủy quét trong giao diện | Đạt: giữ 27 hàng xem trước, 0 request OCR API |
| File TXT không hợp lệ | Đạt: thông báo tiếng Việt và không quét file này |
| Tệp trên 7 MB / chọn 7 ảnh | Đạt trên Brave: từ chối tệp lớn; giữ tối đa 6 ảnh, thông báo tiếng Việt |
| Quét lại / consent qua UI | Đạt: quét local không cần checkbox; mở hộp thoại giữ checkbox chưa chọn, nút gửi bị khóa; hủy/nhập tay không gọi API |
| Timeout/quota, xung đột, bổ sung ô thiếu, giữ sửa/xóa dòng | Test hồi quy đạt; lỗi dịch vụ được mô phỏng, không cố làm hết quota thực tế |
| Production, Turnstile/API thật, cache lạnh/nóng | Chờ kiểm thử sau deploy |

Không xóa hoặc bỏ qua test để đạt kết quả xanh. Các cảnh báo thiếu nguồn tuyển sinh/công thức của bộ dữ liệu hiện có được ghi riêng khi tổng hợp kiểm thử; chúng không phải lỗi mới do OCR.

Nhật ký kiểm tra giao diện riêng: `.local/hybrid-ui-qa.log`, `.local/hybrid-validation-qa.log`. Lượt quét lại trên bản cuối, sau guard header và hủy native worker, vẫn đúng 81/81, 0 request API, độ phủ 81/81 có căn cứ, mất 21,0 giây (`.local/hybrid-final-paper-2.log`). Các phép thử kích thước màn hình trên Brave không phải kiểm thử hiệu suất điện thoại thật.

## Rủi ro và cách khôi phục

Vùng cắt có ngữ cảnh đã đạt trên bộ ba ảnh và các mẫu hỗ trợ kiểm thử, nhưng mẫu giấy khác, ảnh lệch/mờ, nhiều bảng hoặc chữ viết tay vẫn có thể thiếu hoặc sai ô. Người dùng phải đối chiếu trước khi xác nhận. Confidence và độ phủ không thay thế kiểm tra này.

Ảnh tải lần đầu, mạng chậm, bộ nhớ thiếu, trình duyệt đóng tab hoặc hệ điều hành dừng tab nền có thể làm quét gián đoạn. Tín hiệu hủy bảo vệ luồng trong tab đang chạy; website không thể bảo đảm giữ bitmap khi hệ điều hành thu hồi toàn bộ tab. API cũng có quota, lỗi mạng và thời gian lưu theo chính sách dịch vụ ngoài.

Nếu phát sinh lỗi đọc ô do vùng PNG, có thể khôi phục riêng việc nhận diện numeric rectangle trên blob chi tiết đầy trang, giữ local trước, consent và các guard dữ liệu. Cách này trở về chi phí đọc ô ở bản 32,9 giây đã đối chiếu 81/81, không cần thay core/WASM/traineddata hoặc khóa API.

Nếu cần khôi phục toàn bộ phát hành, revert commit OCR hybrid đã phát hành rồi build/deploy lại cả Static Assets và Worker liên quan. Phải giữ thay đổi của người khác trong checkout, không dùng reset/xóa thư mục dữ liệu riêng để rollback. Commit cụ thể và phiên bản deploy được bổ sung dưới đây khi phát hành.

## Phát hành và kiểm tra production

Chỉ phát hành sau khi các kiểm thử quan trọng đạt và không còn regression nghiêm trọng.

- Commit: chờ cập nhật.
- Push GitHub: chờ cập nhật.
- Deploy Worker chính/OCR: chờ cập nhật.
- Brave tải đúng phiên bản frontend: chờ cập nhật.
- Local đọc tốt, 0 request OCR API trên production: chờ cập nhật.
- Lượt cache lạnh và cache nóng, thời gian/đối chiếu: chờ cập nhật.
- Consent → Turnstile → API thật → đối chiếu điểm: chờ cập nhật.

Các mã commit và thông tin triển khai của báo cáo API trước đó là phiên bản cũ; không dùng chúng để xác nhận luồng hybrid đã lên production.
