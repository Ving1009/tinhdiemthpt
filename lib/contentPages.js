import { admissionsGuides, GUIDE_UPDATED } from "../content/admissionsGuides.js";
import { APP_ROUTES } from "../public/js/core/appRoutes.js";
import { projectPages } from "../content/projectPages.js";

export const SITE_URL = "https://tinhdiemthpt.id.vn";
const BRAND = "Tính Điểm THPT";
const VERSION = "20261012-3";

export function escapeContent(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function pagePath(page) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) throw new Error("Invalid content slug");
  return `${page.category ? "/cam-nang" : ""}/${page.slug}/`;
}

function dateLabel(date) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

function footer() {
  return `<footer class="site-footer"><div class="container">
    <nav class="editorial-footer-links" aria-label="Thông tin website">
      <a href="/gioi-thieu/">Giới thiệu</a><a href="/lien-he/">Liên hệ</a><a href="/privacy">Quyền riêng tư</a>
      <a href="/dieu-khoan-su-dung/">Điều khoản sử dụng</a><a href="/nguon-du-lieu-va-bao-sai/">Nguồn dữ liệu và báo sai</a>
      <a href="/privacy" data-ad-consent hidden>Lựa chọn quảng cáo</a>
    </nav>
    <div class="footer-contact"><h2>Kết nối và hỗ trợ</h2><nav class="footer-contact-links" aria-label="Mạng xã hội và email liên hệ">
      <a href="https://www.facebook.com/tinhdiemthpt/" target="_blank" rel="noopener noreferrer">Facebook</a>
      <a href="https://www.youtube.com/@tinhdiemthpt" target="_blank" rel="noopener noreferrer">YouTube</a>
      <a href="https://www.tiktok.com/@tinhdiemthpt" target="_blank" rel="noopener noreferrer">TikTok</a>
      <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=hotro.tinhdiemthpt%40gmail.com" target="_blank" rel="noopener noreferrer">hotro.tinhdiemthpt@gmail.com</a>
    </nav></div>
    <p class="editorial-footer-note">Website hỗ trợ tính điểm và tra cứu, không phải cổng thông tin chính thức của Bộ GD&amp;ĐT. Dữ liệu tuyển sinh 2026 chỉ để tham khảo cho thí sinh 2027.</p>
  </div></footer>`;
}

function shell({ title, description, path, body, structuredData = [] }) {
  const canonical = `${SITE_URL}${path}`;
  return `<!doctype html>
<html lang="vi"><head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeContent(title)} | ${BRAND}</title>
  <meta name="description" content="${escapeContent(description)}" /><meta name="robots" content="index,follow" />
  <link rel="canonical" href="${escapeContent(canonical)}" />
  <meta property="og:title" content="${escapeContent(title)} | ${BRAND}" /><meta property="og:description" content="${escapeContent(description)}" />
  <meta property="og:type" content="${path.startsWith("/cam-nang/") && path !== "/cam-nang/" ? "article" : "website"}" /><meta property="og:url" content="${escapeContent(canonical)}" />
  <meta property="og:image" content="${SITE_URL}/assets/brand/logo-full.png?v=20261011-2" />
  <meta name="twitter:card" content="summary" /><meta name="twitter:title" content="${escapeContent(title)} | ${BRAND}" />
  <meta name="twitter:description" content="${escapeContent(description)}" />
  <link rel="icon" type="image/png" href="/assets/brand/logo-icon.png?v=20261011-2" />
  <link rel="stylesheet" href="/css/style.css?v=20260927-1" /><link rel="stylesheet" href="/css/redesign.css?v=20261011-4" />
  <link rel="stylesheet" href="/css/content.css?v=${VERSION}" />
  ${structuredData.map(jsonLd).join("\n  ")}
  <script type="module" src="/js/content.js?v=${VERSION}"></script>
</head><body class="editorial-page">
  <a class="skip-link" href="#article-main">Bỏ qua điều hướng</a>
  <header class="editorial-header"><div class="container editorial-header-inner">
    <a class="brand" href="/" aria-label="Tính Điểm THPT, trang chủ"><img class="brand-mark-image" src="/assets/brand/logo-icon.png?v=20261011-2" alt="" width="36" height="36" /><span>Tính Điểm <strong>THPT</strong></span></a>
    <nav class="editorial-nav" aria-label="Điều hướng nội dung"><a href="/cam-nang/">Cẩm nang</a><a href="/tinh-diem-thpt/">Tính điểm</a><a href="/tim-nganh/">Tìm ngành</a></nav>
    <button class="icon-button" id="content-theme-toggle" type="button" aria-label="Bật giao diện tối"><span aria-hidden="true">☾</span></button>
  </div></header>
  <main class="container editorial-main" id="article-main" tabindex="-1">${body}</main>
  ${footer()}
</body></html>\n`.replace(/^[ \t]+$/gm, "");
}

function breadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Đường dẫn"><ol>${items.map((item, index) => `<li>${index === items.length - 1 ? `<span aria-current="page">${escapeContent(item.name)}</span>` : `<a href="${escapeContent(item.path)}">${escapeContent(item.name)}</a>`}</li>`).join("")}</ol></nav>`;
}

function breadcrumbData(items) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({
    "@type": "ListItem", position: index + 1, name: item.name, item: `${SITE_URL}${item.path}`
  })) };
}

function guideCard(guide) {
  return `<article class="guide-card" data-guide-card data-category="${escapeContent(guide.category)}">
    <span class="content-category">${escapeContent(guide.category)}</span><h2><a href="${pagePath(guide)}">${escapeContent(guide.title)}</a></h2>
    <p>${escapeContent(guide.description)}</p><div class="guide-card-bottom"><time datetime="${guide.updated}">Cập nhật ${dateLabel(guide.updated)}</time><a href="${pagePath(guide)}" aria-label="Đọc: ${escapeContent(guide.title)}">Đọc hướng dẫn <span aria-hidden="true">↗</span></a></div>
  </article>`;
}

export function renderGuidePreview() {
  return `<div class="guide-preview"><h3>Đọc tiếp trong cẩm nang</h3><div class="guide-preview-links">${admissionsGuides.map(guide => `<a href="${pagePath(guide)}">${escapeContent(guide.title)} <span aria-hidden="true">↗</span></a>`).join("")}</div></div>`;
}

export function renderGuideIndex() {
  const items = [{ name: "Trang chủ", path: "/" }, { name: "Cẩm nang tuyển sinh", path: "/cam-nang/" }];
  const categories = [...new Set(admissionsGuides.map(guide => guide.category))];
  return shell({ title: "Cẩm nang tuyển sinh", description: "Hướng dẫn tính điểm, đọc điểm chuẩn, chọn tổ hợp và sắp xếp nguyện vọng. Có ví dụ minh họa, nguồn chính thức và lưu ý dữ liệu 2026 cho thí sinh 2027.", path: "/cam-nang/", structuredData: [breadcrumbData(items)], body: `
    ${breadcrumbs(items)}<header class="content-heading"><p class="eyebrow">Hướng dẫn cho học sinh và phụ huynh</p><h1>Cẩm nang tuyển sinh</h1><p>Hiểu cách tính điểm, đọc đúng thông tin tuyển sinh và chuẩn bị nguyện vọng. Mỗi bài có ví dụ minh họa, nguồn đối chiếu và công cụ để bạn thử với điểm của mình.</p></header>
    <aside class="content-notice" aria-label="Năm áp dụng">Thông tin tuyển sinh 2027 đang được cập nhật. Các quy định và dữ liệu 2026 trong cẩm nang là căn cứ tham khảo; hãy kiểm tra văn bản áp dụng cho năm bạn đăng ký.</aside>
    <form class="content-filters" id="guide-filter" role="search"><div class="field"><label for="guide-search">Tìm trong cẩm nang</label><input id="guide-search" type="search" disabled placeholder="Ví dụ: ưu tiên, học bạ, nguyện vọng" aria-controls="guide-list" /></div><div class="field"><label for="guide-category">Chủ đề</label><select id="guide-category" disabled aria-controls="guide-list"><option value="">Tất cả chủ đề</option>${categories.map(category => `<option>${escapeContent(category)}</option>`).join("")}</select></div><button class="button button-light" type="reset" disabled>Xóa bộ lọc</button></form>
    <p id="guide-count" class="content-count" role="status">${admissionsGuides.length} bài hướng dẫn · Cập nhật ${dateLabel(GUIDE_UPDATED)}</p>
    <div class="guide-list" id="guide-list">${admissionsGuides.map(guideCard).join("\n")}</div><p id="guide-no-results" class="content-notice" hidden>Chưa có bài phù hợp. Hãy thử từ khóa khác hoặc xóa bộ lọc.</p>
    <aside class="content-tools"><h2>Bạn đã có điểm?</h2><p>Nhập điểm để tính tổ hợp, sau đó xem ngành và trường phù hợp. Mọi kết quả cần được đối chiếu với thông báo tuyển sinh chính thức.</p><a class="button button-primary" href="/tinh-diem-thpt/">Mở công cụ tính điểm</a><a class="button button-light" href="/tim-nganh/">Tìm ngành theo điểm</a></aside>` });
}

export function renderContentPage(page) {
  const path = pagePath(page);
  const items = [{ name: "Trang chủ", path: "/" }, ...(page.category ? [{ name: "Cẩm nang tuyển sinh", path: "/cam-nang/" }] : []), { name: page.title, path }];
  const related = (page.related || []).map(slug => admissionsGuides.find(guide => guide.slug === slug)).filter(Boolean);
  const data = [breadcrumbData(items)];
  if (page.category) data.push({ "@context": "https://schema.org", "@type": "Article", headline: page.title, description: page.description,
    datePublished: page.updated, dateModified: page.updated, inLanguage: "vi-VN", mainEntityOfPage: `${SITE_URL}${path}`,
    author: { "@type": "Organization", name: BRAND, url: `${SITE_URL}/gioi-thieu/` }, publisher: { "@type": "Organization", name: BRAND, url: SITE_URL } });
  return shell({ title: page.title, description: page.description, path, structuredData: data, body: `${breadcrumbs(items)}
    <div class="content-layout"><article class="content-article">
      <header class="content-heading">${page.category ? `<p class="eyebrow">${escapeContent(page.category)}</p>` : ""}<h1>${escapeContent(page.title)}</h1><p class="article-meta">${page.category ? "Biên soạn: Tính Điểm THPT · " : ""}Cập nhật <time datetime="${page.updated}">${dateLabel(page.updated)}</time></p><p class="article-lead">${escapeContent(page.description)}</p></header>
      ${page.category ? '<aside class="content-notice">Bài viết đối chiếu quy định hiện hành năm 2026. Tuyển sinh 2027 đang cập nhật; ví dụ và kết quả công cụ chỉ để tham khảo, không xác nhận trúng tuyển.</aside>' : ""}
      <nav class="article-toc" aria-label="Mục lục bài viết"><h2>Trong bài này</h2><ol>${page.sections.map(section => `<li><a href="#${escapeContent(section.id)}">${escapeContent(section.title)}</a></li>`).join("")}</ol></nav>
      ${page.sections.map(section => `<section class="article-section" id="${escapeContent(section.id)}"><h2>${escapeContent(section.title)}</h2>${section.html}</section>`).join("\n")}
      ${page.sources?.length ? `<section class="article-section" id="nguon-tham-khao"><h2>Nguồn đối chiếu</h2><ul>${page.sources.map(source => `<li><a href="${escapeContent(source.url)}" target="_blank" rel="noopener noreferrer">${escapeContent(source.title)}</a></li>`).join("")}</ul><p>Ngày đối chiếu: ${dateLabel(page.updated)}. Nếu văn bản hoặc thông báo của trường thay đổi, hãy dùng bản áp dụng cho đợt tuyển sinh của bạn.</p></section>` : ""}
      <p class="article-correction">Phát hiện thông tin cần sửa? <a href="/nguon-du-lieu-va-bao-sai/">Xem cách gửi báo cáo và nguồn đối chiếu</a>.</p>
    </article><aside class="article-sidebar" aria-label="Công cụ và bài liên quan">
      ${page.tool ? `<div class="content-tools"><h2>Thử với điểm của bạn</h2><a class="button button-primary" href="${escapeContent(page.tool.href)}">${escapeContent(page.tool.label)}</a></div>` : ""}
      ${related.length ? `<div class="content-tools"><h2>Bài liên quan</h2><ul>${related.map(guide => `<li><a href="${pagePath(guide)}">${escapeContent(guide.title)}</a></li>`).join("")}</ul></div>` : ""}
      <a class="button button-light" href="/cam-nang/">Xem toàn bộ cẩm nang</a>
    </aside></div>` });
}

export function buildContentPages() {
  return new Map([["/cam-nang/", renderGuideIndex()], ...[...admissionsGuides, ...projectPages].map(page => [pagePath(page), renderContentPage(page)])]);
}

export function renderSitemap() {
  const pages = [...Object.values(APP_ROUTES).map(({ path }) => ({ path })), { path: "/privacy" }, { path: "/cam-nang/", updated: GUIDE_UPDATED }, ...[...admissionsGuides, ...projectPages].map(page => ({ path: pagePath(page), updated: page.updated }))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `  <url><loc>${SITE_URL}${page.path}</loc>${page.updated ? `<lastmod>${page.updated}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
}

export function renderRobots() {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_worker-data/\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}
