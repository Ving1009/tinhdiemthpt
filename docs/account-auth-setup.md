# Tài khoản tên đăng nhập và mật khẩu

Production dùng Cloudflare D1 binding `AUTH_DB` và migration trong thư mục `migrations`.

```powershell
npx wrangler d1 migrations apply tinhdiemthpt-auth --remote
npm run cf:deploy
```

Luồng đăng ký bắt buộc Turnstile action `account_register`. Mật khẩu được băm bằng scrypt với salt ngẫu nhiên riêng và tham số N=16.384, r=8, p=1; phiên đăng nhập là token ngẫu nhiên chỉ lưu ở cookie `Secure`, `HttpOnly`, `SameSite=Lax`. Database chỉ giữ SHA-256 của token phiên.

API tài khoản:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/data`
- `PUT /api/auth/data`

Người không đăng nhập vẫn sử dụng đầy đủ công cụ. Tài khoản hỗ trợ sao lưu và khôi phục dữ liệu cá nhân giữa các thiết bị.
