# Cloudflare production

- Tên miền chính: `https://tinhdiemthpt.id.vn/`
- Worker cũ: `https://tinhdiemthpt.tinh-diem-thpt.workers.dev/` (chuyển hướng 308 sang tên miền chính)
- SSL/TLS: Full (strict)
- Always Use HTTPS: bật
- Minimum TLS: 1.2; TLS 1.3: bật
- HSTS: 12 tháng, áp dụng cho subdomain, không đăng ký preload
- Automatic HTTPS Rewrites: bật
- Cloudflare Managed Ruleset và HTTP DDoS protection: luôn hoạt động
- Bot Fight Mode, Browser Integrity Check, Continuous Script Monitoring, Precursor và Hotlink Protection: bật
- Turnstile: bật cho tên miền chính và hostname Worker cũ

DNSSEC đã được khởi tạo trên Cloudflare. Nhà đăng ký tên miền cần có bản ghi DS sau để chuyển trạng thái từ pending sang active:

```text
tinhdiemthpt.id.vn. 3600 IN DS 2371 13 2 29A7C52919FFF809DD1D42F707B9329B3D9953F6D4DA371FB862B77E96FF651B
```

Không bật Under Attack Mode thường trực vì chế độ này tạo challenge cho mọi lượt truy cập và làm giảm trải nghiệm người dùng. Cloudflare Access cũng không đặt trước website công khai; các API ghi dữ liệu đã được bảo vệ bằng Turnstile và rate limit riêng.
