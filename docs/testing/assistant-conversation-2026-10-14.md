# Mở rộng trợ lý tư vấn — 14/10/2026

## Thay đổi

Trợ lý có thể giải thích phương thức xét tuyển, so sánh định hướng ngành, gợi ý cách chọn ngành, ôn tập, sắp xếp nguyện vọng và hướng dẫn dùng website. Câu hỏi tư vấn chung không phải chờ kho hồ sơ trường, cũng không cần có thẻ tìm kiếm mới được trả lời.

- Prompt chung cho các provider phân biệt kiến thức chung với dữ kiện của từng trường/năm. Lịch sử sáu tin nhắn được dùng cho câu hỏi tiếp nối; không coi lời AI trước đó là nguồn xác minh.
- Local fallback có hướng dẫn khi API lỗi. Đổi miền giữ ngành và mức điểm; đổi chủ đề sang học phí, công thức hoặc so sánh ngành không kéo bộ lọc cũ theo.
- Sửa điểm học bạ/nguyện vọng cá nhân không mở biểu mẫu báo sai. Người dùng muốn báo sai vẫn phải gửi biểu mẫu và xác minh như trước.
- Công thức gửi kèm câu hỏi lấy từ phương thức có sẵn trong dữ liệu, không tạo hoặc sửa công thức tuyển sinh.
- Timeout bao gồm fetch và đọc JSON: kho hồ sơ tối đa 8 giây, request AI tối đa 45 giây. Kho lỗi không ngăn tư vấn chung; API lỗi không giữ spinner vô hạn.
- Bảng Markdown được chuyển thành các dòng có nhãn; dấu tiêu đề được bỏ. Ký hiệu toán như `|x|` được giữ. Câu trả lời bị provider cắt hoặc vượt giới hạn văn bản có thông báo yêu cầu viết tiếp.
- Lời mở đầu và câu gợi ý giới thiệu tư vấn, so sánh, ôn tập; câu chữ được rà soát theo Humanizer.

## Các phần cần giữ bằng dữ liệu có căn cứ

Năm lượt gọi provider thật trước khi gia cố đều trả HTTP 200, nhưng vẫn có lỗi nội dung: bảng Markdown, kế hoạch bị cắt, chuyên đề chưa xác minh, suy diễn học phí hoặc lịch công bố. Prompt chặt hơn chưa đủ để bảo đảm model tuân thủ.

Vì vậy, giao diện và bộ điều phối backend cùng giữ một số câu trả lời nội bộ, không để model viết lại:

- Ưu tiên có đủ điểm/khu vực/đối tượng dùng chính `calculateAdmissionPriority`. Ví dụ 26 điểm và KV1 cho ưu tiên 0,40; tổng 26,40.
- Học phí trường cụ thể chưa có dữ kiện xác nhận: nói rõ chưa đủ căn cứ, hướng dẫn kiểm tra đúng năm/chương trình. Thiếu dữ liệu không đồng nghĩa trường chưa công bố.
- Kế hoạch có môn và thời lượng rõ ràng dùng các giai đoạn kiểm tra phần yếu, ôn, luyện tập và sửa lỗi; giữ tổng thời gian người dùng đưa ra. Không tự gán chương học hoặc cấu trúc thi chính thức 2027.

Tư vấn nghề nghiệp, so sánh, giải thích và câu hỏi mở vẫn sử dụng các provider hiện có. Không đổi model, khóa, thứ tự dự phòng hoặc hạn mức token. Không bổ sung dịch vụ mới.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd test` | 590/590 đạt; fail/cancelled/skipped 0 |
| `npm.cmd run check` | Đạt |
| `npm.cmd run verify:data` | Đạt, 0 lỗi; 19 cảnh báo hiện có |
| `npm.cmd run audit:formulas` | Đạt, không sửa dữ liệu/công thức |
| `npm.cmd run cf:dry-run` | Đạt cho Worker chính và OCR |
| Brave, kho hồ sơ bị ngắt có chủ đích | Hai request AI thật HTTP 200; vẫn tư vấn chọn ngành và hỏi tiếp, không xuất thẻ ngẫu nhiên |
| Brave, API trả 503 giả lập | Tám câu hỏi vẫn có kết quả; câu hỏi đổi miền lọc đúng, hướng dẫn không mở nhầm báo sai; ô nhập được mở lại |
| Mobile 390 × 844 | Panel và ô nhập nằm trong màn hình, trang không tràn ngang |
| Gọi trực tiếp backend | Test hồi quy giữ ưu tiên, học phí chưa xác minh và kế hoạch có căn cứ; không gọi provider cho các câu này |

Brave với lỗi kho dữ liệu dùng API thật, không mock provider. Tình huống 503 chỉ chứng minh fallback của giao diện; không dùng để khẳng định tình trạng quota của dịch vụ ngoài.

## File chính

- `public/js/assistant.js`: deadline, tư vấn khi kho lỗi, lịch sử, giữ câu trả lời nội bộ có căn cứ.
- `public/js/core/localAdmissionsAssistant.js`: phân loại tư vấn/tra cứu, nối tiếp ngữ cảnh, hướng dẫn và bộ lọc miền.
- `server/configuredAssistant.js`: áp dụng cùng guard cho endpoint trực tiếp.
- `server/services/groqAssistant.js`: prompt chung, định dạng và dấu hiệu câu trả lời chưa hoàn tất.
- `server/services/openAiCompatibleAssistant.js`, `cloudflareWorkersAssistant.js`: truyền trạng thái giới hạn từ provider vào bước xử lý câu trả lời.
- `public/index.html`, `public/js/main.js`: câu gợi ý và phiên bản module.
- Các test assistant frontend, local, provider và `assistantCompleteness.test.js`: hồi quy các luồng trên.

Không thay dữ liệu tuyển sinh, thuật toán OCR, tài khoản, AdSense, phòng thi hoặc xuất PDF. Lịch sử tư vấn vẫn chỉ ở RAM của trang, giới hạn sáu tin; không thêm localStorage hay đồng bộ tài khoản.

## Giới hạn và phát hành

Tư vấn mở của model vẫn có thể sai hoặc thiếu; các ràng buộc prompt không phải bảo đảm độ chính xác. Các nhóm câu hỏi nội bộ là hướng dẫn tham khảo, không thay thông báo của trường. Website phục vụ kỳ thi 2027; hồ sơ và mốc 2026 vẫn chỉ là tham khảo. Kiểm tra mobile ở đây là kích thước giao diện trên Brave, không phải đo hiệu suất điện thoại thật.

Commit/push/deploy và kiểm chứng production: cập nhật sau phát hành.
