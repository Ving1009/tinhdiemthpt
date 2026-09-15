const fs = require('fs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "d")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const test = async () => {
  const unis = JSON.parse(fs.readFileSync('data/universities.json', 'utf8'));

  // First let's build the directory of VnExpress schools
  // We can query a-z and 0-9
  const vneSchools = new Map(); // id -> { id, name, code, text }
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  console.log('Harvesting VnExpress schools directory...');
  for (const l of letters) {
    try {
      const res = await fetch(`https://diemthi.vnexpress.net/tra-cuu-dai-hoc/loadcollegev2?input_college=${l}`, {
        headers: { "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest", Referer: "https://diemthi.vnexpress.net/tra-cuu-dai-hoc" }
      });
      const data = await res.json();
      const html = data.html || '';
      const matches = html.matchAll(/data-id="(\d+)"[^>]*data-name="([^"]+)"[^>]*data-text="([^"]+)"/g);
      for (const m of matches) {
        const id = m[1];
        const name = m[2];
        const text = m[3];
        // extract code from text e.g. "BKA - Đại học Bách khoa Hà Nội" or "QHL - Trường Luật..."
        const codeMatch = text.match(/^([A-Z0-9]+)\s*[-|]/);
        const code = codeMatch ? codeMatch[1].trim() : '';
        vneSchools.set(id, { id, name, code, text });
      }
    } catch (e) {
      console.error(l, e.message);
    }
  }
  console.log(`Harvested ${vneSchools.size} unique schools from VnExpress directory.`);

  // Build lookup by code and normalized name
  const vneByCode = new Map();
  for (const s of vneSchools.values()) {
    if (s.code) vneByCode.set(s.code.toUpperCase(), s);
  }

  // Now match our 326 universities
  const matched = [];
  const unmatched = [];

  for (const u of unis) {
    const codeUpper = (u.code || '').toUpperCase();
    if (vneByCode.has(codeUpper)) {
      matched.push({ uni: u, vne: vneByCode.get(codeUpper), method: 'code' });
      continue;
    }

    // Try direct search on VnExpress if not in harvested directory
    try {
      await sleep(100);
      const res = await fetch(`https://diemthi.vnexpress.net/tra-cuu-dai-hoc/loadcollegev2?input_college=${encodeURIComponent(u.code)}`, {
        headers: { "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest", Referer: "https://diemthi.vnexpress.net/tra-cuu-dai-hoc" }
      });
      const data = await res.json();
      const html = data.html || '';
      const matches = [...html.matchAll(/data-id="(\d+)"[^>]*data-name="([^"]+)"[^>]*data-text="([^"]+)"/g)];
      let found = null;
      for (const m of matches) {
        const text = m[3];
        const codeMatch = text.match(/^([A-Z0-9]+)\s*[-|]/);
        if (codeMatch && codeMatch[1].toUpperCase() === codeUpper) {
          found = { id: m[1], name: m[2], code: codeMatch[1], text };
          break;
        }
      }
      if (found) {
        matched.push({ uni: u, vne: found, method: 'search-code' });
        continue;
      }
    } catch (e) {}

    // Try search by clean name
    try {
      await sleep(100);
      const cleanName = u.name
        .replace(/^(Trường\s+)?Đại học\s+/i, '')
        .replace(/^(Trường\s+)?Học viện\s+/i, '')
        .replace(/-\s*Đại học.*$/i, '')
        .trim();
      const res = await fetch(`https://diemthi.vnexpress.net/tra-cuu-dai-hoc/loadcollegev2?input_college=${encodeURIComponent(cleanName.slice(0, 30))}`, {
        headers: { "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest", Referer: "https://diemthi.vnexpress.net/tra-cuu-dai-hoc" }
      });
      const data = await res.json();
      const html = data.html || '';
      const matches = [...html.matchAll(/data-id="(\d+)"[^>]*data-name="([^"]+)"[^>]*data-text="([^"]+)"/g)];
      const normU = normalize(u.name);
      let best = null;
      for (const m of matches) {
        const normV = normalize(m[2]);
        if (normU === normV || normV.includes(normU) || normU.includes(normV)) {
          best = { id: m[1], name: m[2], text: m[3] };
          break;
        }
      }
      if (best) {
        matched.push({ uni: u, vne: best, method: 'search-name' });
      } else {
        unmatched.push(u);
      }
    } catch (e) {
      unmatched.push(u);
    }
  }

  console.log(`Matched: ${matched.length}/${unis.length}`);
  console.log(`Unmatched: ${unmatched.length}/${unis.length}`);
  fs.writeFileSync('scripts/vne-mapping.json', JSON.stringify({ matched, unmatched }, null, 2));
  console.log('Unmatched samples (first 15):', unmatched.slice(0, 15).map(u => ({ code: u.code, name: u.name })));
};

test();
