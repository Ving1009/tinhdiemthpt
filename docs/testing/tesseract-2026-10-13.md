# Kiểm tra nhận diện bảng điểm trên thiết bị — 13/10/2026

## Phạm vi

Cải tiến Tesseract chạy trong trình duyệt, không thay API OCR từ xa, công thức tính điểm hoặc dữ liệu tuyển sinh. Kiểm thử bằng Brave thật trên Windows, Intel Core i5-5200U, khoảng 8 GB RAM. Đây không phải phép đo trên điện thoại thật.

Các lượt quét qua giao diện đều đi theo luồng chọn ảnh → đồng ý xử lý → lỗi OCR từ xa giả lập → chọn quét trên thiết bị → đối chiếu bảng xem trước. Request OCR từ xa bị chặn và trả lỗi giả lập; các request ngoài máy bị chặn trong kiểm thử local. Không bấm xác nhận lưu điểm cá nhân. Ảnh gốc, OCR thô và bảng đối chiếu riêng nằm trong `.local/`, không đưa lên GitHub hoặc website.

## Thay đổi và nguyên nhân

- `public/js/core/localTranscriptTable.js`: tìm vùng tên môn chưa nhận được trong hàng có số ở cột điểm đã xác định. Không tự đoán môn còn thiếu theo danh sách chương trình học; không dùng điểm kiểm tra thành phần làm điểm trung bình.
- `public/js/clientTranscriptOcr.js`: đọc lại riêng tên môn, khớp chính xác với danh mục và giữ nguyên lớp/cột đã nhận diện. Việc này khắc phục trường hợp đọc “Ngữ văn” thành “Ngir van”, hoặc “Địa lí” thành “Bia lí”. Giữ nguyên cơ chế để trống khi các lần đọc điểm mâu thuẫn.
- `public/js/transcriptImageOptimizer.js`: cắt ô từ ảnh gốc, thêm viền trắng, tăng tương phản từng ô và thử thêm một kích thước khi còn thiếu dấu thập phân. Tên môn được giữ màu và phóng lớn một lần để tránh mất nét; ô điểm được nhị phân hóa trước khi phóng lớn. Không chuyển `54` thành `5.4` bằng phép chia hoặc suy đoán.
- `public/index.html`, `public/js/main.js`, `public/js/transcriptScanner.js`: tăng phiên bản tài nguyên để trình duyệt tải bản OCR mới. Bước đồng ý, xem trước, đối chiếu và xác nhận vẫn được giữ.
- `public/css/style.css`: giới hạn vùng vẽ của bảng xem trước để bảng rộng không làm cả trang cuộn ngang trên mobile; bảng vẫn có thanh cuộn riêng.
- Ba file test của các module OCR: thêm kiểm tra tên môn hỏng, tên chưa xác định, đọc lại vùng gốc, điểm mâu thuẫn, ô trắng, giữ màu tên môn và giải phóng ảnh/canvas. Vẫn dùng một worker và đọc ảnh tuần tự.

## Bộ ba ảnh học bạ giấy

Đối chiếu 81 ô số: 9 môn × 3 kỳ × 3 lớp. Không tính ô đánh giá Đạt thành điểm số. Cả môn Giáo dục quốc phòng và an ninh đều được đối chiếu.

Kết quả ghi nhận ngày 12/10 trên phiên bản trước: 77/81 ô đúng mỗi lượt, còn 4 ô trống, không có ô sai; ba lượt cuối đều chưa đọc đủ. Đó là mốc lịch sử trên cùng bộ ảnh, không phải phép đo tốc độ A/B trong cùng phiên chạy.

Kết quả cuối ngày 13/10, qua giao diện thực tế:

| Lượt | Hàng môn | Ô đúng | Ô thiếu | Ô sai | Thời gian |
|---|---:|---:|---:|---:|---:|
| 1 | 27 | 81/81 | 0 | 0 | 33,5 giây |
| 2 | 27 | 81/81 | 0 | 0 | 34,0 giây |
| 3 | 27 | 81/81 | 0 | 0 | 33,1 giây |

Các nhật ký riêng: `tesseract-final-photos-1.log`, `tesseract-final-photos-2.log`, `tesseract-final-photos-3.log`.

Các số đo thời gian dùng tài nguyên OCR đã có trong bộ nhớ đệm. Lượt tải đầu và thiết bị khác có thể chậm hơn; không suy rộng độ chính xác của ba ảnh này thành mọi học bạ.

## Mẫu công khai và trường hợp phải từ chối

| Mẫu | Kết quả | Giới hạn |
|---|---|---|
| vnEdu máy tính, HK1 | 9/9 ô trung bình nhìn rõ đúng, tăng từ mốc trước 4/9; ô Sinh học vẫn trống | Ảnh không ghi lớp; chọn lớp 11 chỉ là lựa chọn kiểm thử, không phải lớp thật của ảnh. GDCD không được đổi thành Giáo dục kinh tế và pháp luật. |
| Biểu mẫu điện tử HUNRE, lớp 10 | 3/3 ô Toán đúng | Mẫu minh họa một hàng; không chứng minh đã hỗ trợ mọi biểu mẫu điện tử. |
| Bảng điểm in chụp VTC News | Chưa đọc được | Ảnh nhỏ, mờ và nhiều cột thành phần. |
| Học bạ viết tay cũ trong hướng dẫn HUNRE | Chưa đọc được | Chữ viết tay và tiêu đề chưa đọc đủ tin cậy. |
| Ứng dụng điểm lớp 12 có nhiều bảng và điểm dự đoán | Không nhập được | Không tự chọn một bảng hoặc coi điểm dự đoán là điểm trường cấp. |
| vnEdu Connect lớp 7 | Từ chối nhập vào THPT | Gợi ý lớp 11 không được ghi đè lớp 7. |
| SMAS bị cắt mất cột trung bình | Từ chối | Chọn lớp/kỳ không được biến điểm thành phần thành điểm trung bình. |

Ở mẫu vnEdu, “Công nghệ” chưa ghi định hướng nên giao diện giữ điểm đã đọc và yêu cầu chọn Công nghệ công nghiệp hoặc Công nghệ nông nghiệp trước khi áp dụng. Ô môn chờ lựa chọn không phải điểm bị mất.

Nguồn mẫu đã xem ở lượt kiểm tra trước: [hướng dẫn chính thức HUNRE](https://hunre.edu.vn/download/news/2024/02/26/100938_HDAN%20DKXT%20ONL.pdf), [VNPT](https://vnpt.vn/doanh-nghiep/tu-van/vnedu-connect), [bảng điểm minh họa VTC News](https://vtcnews.vn/cha-me-khoe-bang-diem-cua-con-va-nhung-lan-chiu-tran-cua-tre-bi-diem-thap-ar591738.html), [hướng dẫn vnEdu Sforum](https://cellphones.com.vn/sforum/bat-mi-nhung-thu-thuat-su-dung-vnedu-nhu-mot-dan-chuyen-danh-rieng-cho-phu-huynh-hoc-sinh), [ứng dụng tính điểm Sforum](https://cellphones.com.vn/sforum/cach-tinh-diem-trung-binh-mon), [hướng dẫn SMAS FPT Shop](https://fptshop.com.vn/tin-tuc/danh-gia/cach-xem-diem-tren-smas-167481). Các bài hướng dẫn và ảnh minh họa không phải bộ dữ liệu đại diện cho mọi trường.

Tham khảo kỹ thuật: [API chính thức Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [hướng dẫn chất lượng ảnh của Tesseract](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

## Kiểm chứng

- `npm run check`: đạt.
- `npm test`: **472/472 đạt**, thêm 6 test, không bỏ qua test.
- `npm run verify:data`: đạt; các cảnh báo dữ liệu có sẵn vẫn giữ nguyên.
- `npm run audit:formulas`: đạt; các trạng thái thiếu căn cứ có sẵn vẫn giữ nguyên.
- `npm run cf:dry-run`: đạt cho cả worker OCR và worker chính, bao gồm build Static Assets.
- Giao diện hộp thoại tại 1366 px và 390 px, sáng/tối: không tràn trang, các nút/select vừa hộp thoại. Chưa đồng ý thì nút quét bị khóa; chọn nhập tay thì đóng hộp thoại và focus ô điểm.
- Bảng xem trước 27 hàng tại 1366 px và 390 px, sáng/tối: vừa khung, cả trang không cuộn ngang và bảng vẫn cuộn riêng trên mobile. Kiểm tra bằng số đo chiều rộng và thao tác cuộn thực tế.
- Bốn phép thử ảnh thật từ chối đúng: thiếu lớp không có gợi ý, kỳ học mâu thuẫn, lớp 7 với gợi ý lớp 11, SMAS chỉ có điểm thành phần.

Nhật ký riêng: `ocr-public-release.log`, `tesseract-final-dialog.log`, `tesseract-final-negatives.log`, `tesseract-preview-layout.log`, `tesseract-check.log`, `tesseract-tests.log`, `tesseract-data.log`, `tesseract-formulas.log`, `tesseract-dry-run.log`.

Ảnh mờ, viết tay hoặc nhiều bảng chưa hỗ trợ tốt vẫn cần nhập tay và đối chiếu ảnh gốc.
