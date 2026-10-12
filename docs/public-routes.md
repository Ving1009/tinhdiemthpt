# Đường dẫn các công cụ

Các mục dùng URL riêng; không cần phần `#...` để chọn công cụ. Express và Cloudflare cùng đọc bảng đường dẫn trong `public/js/core/appRoutes.js`. Khi mở trực tiếp, HTML có tiêu đề, canonical và mục đang chọn phù hợp trước khi JavaScript chạy.

| Mục | Đường dẫn |
| --- | --- |
| Trang chủ | `/` |
| Tính điểm THPT | `/tinh-diem-thpt/` |
| Tính học bạ | `/tinh-diem-hoc-ba/` |
| Công thức theo trường | `/cong-thuc-xet-tuyen/` |
| Tổ hợp môn | `/to-hop-mon/` |
| Hồ sơ trường | `/ho-so-truong/` |
| Tìm ngành | `/tim-nganh/` |
| Phòng thi thử | `/phong-thi/` |
| Hướng dẫn công cụ | `/huong-dan/` |
| Hồ sơ một trường | `/truong/{universityId}/` |
| Hồ sơ ngành tại trường | `/nganh/{universityId}/{majorId}/` |

Cẩm nang, giới thiệu, liên hệ, điều khoản, nguồn dữ liệu và chính sách quyền riêng tư giữ URL hiện có. Anchor mục lục trong một bài vẫn dùng `#` để cuộn tới đoạn tương ứng.

Link cũ như `/#home`, `/#calculator` và `/#truong/...` được JavaScript chuyển sang URL mới bằng `replaceState`, không thêm một bước thừa khi bấm Quay lại. Menu dùng History API để chuyển công cụ, giữ điểm đang nhập và trạng thái trong phiên. Hồ sơ thiếu hoặc ngành thuộc trường khác trả HTTP 404 khi mở trực tiếp. Alias của công cụ thiếu dấu `/` cuối hoặc có `index.html` chuyển 308 tới URL chuẩn và giữ query string.

Cloudflare chỉ chuyển các đường dẫn đã khai báo tới mẫu ứng dụng; các bài Cẩm nang và tài sản tĩnh giữ luồng riêng. `run_worker_first` trong `wrangler.jsonc` cần bao gồm mọi đường dẫn công cụ và hai tiền tố hồ sơ. Không bật fallback trả trang chủ cho mọi URL: đường dẫn lạ phải giữ lỗi 404.

Phát triển bằng `npm start`; build/deploy bằng `npm run cf:build` và `npm run cf:deploy`. Live Server thuần không xử lý các đường dẫn ứng dụng do Express/Worker cung cấp.
