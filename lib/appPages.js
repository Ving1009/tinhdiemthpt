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
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escape(metadata.title)}</title>`)
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/, tag => tag.replace(/href="[^"]*"/, `href="${escape(metadata.url)}"`))
    .replace(/<meta\b[^>]*(?:name|property)="(description|og:description|og:title|twitter:title|og:url)"[^>]*>/g, (tag, key) => tag.replace(/content="[^"]*"/, `content="${escape(key === "og:url" ? metadata.url : key.includes("title") ? metadata.title : metadata.description)}"`))
    .replace(/<body\b[^>]*>/, tag => tag.replace(/\sdata-view="[^"]*"/, "").replace(/>$/, ` data-view="${route.view}">`))
    .replace(/<section\b[^>]*\bid="([^"]+)"[^>]*>/g, (tag, id) => Object.hasOwn(APP_ROUTES, id) ? tag.replace(/\shidden(?:="[^"]*")?/g, "").replace(/>$/, id === route.view ? ">" : " hidden>") : tag);
}
