import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { htmlTables, plainText } from './lib/ts247-plans.mjs';

export const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
const plain = (html) => String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(?:x([a-f0-9]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10))).replace(/\s+/g, ' ').trim();
const admissionsPattern = /tuyen sinh|xet tuyen|diem (?:chuan|trung tuyen)|nguong (?:dau vao|dam bao)|quy doi/;
const unique = (items) => [...new Set(items.filter(Boolean))];

export function officialHost(url, website, extraHosts = []) {
  try {
    const candidate = new URL(url), school = new URL(website);
    if (!['http:', 'https:'].includes(candidate.protocol) || /tuyensinh247|facebook|youtube|google|tiktok/.test(candidate.hostname)) return false;
    const host = school.hostname.replace(/^www\./, '');
    return candidate.hostname === host || candidate.hostname.endsWith(`.${host}`) || candidate.hostname === `www.${host}` || extraHosts.includes(candidate.hostname);
  } catch { return false; }
}

export function inspectOfficialPage(html, url) {
  const articleTitle = plain(html.match(/<(?:h[1-3]|div)\b[^>]*class=["'](?:[^"']*\s)?(?:tt_Detail|newsdetail-title|article-title)(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/(?:h[1-3]|div)>/i)?.[1]);
  const heading = plain(html.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i)?.[1]);
  const title = articleTitle || (/\b2026\b/.test(heading) && admissionsPattern.test(normalize(heading)) ? heading : plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]));
  const titleKey = normalize(title);
  // A copyright year, navigation item or related article is not evidence for the article's year.
  const yearConfirmed = /\b2026\b/.test(titleKey) && admissionsPattern.test(titleKey) && !/sau dai hoc|thac si|tien si|lien thong|van bang (?:hai|2)|vao lop (?:6|10)/.test(titleKey);
  const main = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  const text = plain(main.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>|<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' '));
  const key = normalize(text);
  const topics = [];
  for (const [label, pattern] of [
    ['Phương thức', /phuong thuc (?:xet |tuyen )?tuyen|phuong thuc xet tuyen/],
    ['Ngành, mã ngành', /ma nganh|nganh dao tao|chuong trinh dao tao/],
    ['Tổ hợp', /to hop (?:xet tuyen|mon|tuyen sinh)/],
    ['Điều kiện, ngưỡng đầu vào', /nguong|dieu kien (?:xet |tuyen )?tuyen|dam bao chat luong/],
    ['Điểm trúng tuyển', /diem (?:chuan|trung tuyen)/],
    ['Công thức, quy đổi', /cong thuc|quy doi|diem xet tuyen\s*=/],
    ['Chỉ tiêu', /chi tieu/], ['Lịch tuyển sinh', /thoi gian|lich (?:xet |tuyen )?tuyen/],
    ['Học phí', /hoc phi/],
  ]) if (pattern.test(key)) topics.push(label);
  const anchors = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({href:m[1],title:plain(m[2]).slice(0,220)}));
  const embedded = [...html.matchAll(/<(?:iframe|embed|object)\b[^>]*(?:src|data)\s*=\s*["']([^"']+)["']/gi)].map(m=>({href:m[1],title:`Tài liệu đính kèm · ${title}`,embedded:true}));
  const links = [...anchors,...embedded].flatMap(item => {
    try {
      let link = new URL(item.href.replace(/&amp;/g, '&'), url);
      if(item.embedded && /^(?:docs|drive)\.google\.com$/.test(link.hostname) && link.searchParams.get('url')) link = new URL(link.searchParams.get('url'));
      if(item.embedded && !/\.pdf(?:$|\?)/i.test(link.href)) return [];
      link.hash = '';
      return [{ url:link.href, title:yearConfirmed && /\.pdf(?:$|\?)/i.test(link.href) ? `${item.title} · ${title}` : item.title }];
    } catch { return []; }
  });
  return { title:title.slice(0,250), yearConfirmed, topics, text, links };
}

export function extractOfficialFacts(html) {
  html = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  html = html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>|<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ');
  const methods = [], programs = [];
  for(const heading of String(html).matchAll(/<(?:h[2-6]|p)\b[^>]*>([\s\S]*?)<\/(?:h[2-6]|p)>/gi)) {
    const label=plainText(heading[1]).replace(/\s+/g,' ').trim();
    if(label.length > 350 || !/^(?:\d+(?:\.\d+)*[.)]?\s*)?(?:[-•+]\s*)?(?:Phương thức\s*(?:xét tuyển\s*)?\d+\s*[:.\-]|PT\s*\d+\s*[:.\-])/i.test(label) || !/xet tuyen|tuyen thang|ket qua thi|chung chi|thi tuyen|hoc ba/.test(normalize(label)) || /\b202[0-5]\b/.test(label)) continue;
    methods.push({code:label.match(/(?:mã\s*(?:phương thức\s*)?|phương thức\s*)(\d{3})\b/i)?.[1] || '',label});
  }
  const tables = [...String(html).matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  for (const match of tables) {
    const context = normalize(plainText(html.slice(Math.max(0,match.index-1000),match.index)));
    // Plans often repeat the previous two years' programs/results for comparison.
    if (/thong tin.{0,50}(?:2|hai) nam|diem (?:chuan|trung tuyen).{0,100}202[0-5]/.test(context.slice(-500))) continue;
    const rows = htmlTables(match[0])[0] || [];
    const headerIndex = rows.findIndex(row => row.some(cell => /phuong thuc|ma nganh|ma xet tuyen/.test(normalize(cell))));
    if(headerIndex < 0 || headerIndex > 3) continue;
    const header = rows[headerIndex].map(normalize);
    const methodIndex = header.findLastIndex(cell => /^(?:ten )?phuong thuc(?: \(.*?\))?(?: xet tuyen| tuyen sinh| \(xet tuyen\))?$/.test(cell.trim()));
    const methodCodeIndex = header.findIndex(cell => /ma (?:phuong thuc|ptxt)/.test(cell));
    const programIndex = header.findIndex(cell => /ten (?:chuong trinh|nganh)|^(?:nganh|chuong trinh) dao tao$/.test(cell));
    const nationalCodeIndex = header.findIndex(cell => /^ma nganh(?:,|$|\s)/.test(cell));
    const admissionCodeIndex = header.findIndex(cell => /^ma (?:xet tuyen|xt)$/.test(cell.trim()));
    const combinationIndex = header.findIndex(cell => /to hop/.test(cell));
    const quotaIndex = header.findIndex(cell => /^chi tieu$/.test(cell.trim()));
    for(const row of rows.slice(headerIndex+1)) {
      if(methodIndex >= 0 && programIndex < 0) {
        const label = row[methodIndex]?.trim() || '', code = row[methodCodeIndex]?.trim() || '';
        if(label.length > 5 && label.length < 450 && /xet|tuyen|ket qua|chung chi|thi /.test(normalize(label)) && (!code || /^\d{3}(?:\s*[,/|]\s*\d{3})*$/.test(code))) methods.push({code,label});
      }
      if(programIndex >= 0 && nationalCodeIndex >= 0) {
        const code = row[nationalCodeIndex]?.trim() || '', name = row[programIndex]?.trim() || '';
        if(!/^\d{7,8}[A-Z0-9]*$/i.test(code) || !name || name.length > 350) continue;
        const combination = unique((row[combinationIndex] || '').match(/\b[A-Z]\d{2}\b/g) || []).join(', ');
        const quota = row[quotaIndex]?.trim() || '';
        programs.push({code,name,admissionCode:row[admissionCodeIndex]?.trim() || '',combination,...(/^\d+$/.test(quota) ? {quota:Number(quota)} : {})});
      }
    }
  }
  return {methods:[...new Map(methods.map(m=>[`${m.code}|${m.label}`,m])).values()], programs:[...new Map(programs.map(p=>[`${p.code}|${p.name}|${p.admissionCode}`,p])).values()]};
}

export async function researchOfficialProfiles({ codes = [], refresh = false } = {}) {
  const [schools, research, notes, catalog] = await Promise.all(['data/universities.json','data/research/admission-methods-2026.json','data/research/admission-methods-2026-notes.json','data/school-formula-catalog-2026.json'].map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const cache = 'tmp/official-profiles-2026'; await mkdir(cache, { recursive:true });
  const overrides = await readFile('data/research/official-profile-links-2026.json','utf8').then(JSON.parse).catch(e => { if(e.code === 'ENOENT') return {}; throw e; });
  const results = [];
  const pages = new Map();
  async function fetchPage(url) {
    if (pages.has(url)) return pages.get(url);
    const task = (async () => {
      const id = createHash('sha256').update(url).digest('hex');
      if (!refresh) {
        try {
          const cached = JSON.parse(await readFile(`${cache}/${id}.json`, 'utf8'));
          if(cached.kind === 'html') return {...cached,...inspectOfficialPage(await readFile(`${cache}/${id}.html`,'utf8'),cached.url)};
          return cached;
        } catch(e) { if(e.code !== 'ENOENT') throw e; }
      }
      let page;
      try {
        const response = await fetch(url, { signal:AbortSignal.timeout(15000), headers:{ 'User-Agent':'Mozilla/5.0 (compatible; TinhDiemTHPT admissions research)', Accept:'text/html,application/pdf' } });
        const mime = response.headers.get('content-type') || '';
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (/pdf/.test(mime) || /\.pdf(?:$|\?)/i.test(response.url)) {
          await writeFile(`${cache}/${id}.pdf`, new Uint8Array(await response.arrayBuffer()));
          page = { url:response.url, requestedUrl:url, checkedAt:new Date().toISOString(), kind:'pdf', file:`${cache}/${id}.pdf` };
        } else if (/text|html|xml|json/.test(mime)) {
          const html = await response.text();
          await writeFile(`${cache}/${id}.html`, html);
          const info = inspectOfficialPage(html, response.url);
          page = { url:response.url, requestedUrl:url, checkedAt:new Date().toISOString(), kind:'html', ...info };
        } else throw new Error(`Loại nội dung ${mime}`);
      } catch(e) { page = { url, checkedAt:new Date().toISOString(), error:e.message }; }
      await writeFile(`${cache}/${id}.json`, JSON.stringify(page));
      return page;
    })();
    pages.set(url, task); return task;
  }
  const queue = schools.filter(s => !codes.length || codes.includes(s.code));
  const total = queue.length;
  async function runner() {
    while (queue.length) {
      const school = queue.shift();
      const r = research.schools.find(s => s.code === school.code);
      const c = catalog.schools.find(s => s.schoolCode === school.code);
      const supplied = overrides[school.code] || {};
      const explicitOfficial = unique([...(r?.sources || []).filter(s => ['official','primary'].includes(s.type)).map(s => s.url), ...(notes.schools[school.code]?.sources || []).filter(s => ['official','primary'].includes(s.type)).map(s => s.url), ...(c?.methods || []).filter(m => m.evidence?.kind === 'official_primary').map(m => m.evidence.url)]);
      const extraHosts = unique([...explicitOfficial,...(supplied.urls || [])].filter(u => !/tuyensinh247/.test(u)).map(u => { try{return new URL(u).hostname;}catch{return '';} }));
      const website = supplied.website || school.website;
      const allowed = url => officialHost(url, website, extraHosts);
      const initial = unique([...(supplied.urls || []), ...explicitOfficial, school.admissions?.methodsSourceUrl, ...(school.admissions?.sources || []), website]).filter(allowed);
      initial.sort((a,b) => Number(/2026/.test(b)) - Number(/2026/.test(a)));
      // Read the current homepage too; an old saved regulation alone is insufficient.
      const seeds = unique([website, ...initial.slice(0,5)]);
      const fetched = await Promise.all(seeds.map(fetchPage));
      const visited = new Set(seeds);
      let frontier = fetched.flatMap(p => p.links || []);
      for (let depth=0;depth<2;depth++) {
        const candidates = [...new Map(frontier.filter(l => allowed(l.url) && !visited.has(l.url) && !/mailto:|\.(?:jpg|png|zip|xlsx|docx?)(?:$|\?)/i.test(l.url)).map(l => [l.url,l])).values()];
        const rank = l => (/\b2026\b/.test(normalize(l.title+' '+l.url)) ? 10 : 0) + (admissionsPattern.test(normalize(l.title+' '+l.url)) ? 8 : 0) + (/thong tin tuyen sinh|de an|phuong thuc|quy che/.test(normalize(l.title)) ? 4 : 0) - (/sau dai hoc|thac si|tien si|lien thong|van bang hai|202[0-5]/.test(normalize(l.title)) ? 30 : 0);
        const selected = candidates.filter(l => rank(l) >= 8).sort((a,b) => rank(b)-rank(a)).slice(0, depth === 0 ? 6 : 5);
        for (const l of selected) visited.add(l.url);
        const batch = await Promise.all(selected.map(async l => ({...await fetchPage(l.url), linkTitle:l.title})));
        fetched.push(...batch); frontier = batch.flatMap(p => p.links || []);
      }
      const documents = [...new Map(fetched.filter(p => allowed(p.url) && !p.error && (p.yearConfirmed || p.kind === 'pdf' && /2026/.test(p.linkTitle || p.url))).map(p => [p.url, {url:p.url,title:p.title || p.linkTitle || 'Tài liệu tuyển sinh năm 2026',kind:p.kind,topics:p.topics || [],checkedAt:p.checkedAt.slice(0,10), ...(p.kind === 'pdf' ? {file:p.file,verification:'needs_pdf_read'} : {verification:'year_title_confirmed'})}])).values()];
      const result = {code:school.code,name:school.name,website,checkedAt:new Date().toISOString().slice(0,10),status:documents.some(d => d.verification === 'year_title_confirmed') ? 'official_2026_pages_found' : documents.length ? 'official_documents_pending' : 'needs_search',documents,attempts:fetched.map(p => ({url:p.url,title:p.title || p.linkTitle || '',kind:p.kind || '',error:p.error || '',yearConfirmed:p.yearConfirmed || false}))};
      results.push(result);
      await writeFile(`${cache}/school-${school.code}.json`,JSON.stringify(result,null,2));
      if(results.length % 10 === 0 || results.length === total) console.log(`Trường ${results.length}/${total}; có tài liệu 2026: ${results.filter(r=>r.documents.length).length}; cần tìm tiếp: ${results.filter(r=>!r.documents.length).length}`);
    }
  }
  await Promise.all(Array.from({length:6},runner));
  results.sort((a,b) => a.code.localeCompare(b.code));
  const report = {year:2026,checkedAt:new Date().toISOString().slice(0,10),priority:['official_admissions','official_university','reliable_secondary','tuyensinh247_last_resort'],summary:{schools:results.length,officialPagesFound:results.filter(r=>r.status === 'official_2026_pages_found').length,pdfPending:results.filter(r=>r.status === 'official_documents_pending').length,needsSearch:results.filter(r=>r.status === 'needs_search').length},schools:results};
  await writeFile(`${cache}/report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.summary)); return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await researchOfficialProfiles({codes:(process.argv.find(a=>a.startsWith('--codes=')) || '').slice(8).split(',').filter(Boolean), refresh:process.argv.includes('--refresh')});
