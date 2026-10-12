import { APP_ROUTES, appPageMetadata } from "../public/js/core/appRoutes.js";

export function appRouteProfile(store, route) {
  if (!route.universityId) return {};
  const university = store.getUniversity(route.universityId);
  const major = route.majorId ? store.majorsById.get(route.majorId) : null;
  if (!university || (route.majorId && (!major || major.universityId !== university.id))) return null;
  return { university, major };
}

export function renderAppPage(html, route, profile) {
  const metadata = appPageMetadata(route, profile);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let page = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(metadata.title)}</title>`)
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/, tag => tag.replace(/href="[^"]*"/, `href="${escape(metadata.url)}"`))
    .replace(/<meta\b[^>]*(?:name|property)="(description|og:description|og:title|twitter:title|og:url)"[^>]*>/g, (tag, key) => tag.replace(/content="[^"]*"/, `content="${escape(key === "og:url" ? metadata.url : key.includes("title") ? metadata.title : metadata.description)}"`))
    .replace(/<body\b[^>]*>/, tag => tag.replace(/\sdata-view="[^"]*"/, "").replace(/>$/, ` data-view="${route.view}">`))
    .replace(/<section\b[^>]*\bid="([^"]+)"[^>]*>/g, (tag, id) => Object.hasOwn(APP_ROUTES, id) ? tag.replace(/\shidden(?:="[^"]*")?/g, "").replace(/>$/, id === route.view ? ">" : " hidden>") : tag);
  // Keep a single principal heading in the response, including when JS is disabled.
  page = page.replace(/<h([12])\b([^>]*\bid="([^"]+)-title"[^>]*)>([\s\S]*?)<\/h\1>/g, (tag, level, attrs, view, text) => {
    if (!Object.hasOwn(APP_ROUTES, view)) return tag;
    const heading = view === route.view ? 1 : 2;
    return `<h${heading}${attrs}>${text}</h${heading}>`;
  });
  if (profile?.university) {
    const { university, major } = profile;
    const safeLink = (url, label) => /^https?:\/\//i.test(String(url || '')) ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : '';
    const sources = university.admissions?.sources || [];
    const summary = `<article class="container form-card" data-server-profile>
      <h2>${escape(major?.name || university.name)}</h2>
      <p>${escape(university.name)} · Mã trường ${escape(university.code || 'Đang cập nhật')}${major ? ` · Mã ngành ${escape(major.code || 'Đang cập nhật')}` : ''}</p>
      <p>${escape(university.description || 'Hồ sơ đang được bổ sung từ tài liệu tuyển sinh của trường.')}</p>
      <p>Dữ liệu ${escape(university.year || 2026)} chỉ để tham khảo cho tuyển sinh 2027. Lần đối chiếu hồ sơ: ${escape(university.dataCheckedAt || 'Chưa ghi nhận')}. Trạng thái nguồn: ${escape(university.admissions?.status || 'Chưa xác minh đầy đủ')}.</p>
      ${major ? `<dl><dt>Phương thức</dt><dd>${escape(major.method || 'Đang cập nhật')}</dd><dt>Tổ hợp</dt><dd>${escape(major.combination || 'Đang cập nhật')}</dd><dt>Điểm chuẩn tham khảo</dt><dd>${major.cutoff?.score != null ? `${escape(major.cutoff.score)} / ${escape(major.cutoff.scale)} · năm ${escape(major.cutoff.year)} · ${escape(major.cutoff.status || 'tham khảo')}` : 'Chưa công bố/đang cập nhật'}</dd></dl><p>${safeLink(major.sourceUrl || major.cutoff?.sourceUrl, 'Nguồn dữ liệu ngành')}</p>` : `<p>Phương thức được ghi trong hồ sơ: ${escape((university.methods || []).join(', ') || 'Đang cập nhật')}. Kiểm tra phạm vi từng ngành và điều kiện trong thông báo của trường.</p>`}
      <p>${safeLink(university.website, 'Website của trường')}</p>
      ${sources.length ? `<ul>${sources.map(source => `<li>${safeLink(source.url, source.title || 'Nguồn tuyển sinh')}</li>`).join('')}</ul>` : '<p>Chưa có đủ liên kết để xác minh mọi thông tin. Không suy ra dữ liệu thiếu là trường không tuyển.</p>'}
      <p><a href="/ho-so-truong/">Danh sách trường</a> · <a href="/tim-nganh/">Tìm ngành theo điểm</a> · <a href="/nguon-du-lieu-va-bao-sai/">Hiểu trạng thái dữ liệu và báo sai</a></p>
    </article>`;
    page = page.replace(/(<section\b[^>]*\bid="universities"[^>]*>)/, (_, tag) => tag + summary);
  }
  const noscript = '<noscript><p class="info-callout">Bạn vẫn có thể đọc hướng dẫn và nguồn trên trang. Hãy bật JavaScript để tính điểm, lọc dữ liệu và làm bài, hoặc đọc <a href="/cam-nang/">cẩm nang tuyển sinh</a>.</p></noscript>';
  return page.replace(/(<main\b[^>]*>)/, `$1${noscript}`);
}
