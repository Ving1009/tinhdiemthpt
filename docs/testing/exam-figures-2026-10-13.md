# Đối chiếu hình trong phòng thi

Đã đối chiếu 17 đề đầy đủ do người dùng cung cấp với các câu hỏi đang hiển thị trên web. Đề luyện Ngữ văn do website biên soạn không có hình. Đây là tài liệu 2026 dùng để luyện thi, không phải dữ liệu đề thi 2027.

## Hình đã bổ sung

| Môn | Câu có hình/bảng | Tệp ảnh riêng | Nội dung |
| --- | ---: | ---: | --- |
| Toán | 7 | 7 | Hình khối, bảng biến thiên, bảng số liệu, sơ đồ ô vuông, khối tròn xoay, đa giác |
| Vật lí | 3 | 2 | Sơ đồ nhiệt lượng kế và thanh kim loại trên ray; hai câu ngắn dùng chung hình |
| Hóa học | 6 | 6 | Cấu tạo phân tử, pin điện hóa, dụng cụ thí nghiệm, bảng thí nghiệm, thành phần xi măng |
| Sinh học | 14 | 16 | Cấu trúc DNA, biểu đồ, chuỗi thức ăn, bảng di truyền, diễn thế, ô mẫu |
| Địa lí | 4 | 4 | Biểu đồ và bảng dân số, lao động, vận tải |
| Công nghệ công nghiệp | 12 | 12 | Mạch điện, cổng logic, động cơ, bản vẽ, chương trình điều khiển |
| Công nghệ nông nghiệp | 5 | 5 | Bảng và biểu đồ kết quả thí nghiệm |
| Tin học | 4 | 4 | Bảng chương trình Python/C++; hình câu đúng/sai 3 chỉ thuộc nhánh Khoa học máy tính |
| Tiếng Pháp | 10 | 1 | Bảng thông báo chung cho câu 1–10 |
| **Tổng** | **65** | **57** | **67 lượt ảnh trong câu hỏi, gồm hai câu Sinh học mỗi câu có hai hình** |

Các đề Lịch sử, Giáo dục kinh tế và pháp luật, Tiếng Anh, Tiếng Nga, Tiếng Trung, Tiếng Đức, Tiếng Nhật và Tiếng Hàn không có hình minh họa riêng cần thêm sau khi đối chiếu từng trang. Các đoạn đọc và thông báo dạng chữ vẫn được giữ bằng văn bản.

## Cách lưu và hiển thị

- Ảnh nằm trong `public/assets/practice-2026/<môn>/figures/`. Ảnh được trích nguyên bản từ DOCX hoặc cắt từ trang đề; các phần có nguồn PDF được xuất ở 240 dpi. Lưu WebP lossless, không vẽ lại hoặc suy đoán nhãn/số liệu. Một số nguồn là ảnh chụp nên độ nét vẫn phụ thuộc bản gốc.
- `public/js/data/officialQuestionFigures2026.js` ghi câu, nhánh Tin học nếu có, đường dẫn ảnh, kích thước, mô tả và trang nguồn. Trang nguồn vẫn có thể mở trong mục đối chiếu đề gốc.
- Hình xuất hiện ngay dưới dữ kiện của câu khi làm bài và khi xem lại kết quả. Bấm hình để mở ảnh đầy đủ. Ảnh tự co theo màn hình; nền trắng giữ biểu đồ đọc được khi dùng giao diện tối.
- Không đổi mã đề, mã câu, đáp án chấm, thang điểm, thời gian thi hay định dạng lịch sử làm bài.

## Nội dung sửa khi đối chiếu

- Khôi phục trang thứ năm đề Hóa từ tệp trước đây bị xếp nhầm vào ảnh lời giải. Hiệu đính câu trả lời ngắn 2–6 theo trang đề này và trang liền trước; giữ đáp án và lời giải đã số hóa đang khớp đề.
- Câu đúng/sai 4 Sinh học có đủ hai phần bảng gia đình trên hai trang; các mệnh đề được khôi phục theo đề.
- Câu ngắn 2 Vật lí có đầy đủ dữ kiện dùng chung với câu 1.
- Bỏ mô tả hình suy đoán hoặc làm lộ đáp án ở một số câu Toán, Hóa và Công nghệ công nghiệp. Bỏ yêu cầu phải tìm đồ thị Sinh học ở trang khác vì hình đã nằm trong câu.

## Kiểm chứng

- `npm run check`: đạt.
- `npm test`: 454/454 đạt, gồm kiểm tra gắn hình đúng câu/trang nguồn, tệp tồn tại, hiển thị khi làm và xem lại, đúng nhánh Tin học, an toàn URL và trang đề Hóa còn thiếu.
- `npm run cf:dry-run`: đạt với cả Worker chính và Worker OCR.
- Kiểm tra Brave: tất cả 18 môn và hai nhánh Tin học; ảnh giải mã đúng kích thước, không tràn ngang ở 1366 px và 390 px; hiển thị khi xem kết quả. Bài Toán đủ đáp án đạt 10 điểm, giữ đáp án sau tải lại, mở được ảnh lớn và lời giải từng câu.

Tài liệu do người dùng cung cấp vẫn giữ thông báo nguồn và tình trạng rà soát quyền đăng lại hiện có. Việc đối chiếu hình không thay thế kiểm chứng nguồn chính thức hay hiệu đính toàn bộ đáp án.
