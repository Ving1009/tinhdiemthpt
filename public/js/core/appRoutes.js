export const APP_ROUTES = {
  home: { path: "/", title: "Tính Điểm THPT | Tra cứu tuyển sinh 2027" },
  calculator: { path: "/tinh-diem-thpt/", title: "Tính điểm THPT 2027 | Tính Điểm THPT" },
  academic: { path: "/tinh-diem-hoc-ba/", title: "Tính điểm học bạ | Tính Điểm THPT 2027" },
  admission: { path: "/cong-thuc-xet-tuyen/", title: "Công thức xét tuyển theo trường | Tính Điểm THPT 2027" },
  combinations: { path: "/to-hop-mon/", title: "Tra cứu tổ hợp môn | Tính Điểm THPT 2027" },
  universities: { path: "/ho-so-truong/", title: "Hồ sơ các trường | Tính Điểm THPT 2027" },
  "major-finder": { path: "/tim-nganh/", title: "Tìm ngành theo điểm | Tính Điểm THPT 2027" },
  "practice-exams": { path: "/phong-thi/", title: "Phòng thi thử | Tính Điểm THPT 2027" },
  guide: { path: "/huong-dan/", title: "Hướng dẫn sử dụng | Tính Điểm THPT 2027" }
};

export function profilePath(universityId, majorId = "") {
  return majorId ? `/nganh/${encodeURIComponent(universityId)}/${encodeURIComponent(majorId)}/` : `/truong/${encodeURIComponent(universityId)}/`;
}

// Exact known routes only: arbitrary assets, APIs and article anchors are not app views.
export function parseAppRoute(value = "") {
  const input = String(value);
  if (input.startsWith("#")) {
    const legacy = input.slice(1);
    if (Object.hasOwn(APP_ROUTES, legacy)) return { view: legacy, ...APP_ROUTES[legacy] };
    if (/^(?:truong|nganh)\//.test(legacy)) return parseAppRoute(`/${legacy}`);
    return null;
  }
  const pathname = input.split(/[?#]/, 1)[0];
  for (const [view, route] of Object.entries(APP_ROUTES)) {
    if (pathname === route.path || pathname === `${route.path}index.html` || (route.path !== "/" && pathname === route.path.slice(0, -1))) return { view, ...route };
  }
  const match = pathname.match(/^\/(truong|nganh)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match || (match[1] === "nganh") !== Boolean(match[3])) return null;
  try {
    const universityId = decodeURIComponent(match[2]), majorId = decodeURIComponent(match[3] || "");
    if (![universityId, ...(majorId ? [majorId] : [])].every(id => /^[A-Za-z0-9_-]{1,128}$/.test(id))) return null;
    return { view: "universities", path: profilePath(universityId, majorId), universityId, majorId, title: APP_ROUTES.universities.title };
  } catch { return null; }
}

export function resolveAppView(value) { return parseAppRoute(value)?.view || "home"; }

export function routeFromLocation(location) {
  return parseAppRoute(location.hash) || parseAppRoute(location.pathname) || parseAppRoute("/");
}

export function appPageMetadata(route, profile = {}) {
  const title = profile.major ? `${profile.major.name} · ${profile.university.name} | Tính Điểm THPT 2027`
    : profile.university ? `Hồ sơ ${profile.university.name} | Tính Điểm THPT 2027` : route.title;
  return { title, url: `https://tinhdiemthpt.id.vn${route.path}`, description: `${title.split(" | ")[0]}. Công cụ dành cho thí sinh năm 2027; dữ liệu tuyển sinh, công thức và đề thi 2026 chỉ để tham khảo, thông tin 2027 đang cập nhật.` };
}

export function updateAppMetadata(document, route, profile) {
  const metadata = appPageMetadata(route, profile);
  document.title = metadata.title;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", metadata.url);
  for (const [selector, value] of [
    ['meta[property="og:url"]', metadata.url], ['meta[property="og:title"]', metadata.title],
    ['meta[name="twitter:title"]', metadata.title], ['meta[name="description"]', metadata.description],
    ['meta[property="og:description"]', metadata.description]
  ]) document.querySelector(selector)?.setAttribute("content", value);
}

export function updateAppHeading(document, view) {
  for (const id of Object.keys(APP_ROUTES)) {
    const current = document.getElementById?.(`${id}-title`);
    const tag = id === view ? 'H1' : 'H2';
    if (!current || current.tagName === tag) continue;
    const heading = document.createElement(tag.toLowerCase());
    for (const attr of current.attributes) heading.setAttribute(attr.name, attr.value);
    heading.innerHTML = current.innerHTML;
    current.replaceWith(heading);
  }
}
