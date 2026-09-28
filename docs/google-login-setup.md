# Bật đăng nhập Google

Phần giao diện và đồng bộ dữ liệu đã có sẵn. Hoàn tất các bước sau trong một dự án Supabase đang hoạt động:

1. Vào **Authentication → Providers → Google**, bật Google và nhập OAuth Client ID cùng Client Secret từ Google Cloud.
2. Trong Google Cloud, thêm redirect URI mà Supabase hiển thị, dạng `https://PROJECT_REF.supabase.co/auth/v1/callback`.
3. Vào **Authentication → URL Configuration**. Đặt Site URL là URL production và thêm cả URL production lẫn URL local vào Redirect URLs, ví dụ:
   - `https://tinhdiemthpt.tinh-diem-thpt.workers.dev/**`
   - `http://127.0.0.1:3000/**`
4. Vào **Project Settings → API Keys**, sao chép **Publishable key**. Không dùng Secret key hoặc `service_role` ở trình duyệt.
5. Thêm vào `.env`: `SUPABASE_PUBLIC_KEY=...` và giữ `SUPABASE_USER_DATA_TABLE=user_app_data`.
6. Chạy nội dung file `docs/supabase-google-auth.sql` trong SQL Editor để tạo bảng và chính sách RLS chỉ cho phép mỗi người đọc/ghi dữ liệu của chính họ.
7. Chạy `npm run cf:secrets`, sau đó `npm run cf:deploy`.

Đăng nhập lần đầu bằng Google sẽ tự tạo tài khoản Supabase. Người không đăng nhập vẫn dùng đầy đủ chức năng; dữ liệu phiên khách tự xóa khi họ quay lại sau ít nhất 15 phút rời website.
