# Bổ sung hồ sơ và công thức tuyển sinh ngày 14/10/2026

Đã bổ sung hoặc chỉnh lý 166 mục phương thức ở 42 trường. Nguồn đối chiếu là trang tuyển sinh và tài liệu do trường công bố; dữ liệu 2026 dùng để tham khảo cho mùa tuyển sinh 2027.

Lượt này chưa hoàn tất toàn bộ hồ sơ. Việc có biểu thức, phép quy đổi hoặc tài liệu chính thức không đồng nghĩa đã đủ mọi điều kiện để tự tính điểm cuối.

## Dữ liệu sau cập nhật

- Toàn bộ 326 hồ sơ vẫn có trong catalog, với 1424 mục phương thức.
- 210 mục đã đối chiếu biểu thức chính thức; giữ nguyên 92 bộ tính đang hoạt động, không bật thêm bộ tính từ các bản trích.
- 504 mục có biểu thức hoặc mô tả phép tính theo nguồn; vẫn phải đọc giới hạn, bảng quy đổi và phạm vi ngành.
- 277 mục xét điều kiện hoặc hồ sơ, không có phép cộng điểm chung.
- 433 mục còn gắn trạng thái thiếu, cần đối chiếu hoặc mâu thuẫn; giảm từ 528 ở bản kiểm kê đầu lượt.

## Những điểm đã sửa

- IUH: gộp hai nhãn đầu vào trùng thành một phương thức kết hợp, giữ ba cách xét và mẫu số là điểm thủ khoa kỳ thi 2026; phân hiệu Quảng Ngãi giữ bảng ngành riêng.
- DDF: dùng hệ số 0,8/0,2 cho nhóm sư phạm và 0,6/0,4 cho cử nhân; loại phép tính ví dụ số khỏi cơ chế tự trích công thức.
- DQN: nhập lại ma trận 53 dòng từ TB1906. Học bạ và V-ACT có 38 chương trình, THPT và SPT có 51; giữ Quản lý giáo dục, loại ngành đào tạo giáo viên khỏi học bạ/V-ACT.
- SPD: học bạ kết hợp năng khiếu chỉ giữ Huấn luyện thể thao; bổ sung cao đẳng Mầm non vào hai nhánh thi/năng khiếu đúng bảng trường.
- DVT: loại Y khoa, Răng – Hàm – Mặt và Dược học khỏi học bạ, còn 46 ngành.
- MHN: tuyển thẳng còn 9 ngành theo bảng chính thức; bổ sung dự bị cho 18 ngành. DLX bổ sung dự bị cho 28 chương trình, DLS giữ riêng 14 ngành tại TP.HCM.
- DAD: chỉ xác nhận Y khoa bằng tiếng Anh ở phương thức hồ sơ nước ngoài; không gán Dược hoặc biến mã hàng 132/133 thành mã ngành quốc gia.
- DDY: biểu thức thay IELTS chỉ áp dụng các tổ hợp có Tiếng Anh; phần THPT thông thường còn ghi rõ chưa đủ biểu thức.
- TTD: thay liên kết website cũ bằng https://dsu.edu.vn, đối chiếu trang tuyển sinh và hai tài liệu có dấu trường.
- GDU: phân biệt tổng bốn thành phần gốc thang 40 với thang xét tuyển cuối chưa rõ; các bài thi/chứng chỉ chưa có quy đổi cũng không gắn mặc định thang 30.

## Tái tạo dữ liệu và phòng ngừa mất thông tin

Dữ liệu đã tích hợp vào admission-methods-2026-notes.json, school-formulas-2026-overrides.json và các đầu ra hiện có. Giữ ngày bằng chứng theo từng phương thức; cập nhật một trường không đổi ngày của những nguồn cũ chưa đọc lại. Bốn phương thức từng được thêm trực tiếp vào đầu ra được chuyển về đầu vào để không bị mất khi tạo lại dữ liệu.

Các generator dùng lại nguồn đã đối chiếu trong hồ sơ, giữ cảnh báo tài liệu dự kiến. Cơ chế đọc cache đã nhận cả URL yêu cầu và URL sau chuyển hướng. Các phép tính chỉ gồm số trong ví dụ không được xem là công thức chung.

## Trường có mục phương thức được cập nhật

| Mã | Trường | Số mục | Nguồn |
| --- | --- | ---: | --- |
| DAD | Trường Đại học Đông Á | 1 | [Nguồn trường](https://donga.edu.vn/tuyensinh/ts-chi-tiet/dai-hoc-dong-a-thong-bao-tuyen-sinh-bac-dai-hoc-chinh-quy-nam-2026-42971) |
| DDF | Trường Đại học Ngoại ngữ - ĐH Đà Nẵng | 1 | [Nguồn trường](https://tuyensinh.ufl.udn.vn/wp-content/uploads/2026/06/2026.06.02-Thong-tin-tuyen-sinh-nam-2026-FINAL.pdf) |
| DDK | Trường Đại học Bách Khoa - ĐH Đà Nẵng | 1 | [Nguồn trường](https://tuyensinh.dut.udn.vn/diem-quy-doi-chung-chi-ngoai-ngu) |
| DDY | Khoa Y Dược – ĐH Đà Nẵng | 1 | [Nguồn trường](https://smp.udn.vn/ckfinder/userfiles/files/C%E1%BA%ACP%20NH%E1%BA%ACT_DDY_%20TH%C3%94NG%20TIN%20TUY%E1%BB%82N%20SINH%20TYD%20N%C4%82M%202026(1).pdf) |
| DHD | Trường Du lịch - ĐH Huế | 4 | [Nguồn trường](https://huis.edu.vn/uploads/static/THONG_TIN_TUYEN_SINH_202611.pdf) |
| DKB | Trường Đại học Kinh tế Kỹ thuật Bình Dương | 4 | [Nguồn trường](https://tuyensinh.ktkt.edu.vn/fileuploads/Article/AttachmentFile/d54297b5b9d740b2bd67d15fb648ba21.pdf) |
| DKC | Trường Đại học Công nghệ TP.HCM | 5 | [Nguồn trường](https://www.hutech.edu.vn/tuyensinh/tin-tuyen-sinh/14630721-hutech-cong-bo-phuong-an-tuyen-sinh-dai-hoc-chinh-quy-du-kien-nam-2026) |
| DLS | Trường Đại học Lao động Xã hội – Cơ sở TP.HCM | 8 | [Nguồn trường](https://tuyensinh.ldxh.edu.vn/gt/) |
| DLX | Trường Đại học Lao động - Xã hội | 8 | [Nguồn trường](https://tuyensinh.ulsa.edu.vn/thong-bao-tuyen-sinh-dhcq-2026/) |
| DNC | Trường Đại học Nam Cần Thơ | 2 | [Nguồn trường](https://tuyensinh.nctu.edu.vn/news/2026/danh-muc-nganh-tuyen-sinh-dai-hoc-2026) |
| DNT | Trường Đại học Ngoại ngữ - Tin học TP.HCM | 3 | [Nguồn trường](https://huflit.edu.vn/vi/tin-tuc/huflit-cong-bo-thong-tin-tuyen-sinh-nam-2026/) |
| DPQ | Trường Đại học Phạm Văn Đồng | 1 | [Nguồn trường](https://tuyensinh.pdu.edu.vn/download/3770/) |
| DQN | Trường Đại học Quy Nhơn | 5 | [Nguồn trường](https://qnu.edu.vn/vi/tuyen-sinh-1763/tb123-ve-viec-quy-doi-tuong-duong-diem-giua-cac-phuong-thuc-tuyen-sinh-dai-hoc-chinh-quy-nam-2026-2625) |
| DTB | Trường Đại học Thái Bình | 6 | [Nguồn trường](https://media.tbu.edu.vn//Media/1_TH1062/FolderFunc/202603/Documents/thong-bao-so-565-20260324051114-e.pdf) |
| DVL | Trường Đại học Văn Lang | 6 | [Nguồn trường](https://www.vlu.edu.vn/news/truong-dai-hoc-van-lang-cong-bo-thong-tin-tuyen-sinh-dai-hoc-chinh-quy-2026) |
| DVT | Trường Đại học Trà Vinh | 3 | [Nguồn trường](https://dkxt.tvu.edu.vn/tu-van-xet-tuyen) |
| DYD | Trường Đại học Yersin Đà Lạt | 2 | [Nguồn trường](https://yersin.edu.vn/thong-tin-tuyen-sinh-2026/) |
| GDU | Trường Đại học Gia Định | 1 | [Nguồn trường](https://giadinh.edu.vn/truong-dai-hoc-gia-dinh-cong-bo-05-phuong-thuc-tuyen-sinh-dai-hoc-chinh-quy-nam-2026) |
| HDT | Trường Đại học Hồng Đức | 5 | [Nguồn trường](https://tuyensinh.hdu.edu.vn/thong-tin-tuyen-sinh-dao-tao-trinh-do-dai-hoc-nam-2026) |
| HIU | Trường Đại học Quốc tế Hồng Bàng | 8 | [Nguồn trường](https://hiu.vn/tuyen-sinh/thong-tin-tuyen-sinh-2026/) |
| HSU | Trường Đại học Hoa Sen | 5 | [Nguồn trường](https://www.hoasen.edu.vn/dtdh/wp-content/uploads/sites/28/2026/05/QD__Thong-tin-tuyen-sinh-10.03.2026duthao.pdf) |
| IUH | Trường Đại học Công nghiệp TP.HCM | 2 | [Nguồn trường](https://pdt.iuh.edu.vn/Uploads/184bdbe0-55bd-4c96-9bf9-31761077668c_867_Thongbao_tuyensinh_2026.pdf) |
| IUQ | Phân hiệu Trường Đại học Công nghiệp TP.HCM tại Quảng Ngãi | 1 | [Nguồn trường](https://pdt.iuh.edu.vn/Uploads/184bdbe0-55bd-4c96-9bf9-31761077668c_867_Thongbao_tuyensinh_2026.pdf) |
| KMA | Học viện Kỹ thuật Mật mã | 6 | [Nguồn trường](https://actvn.edu.vn/News/DownloadFile?idFile=4359) |
| KTD | Trường Đại học Kiến trúc Đà Nẵng | 2 | [Nguồn trường](https://tuyensinh.dau.edu.vn/truong-dai-hoc-kien-truc-da-nang-cong-bo-phuong-an-xet-tuyen-dai-hoc-nam-2026-du-kien-012929.html) |
| LNH | Trường Đại học Lâm nghiệp | 8 | [Nguồn trường](https://tuyensinh.vnuf.edu.vn/Detail.aspx?id=9) |
| MHN | Trường Đại học Mở Hà Nội | 9 | [Nguồn trường](https://hou.edu.vn/wp-content/uploads/2026/06/Phan-II_Muc-1_Thong-tin-TS-2026-DHCQ_Chot.pdf) |
| MTS | Trường Đại học Mỹ thuật TP.HCM | 2 | [Nguồn trường](https://hcmufa.edu.vn/news_detail/id/620) |
| MTU | Trường Đại học Xây dựng Miền Tây | 1 | [Nguồn trường](https://xttt.mtu.edu.vn/Thongtintuyensinh.aspx) |
| QHD | Trường Quản trị và Kinh doanh - Đại học Quốc gia Hà Nội | 5 | [Nguồn trường](https://www.hsb.edu.vn/admissions/undergrad-admissions-2026) |
| QHE | Trường Đại học Kinh tế - Đại học Quốc gia Hà Nội | 5 | [Nguồn trường](https://ueb.edu.vn/Tuyen-Sinh/UEB/truong-dai-hoc-kinh-te-dhqghn-ban-hanh-thong-tin-tuyen-sinh-dai-hoc-nam-2026/1730/1731/1737/46139) |
| QHQ | Khoa Quốc tế - Đại học Quốc gia Hà Nội | 2 | [Nguồn trường](https://www.is.vnu.edu.vn/truong-quoc-te-thong-bao-thong-tin-du-kien-tuyen-sinh-dhcq-nam-2026/) |
| SKH | Trường Đại học Sư phạm Kỹ thuật Hưng Yên | 5 | [Nguồn trường](https://tuyensinh.utehy.edu.vn/ThongBao/ChiTiet?ID_thong_bao=27) |
| SPD | Trường Đại học Đồng Tháp | 7 | [Nguồn trường](https://qao.dthu.edu.vn/Media/Files/SPD-thong-tin-tuyen-sinh-dai-hoc-cao-dang-2026-DIEU-CHINH.pdf) |
| THP | Trường Đại học Hải Phòng | 7 | [Nguồn trường](https://dhhp.edu.vn/post/thong-bao-ve-nguong-bao-dam-chat-luong-dau-vao-quy-tac-quy-doi-tuong-duong-diem-xet-tuyen-giua-cac-phuong-thuc-xet-tuyen-dai-hoc-chinh-quy-nam-2026-73810.html) |
| THV | Trường Đại học Hùng Vương | 5 | [Nguồn trường](https://www.hvu.edu.vn/tin-tuc/thong-tin-tuyen-sinh-nam-2026/1773029218.hvu) |
| TSN | Trường Đại học Nha Trang | 2 | [Nguồn trường](https://tuyensinh.ntu.edu.vn/thong-bao/quy-doi-diem-tuong-duong) |
| TTD | Trường Đại học Thể dục Thể thao Đà Nẵng | 4 | [Nguồn trường](https://dsu.edu.vn/resources/post_tailieu/d42266f8-0de2-4a0c-93b3-bc52442f533a.pdf) |
| UKH | Trường Đại học Khánh Hòa | 2 | [Nguồn trường](https://ukh.edu.vn/tuyensinh/vi-vn/chi-tiet-tin/id/6347/THONG-TIN-TUYEN-SINH-NAM-2026-(CAP-NHAT)) |
| VGU | Trường Đại học Việt - Đức | 3 | [Nguồn trường](https://tuyensinh.vgu.edu.vn/nhaphoc-1) |
| VTT | Trường Đại học Võ Trường Toản | 7 | [Nguồn trường](https://vttu.edu.vn/cam-nang-2026/) |
| YKV | Trường Đại học Y khoa Vinh | 1 | [Nguồn trường](https://www.vmu.edu.vn/cdn/vmu/Assets/Documents/422_08.5.2026_TB%20Tuyen%20Sinh%202026.pdf) |

## Phần chưa hoàn tất

Danh sách đầy đủ theo từng trường và phương thức nằm trong [báo cáo công thức](ra-soat-cong-thuc-2026.md). Các báo cáo theo vùng ghi riêng trường đã đọc nội dung và trường mới kiểm tra liên kết:

- [Miền Bắc](profile-completion-north-2026-10-14.md)
- [Miền Trung](profile-completion-central-2026-10-14.md)
- [Miền Nam](profile-completion-south-2026-10-14.md)

IUQ được bổ sung công thức qua đối chiếu chung với nguồn IUH trong lượt tích hợp; mục pending của báo cáo miền Trung chỉ ghi phạm vi nghiên cứu riêng của vùng.

Các khoảng chưa có quy tắc nội suy/ngoại suy, bảng quy đổi thiếu, điều kiện học bạ mâu thuẫn, bản dự kiến và nhóm ngành chưa xác nhận tiếp tục giữ cảnh báo. Không dùng ngưỡng nhận hồ sơ làm điểm chuẩn, không suy phép chia tuyến tính từ điểm tối đa bài thi.

## Kiểm chứng trước phát hành

- npm run check: đạt.
- npm test: 604/604 đạt, không bỏ qua kiểm thử.
- npm run verify:data: 0 lỗi, 19 cảnh báo về các hồ sơ hệ thống, phân hiệu hoặc đào tạo đặc thù đã có.
- npm run audit:formulas: đạt; ánh xạ đủ 326 trường và 17.617 dòng ngành, không có anchor lỗi.
- npm run cf:dry-run: đạt cho cả Worker chính và Worker OCR.
- Brave: thử chọn trường/phương thức IUH, Đồng Tháp, Quy Nhơn; kiểm tra 1366 px và 390 px, không tràn ngang. Tổ hợp ghi bằng tên môn giữ nguyên từng nhóm trong ngoặc.

Các kiểm thử hồi quy kiểm tra phạm vi ngành, giữ riêng phân hiệu, hệ số theo nhóm, mã chưa xác minh, ngày bằng chứng và việc không bật tự tính khi thiếu dữ kiện.
