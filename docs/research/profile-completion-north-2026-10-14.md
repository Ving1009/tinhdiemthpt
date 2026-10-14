# Bổ sung hồ sơ miền Bắc, đối chiếu ngày 14/10/2026

Thông tin năm 2026 dùng để tham khảo cho tuyển sinh 2027. Báo cáo ghi phần tra cứu nguồn; kết quả đã được tích hợp vào catalog và hồ sơ. Không thay đổi quy tắc tính điểm đang hoạt động.

Đã kiểm tra truy cập 215 URL của 87 trường có khoảng trống; 202 URL trả HTTP 200. Đây là kiểm tra liên kết, không có nghĩa đã đọc đủ đề án của 87 trường. Đã đọc và đối chiếu nội dung của 12 trường, cập nhật 71 mục: 44 source_reported, 20 source_description, 7 non_numeric. Không có phương thức nào được nâng thành official_verified hoặc tự bật tính.

| Trường | Nội dung đã bổ sung | Phần vẫn cần kiểm tra |
| --- | --- | --- |
| DLX | 8 mục | Chưa có bảng quy đổi điểm HSA/TSA/V-ACT sau kỳ thi; các phương thức này vẫn source_description. |
| DTB | 6 mục | Chưa có phép tính cuối học bạ và bảng quy đổi HSA/TSA/SPT. |
| HDT | 5 mục | Có ĐXT=A+B+C nhưng chưa nạp đủ bảng quy đổi theo từng tổ hợp gốc và nhóm ngành. |
| KMA | 6 mục | Chỉ nội suy trong đúng 7 khoảng đã công bố; chưa xác nhận cách xử lý điểm ngoài khoảng bảng. Không tự tính. |
| LNH | 8 mục | Chưa có phép tính cuối/hệ số của hai nhánh năng khiếu. Bảng ĐGNL/ĐGTD có 8 mốc nhưng chưa xác nhận quy tắc giữa mốc. |
| MHN | 9 mục | Có hệ số, phạm vi và bảng nội suy; không ngoại suy ngoài ba khoảng đã công bố. Chưa kiểm thử thứ tự ưu tiên thang 50/30 để tự tính. |
| QHD | 5 mục | Thiếu điều kiện A-Level riêng của Victoria và bảng quy đổi HSA đầy đủ; chưa xác nhận thứ tự điểm cộng/ưu tiên trong mọi nhánh. |
| QHE | 5 mục | Bảng HSA trong nước khác điều kiện chương trình liên kết. Hai trang chính thức mô tả khác kỳ học học bạ liên kết. |
| QHQ | 2 mục | Hai phương thức bổ sung là điều kiện của Keuka; không suy thành công thức chung cho mọi chương trình. |
| SKH | 5 mục | Đầu vào HSA/TSA/V-SAT trong bảng đã là thang 30, chưa xác nhận bước chuyển thang gốc. Khoảng học bạ cao nhất bị gộp chưa rõ. |
| THP | 7 mục | Chưa nạp đủ bảng phân vị cụ thể; dẫn công cụ chính thức để tra. |
| THV | 5 mục | Câu quy đổi 95% chưa rõ chiều nhân/chia; mã TS03 mâu thuẫn giữa mô tả và dòng CNTT. |

Các thay đổi phạm vi đáng chú ý:

- MHN: thêm phương thức dự bị 500 cho 18 ngành có đánh dấu trong PDF; thu hẹp tuyển thẳng 301 từ 22 xuống 9 ngành theo bảng chính thức.
- LNH: thêm V-ACT cho 26 ngành đã đối chiếu theo bảng ngưỡng và Phụ lục 01; mã Kỹ thuật xây dựng 7580201 được lấy từ phụ lục, không suy từ tên.
- DLX: thêm dự bị đại học 500 cho 28 chương trình/ngành Hà Nội theo mục 5.1 dẫn chiếu bảng ngành mục 3.
- SKH: bỏ Sư phạm tiếng Anh khỏi TSA theo ô gạch ngang trong thông báo 612.

KMA và MHN đã có biểu thức, hệ số/phạm vi và bảng quy đổi được công bố. Vẫn giới hạn trong miền điểm có bảng; chưa thể coi tất cả trường, tất cả đầu vào hoặc mọi cách cộng ưu tiên đã được kiểm thử để tự tính. 75 trường còn lại mới kiểm tra liên kết, tiếp tục giữ trạng thái cần nghiên cứu.

Kiểm tra riêng: JSON đọc được; 71 khóa phương thức đều khớp phương thức hiện có hoặc additionalMethods; 100% có URL primary và checkedAt=2026-10-14; không có calculationRule/autoCalculate. Không chạy build/test toàn repo để tránh xung đột với agent chính.

Bằng chứng chi tiết, URL và mục/trang nằm trong `data/research/profile-completion-north-2026-10-14.json`.
