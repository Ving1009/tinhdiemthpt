# Đối chiếu tuyển sinh miền Trung ngày 14/10/2026

Dữ liệu 2026 dùng tham khảo cho website tuyển sinh 2027. Bản nghiên cứu có 27 mục bổ sung thuộc 13 trường, gồm công thức tổng, nhánh chứng chỉ, bước quy đổi và một phương thức xét điều kiện. Không bật bộ tính tự động; tất cả `calculationRule` đều `null`.

Trong 35 trường miền Trung có khoảng trống ở bản kiểm kê đầu lượt, đã đọc nguồn trực tiếp của 20 trường: BMU, CEA, DAD, DDG, DDK, DDY, DHD, DPQ, DPY, DQN, DVX, DYD, HVPG-HUE, KTD, TBD, TDV, TSN, TTD, UKH, YKV. Chỉ YKV:9215 đã đối chiếu đủ biểu thức số, phạm vi và ưu tiên để ghi `official_verified`; DAD:7607 là xét điều kiện, ghi `non_numeric`. Các mục `source_reported` vẫn chỉ tra cứu và có giới hạn trong từng bản ghi. DDF:6629 được đọc thêm theo yêu cầu kiểm tra biểu thức tổng quát, ngoài danh sách 35 trường.

Còn 15 trường chưa đọc đủ nguồn trực tiếp trong lượt này, được tách vào `pending`, không tính là đã kiểm tra: DDT, HCQ, HCTN, HFA, IUQ, KGH, LNA, LPD, NLG, NLN, TDL, TTH, TTN, UFA, YDN. Không tuyên bố hoàn thành toàn bộ hồ sơ.

Các phát hiện cần giữ khi tích hợp:

- DHD không cộng điểm thành tích theo mục V.2 của tài liệu Đại học Huế; bảng ưu tiên trong chính tài liệu còn dấu hiệu bất nhất, chưa mở tự tính.
- TBD công bố bốn phương thức, khác sáu nhãn đang lưu. Ba nhãn cũ được đánh dấu tranh chấp, không xóa hoặc ánh xạ sang phương thức khác khi chưa có bằng chứng.
- TSN quy đổi ĐGNL về tổng THPT bốn môn, thang 40; không mặc định mọi trường dùng thang 30.
- DDF:6629 dùng `ĐXT = T × a + H × b + ĐC + ĐƯT`; khối sư phạm 0,8/0,2 và cử nhân 0,6/0,4. Các số 23,3 hoặc 23,6 trong ví dụ không phải biểu thức tổng quát.
- TTD dùng website chính thức `https://dsu.edu.vn/`, được PDF có chữ ký và dấu trường xác nhận. Domain cũ `https://upes3.edu.vn` đang hiển thị nội dung công nghệ/iCloud. Hai phương thức THPT/học bạ thuần chỉ ngành Quản lý TDTT; hai nhánh năng khiếu áp dụng ba ngành. Nguồn gốc 16 trang và bản cập nhật 6 trang đã được xem trực quan.
- UKH có bước hồi quy học bạ và quy đổi theo bách phân vị. Công thức trong nguồn đi từ THPT sang V-ACT; không tự đảo chiều và cộng ưu tiên lần nữa.
- BMU: dữ liệu đưa vào quy đổi đã có ưu tiên và điểm cộng. Chưa có đủ phụ lục ĐGNL để bổ sung công thức cuối.
- DDG: liên kết tuyển sinh ĐHSP mã DDS không đủ căn cứ áp vào Khoa GDTC mang mã DDG.

Kiểm tra phạm vi bản nghiên cứu: JSON đọc được; nguồn trong `researchCorrections` đều là object có `type: primary`, năm 2026, ngày kiểm tra; không có quy tắc tự tính. Chưa chạy bộ test/build/deploy theo phân công; người tích hợp thực hiện các bước đó.
