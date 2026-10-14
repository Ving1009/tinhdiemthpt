import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { extractOfficialFacts, inspectOfficialPage, normalize, officialHost } from './research-official-profiles-2026.mjs';
import { ADMISSIONS_2026_NOTICE } from '../public/js/admissions.js';

export const REFERENCE_NOTICE = ADMISSIONS_2026_NOTICE;
const uniqueBy = (items, key) => [...new Map(items.map(item => [key(item),item])).values()];
export function enrichOfficialInformation(information, note = {}) {
  if (!note.checkedAt) return information;
  const sources = (note.sources || []).filter(source => ['official', 'primary'].includes(source.type) && source.year === 2026 && source.checkedAt === note.checkedAt && /^https:\/\//.test(source.url));
  if (!sources.length) return information;
  const documents = sources.map(source => {
    const previous = information.documents.find(document => document.url === source.url);
    return {title:previous?.title || 'Tuyển sinh 2026 · Phương thức, điều kiện và công thức xét tuyển',url:source.url,topics:['Phương thức, công thức và điều kiện xét tuyển'],checkedAt:source.checkedAt,provisional:Boolean(previous?.provisional) || /du[-_]?thao|duthao|du-kien/i.test(source.url),...(/\.pdf(?:\?|$)/i.test(source.url) ? {kind:'pdf'} : {})};
  });
  information.documents = [...documents, ...information.documents.filter(document => !sources.some(source => source.url === document.url))].slice(0,8);
  information.checkedAt = note.checkedAt;
  information.status = 'official_documents_available';
  information.note = 'Đã đối chiếu thêm phương thức, công thức và điều kiện từ nguồn tuyển sinh 2026 của trường. Mỗi công thức có phạm vi ngành và mức độ xác minh riêng; phần còn thiếu bảng quy đổi hoặc có nguồn mâu thuẫn được ghi rõ tại phương thức.';
  if (note.officialMethodLabels?.length) information.methods = note.officialMethodLabels.map(label => ({code:'',label}));
  return information;
}
const planRank = title => (/thong tin tuyen sinh|de an tuyen sinh|thong bao tuyen sinh|phuong thuc/.test(normalize(title)) ? 10 : 0) - (/bo sung|diem chuan|trung tuyen|nhap hoc|nguong|thi nang khieu|tu van|hoi nghi|dieu chinh/.test(normalize(title)) ? 5 : 0);

export async function importOfficialProfiles({write = false} = {}) {
  const cache = 'tmp/official-profiles-2026';
  const [universities, links, notes] = await Promise.all(['data/universities.json','data/research/official-profile-links-2026.json','data/research/admission-methods-2026-notes.json'].map(async path=>JSON.parse(await readFile(path,'utf8'))));
  const reports = await Promise.all((await readdir(cache)).filter(file=>file.startsWith('school-') && file.endsWith('.json')).map(async file=>JSON.parse(await readFile(`${cache}/${file}`,'utf8'))));
  const cachedPages = await Promise.all((await readdir(cache)).filter(file=>/^[a-f0-9]{64}\.json$/.test(file)).map(async file=>({file,...JSON.parse(await readFile(`${cache}/${file}`,'utf8'))})));
  const pageByUrl = new Map(cachedPages.map(page=>[page.url,page]));
  const byCode = new Map(reports.map(r=>[r.code,r]));
  const report = {year:2026,checkedAt:new Date().toISOString().slice(0,10),priority:['official_admissions','official_university','reliable_secondary','tuyensinh247_last_resort'],notice:REFERENCE_NOTICE,summary:{schools:universities.length,withOfficialDocuments:0,withMethodTables:0,withProgramTables:0,websitesConfirmed:0,needsReview:0},schools:[]};
  for(const school of universities) {
    const checked = byCode.get(school.code);
    if(!checked) throw new Error(`Chưa rà soát ${school.code}.`);
    const documents = [], plans = [];
    for(const document of checked.documents) {
      if(/sau dai hoc|thac si|tien si|lien thong|van bang|vua lam vua hoc|tu xa|chuyen khoa|chuong trinh (?:thu|dao tao thu) (?:2|hai)/.test(normalize(document.title))) continue;
      const page=pageByUrl.get(document.url);
      if(document.kind === 'pdf') {
        const text=await readFile(document.file.replace('.pdf','.txt'),'utf8').catch(e=>{if(e.code === 'ENOENT')return '';throw e;});
        const head=normalize(text.slice(0,2300)).replace(/\s+/g,' ');
        if(!/(?:thong tin|thong bao|ke hoach|quy che|tuyen sinh|phuong thuc).{0,180}(?:nam|2026).{0,40}\b2026\b/.test(head) || /sau dai hoc|thac si|tien si|chuyen khoa|vua lam vua hoc|\bvlvh\b|lien thong|tu xa|van bang (?:2|hai)/.test(head.slice(0,1100))) continue;
        const shared=links[school.code]?.sharedDocuments?.includes(document.url);
        documents.push({title:shared ? 'Bộ Quốc phòng · Những điều cần biết về tuyển sinh quân sự năm 2026' : document.title,url:document.url,topics:['Tài liệu PDF tuyển sinh 2026'],checkedAt:document.checkedAt,provisional:/du kien|du thao/.test(head.slice(0,1800)),kind:'pdf'});
        // A handbook covering 18 schools cannot supply a single school's program table without page scoping.
        if(shared) continue;
        // PDF extraction loses headings, year columns and merged cells. Keep the
        // verified document link; only import scoped tables from readable HTML.
        continue;
      }
      const html=await readFile(`${cache}/${page?.file?.replace('.json','.html') || createHash('sha256').update(document.url).digest('hex')+'.html'}`,'utf8').catch(e=>{if(e.code === 'ENOENT')return '';throw e;});
      if(!html) continue;
      const info=inspectOfficialPage(html,document.url);
      if(!info.yearConfirmed) continue;
      // This school has stale domains in older aggregators; never publish another institution's site.
      if(school.code === 'DBH' && !normalize(info.text).includes('dai hoc quoc te bac ha')) continue;
      documents.push({title:document.title,url:document.url,topics:document.topics,checkedAt:document.checkedAt,provisional:/du kien|du thao/.test(normalize(document.title))});
      if(planRank(document.title) > 0) plans.push({url:document.url,title:document.title,...extractOfficialFacts(html)});
    }
    const usable = uniqueBy(documents,d=>d.url.replace(/\?(?:print=print|hitcount=0)$/,''));
    usable.sort((a,b)=>planRank(b.title)-planRank(a.title));
    plans.sort((a,b)=>planRank(b.title)-planRank(a.title));
    const methodPlan=plans.find(p=>p.methods.length);
    const programPlan=plans.find(p=>p.programs.length);
    let methods = methodPlan?.methods || [];
    const programs = programPlan?.programs || [];
    const scopeNote = /phan hieu|co so|phia bac|phia nam|dai hoc quoc gia|dai hoc thai nguyen$/.test(normalize(school.name)) || links[school.code]?.sharedDocuments?.length ? 'Tài liệu có thể gồm nhiều cơ sở hoặc đơn vị thành viên. Chỉ dùng dòng ngành, điều kiện và điểm ghi đúng cơ sở dự tuyển.' : '';
    const information = {
      year:2026,checkedAt:checked.checkedAt?.slice(0,10) || report.checkedAt,
      status:usable.length ? 'official_documents_available' : 'official_evidence_pending',
      notice:REFERENCE_NOTICE,
      note:usable.length ? 'Đã tìm được tài liệu tuyển sinh 2026 của trường. Các bảng bổ sung chỉ gồm phần đọc được từ tài liệu, có thể chưa đầy đủ. Mức độ xác minh của ngành, điểm và công thức vẫn được ghi riêng ở từng mục.' : 'Chưa xác minh được trang hoặc tài liệu tuyển sinh chính thức năm 2026. Dữ liệu hiện có chỉ để tham khảo; việc không truy cập được nguồn không có nghĩa trường chưa công bố.',
      scopeNote,
      documents:usable.slice(0,8),
      methods,
      programs,
      ...(methodPlan ? {methodTableUrl:methodPlan.url} : {}),
      ...(programPlan ? {programTableUrl:programPlan.url} : {})
    };
    enrichOfficialInformation(information, notes.schools[school.code]);
    usable.splice(0, usable.length, ...information.documents, ...usable.filter(document => !information.documents.some(value => value.url === document.url)));
    methods = information.methods;
    school.admissions = {...school.admissions,information2026:information};
    if (notes.schools[school.code]?.officialMethodLabels?.length && notes.schools[school.code]?.checkedAt) school.admissions.methods = notes.schools[school.code].officialMethodLabels;
    if(links[school.code]?.websiteStatus === 'needs_review') {
      school.websiteStatus = 'needs_review';
      school.website = '';
      information.note += ' Liên kết website cũ đã được ẩn vì chưa xác nhận được đúng cơ sở.';
    }
    if(usable.length) {
      report.summary.withOfficialDocuments++;
      school.admissions.sources = [...new Set([...(school.admissions.sources || []),...usable.map(d=>d.url)])];
      const website = links[school.code]?.website;
      if(website && usable.some(d=>officialHost(d.url,website))) {school.website=website;report.summary.websitesConfirmed++;}
    } else report.summary.needsReview++;
    if(methods.length) report.summary.withMethodTables++;
    if(programs.length) report.summary.withProgramTables++;
    // A plan's program-wide combinations do not identify individual cutoff rows:
    // one program can have different scores for different combination groups.
    report.schools.push({...checked,checkedAt:information.checkedAt,documents:usable,methodTableCount:methods.length,programTableCount:programs.length,scopeNote,status:information.status});
  }
  if(write) await Promise.all([
    writeFile('data/universities.json',JSON.stringify(universities,null,2)+'\n'),
    writeFile('data/research/official-profiles-2026.json',JSON.stringify(report,null,2)+'\n')
  ]);
  console.log(JSON.stringify({mode:write?'write':'audit',...report.summary}));
  return report;
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await importOfficialProfiles({write:process.argv.includes('--write')});
