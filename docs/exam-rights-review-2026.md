# Tài liệu đề thi cần xác minh quyền sử dụng

Ngày kiểm kê: 12/10/2026. Danh sách lấy từ `public/js/data/officialPracticeExams2026.js`, không suy ra giấy phép từ nhãn `official-paper` hoặc việc người dùng cung cấp file.

**Cả 17 bộ đều chưa có đủ căn cứ quyền đăng lại trong repository.** Metadata ghi “Đề thi do người dùng cung cấp”; chưa có văn bản cho phép, giấy phép công khai hay hồ sơ xác minh quyền riêng cho phần lời giải. Tên “chính thức” và mã đề dưới đây là nhãn đã có trong dữ liệu, không phải kết luận xác thực nguồn/bản quyền của audit.

## Kiểm kê từng bộ

Các thư mục trong bảng nằm dưới `public/assets/practice-2026/`. “Câu/mục” là số mục dữ liệu tương tác, gồm câu đúng/sai có nhiều ý; không cộng số ý để gọi là số câu chính thức. Số ảnh là đề / đáp án / lời giải. Mọi bộ có trạng thái **UNVERIFIED — tạm ngừng công bố trên web**.

| Môn | Mã đề trong metadata | Thư mục | Câu/mục | Ảnh đề / đáp án / lời giải | Lời giải số hóa |
| --- | --- | --- | ---: | --- | ---: |
| Toán | 0101 | `math/` | 22 | 4 / 0 / 8 | 22 |
| Vật lí | 0211 | `physics/` | 28 | 4 / 0 / 6 | 28 |
| Hóa học | 0344 | `chemistry/` | 28 | 4 / 0 / 8 | 28 |
| Sinh học | 0430 | `biology/` | 28 | 6 / 0 / 16 | 28 |
| Lịch sử | 0828 | `history/` | 28 | 4 / 0 / 7 | 28 |
| Địa lí | 0920 | `geography/` | 28 | 4 / 0 / 8 | 28 |
| Giáo dục kinh tế và pháp luật | 1026 | `economic-law/` | 28 | 4 / 0 / 7 | 28 |
| Tin học | 0501 | `informatics/` | 30 | 4 / 1 / 0 | 0 |
| Công nghệ công nghiệp | 0601 | `industrial-tech/` | 28 | 4 / 0 / 0 | 0 |
| Công nghệ nông nghiệp | 0734 | `agricultural-tech/` | 28 | 4 / 1 / 0 | 0 |
| Tiếng Anh | 1127 | `english/` | 40 | 4 / 0 / 5 | 40 |
| Tiếng Nga | 1225 | `russian/` | 40 | 4 / 1 / 0 | 0 |
| Tiếng Pháp | 1325 | `french/` | 40 | 4 / 1 / 0 | 0 |
| Tiếng Trung Quốc | 1428 | `chinese/` | 40 | 4 / 2 / 0 | 0 |
| Tiếng Đức | 1525 | `german/` | 40 | 4 / 1 / 0 | 0 |
| Tiếng Nhật | 1625 | `japanese/` | 40 | 4 / 1 / 0 | 0 |
| Tiếng Hàn | 1725 | `korean/` | 40 | 10 / 1 / 0 | 0 |

Tổng cộng **150 ảnh**. Công nghệ công nghiệp có `answerSource` trỏ tới [OLM](https://olm.vn/bai-viet/dap-an-de-thi-tot-nghiep-thpt-2026-mon-cong-nghe-cong-nghiep-day-du-ma-de-683132577); đường dẫn này không phải giấy phép sao chép. Các bộ còn lại không có URL nguồn đáp án riêng trong metadata. Nguồn gốc phần lời giải vẫn cần được kiểm tra với file gốc và tác giả.

## Vị trí lưu và hiển thị đã kiểm tra

- Thư mục `Đề thi/`: 53 file gốc tại thời điểm kiểm kê, được giữ nguyên; chưa được đưa vào commit audit.
- `public/assets/practice-2026/`: ảnh đề, đáp án và lời giải đã chuyển đổi.
- `public/js/data/officialQuestionContent2026.js`: văn bản câu hỏi đã số hóa.
- `public/js/data/officialSolutions2026.js`: lời giải số hóa.
- `public/js/data/officialPracticeExams2026.js`: metadata, đáp án, liên kết ảnh và ghép các phần trên.
- `public/js/data/practiceExams2026.js` và `public/js/practiceExam.js`: danh mục public, màn hình làm bài, chấm điểm và lịch sử. Bản sửa không còn import các bộ chưa xác minh vào danh mục public.

Trong bản sửa, Express/Worker trả 404 cho toàn bộ thư mục ảnh và ba module official, kể cả đường dẫn mã hóa. Build Cloudflare loại cả 153 tệp khỏi Static Assets. Đây là biện pháp chặn phục vụ web, **không phải xác nhận quyền sử dụng**. 18 bộ luyện ngắn tự biên soạn hiện có vẫn được dùng, có nhãn nguồn và giới hạn rõ; lịch sử điểm cũ được giữ, không hiển thị lại câu/lời giải bị rút. Bản nháp của đề bị rút cũng được giữ cho tới khi người dùng xác nhận thay thế bằng một bài mới.

**Giới hạn còn lại:** file chuyển đổi vẫn nằm trong checkout và một số file đã có trong Git/lịch sử GitHub công khai. Chặn Worker/build không làm chúng thành riêng tư trên GitHub, không xóa bản cache bên ngoài và chưa có hiệu lực trên production cũ. Cần chủ website quyết định giữ bản lưu ngoài web/repo public, kiểm tra giấy phép và xử lý bản đã công bố. Audit không rewrite lịch sử, xóa vĩnh viễn hay deploy.

## Hồ sơ cần có trước khi mở lại một bộ

1. Xác định đơn vị/tác giả của đề, hình minh họa, bảng đáp án và lời giải; lưu link công bố gốc, ngày, mã đề, tên file.
2. Lưu giấy phép hoặc văn bản cho phép đúng nội dung. Kiểm tra quyền đăng lại trên web có quảng cáo, chuyển đổi OCR, sửa định dạng và công bố lời giải; quyền của đề không tự bao gồm lời giải bên thứ ba.
3. Nếu dùng căn cứ pháp luật cho phép, xác minh căn cứ và phạm vi áp dụng với người có chuyên môn; không tự coi mọi đề mang tên “chính thức” đều thuộc diện đó.
4. Ghi ngày xác minh, người chịu trách nhiệm và phần được phép đăng. Không public giấy tờ có dữ liệu cá nhân.
5. Kiểm tra lại bản gốc, đáp án và Unicode, cập nhật nhãn nguồn/trạng thái, rồi mới bổ sung bộ được phép vào danh mục và phạm vi build/route tương ứng; thêm test chỉ cho phép bộ đã được xác minh.

Trong lúc chờ, tiếp tục dùng bộ tự biên soạn hoặc dẫn người dùng tới bản công bố chính thức có thể truy cập hợp lệ. Không bỏ chặn toàn bộ 17 bộ chỉ vì xác minh được một bộ.

Tham chiếu: [Google Publisher Policies — intellectual property abuse](https://support.google.com/publisherpolicies/answer/10402772?hl=en). Audit nhận diện phần chưa có chứng cứ, không đưa ra kết luận pháp lý rằng từng bộ chắc chắn vi phạm.
