// Publisher IDs are public. Invalid or missing configuration never loads ads.
const CONSENT_REGIONS = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH AX EU'.split(' '));

export function adsenseClient(environment = {}) {
  const client = String(environment.ADSENSE_CLIENT || '').trim();
  return /^ca-pub-\d{16}$/.test(client) ? client : '';
}

export function adsenseAdsTxt(environment = {}) {
  const client = adsenseClient(environment);
  return client ? `google.com, ${client.slice(3)}, DIRECT, f08c47fec0942fa0\n` : '';
}

export function prepareAdSenseHtml(html, environment = {}, country = '') {
  const client = adsenseClient(environment);
  if (!client || !/<\/head\s*>/i.test(html)) return { html, nonce: '', adsEnabled: false };
  const location = String(country || '').toUpperCase();
  const consentReady = environment.ADSENSE_CMP_READY === 'true';
  // Use trusted Cloudflare geography. Unknown geography stays off until a CMP is ready.
  const allowedRegion = /^[A-Z]{2}$/.test(location) && location !== 'XX' && !CONSENT_REGIONS.has(location);
  const adsEnabled = environment.ADSENSE_ENABLED === 'true' && (consentReady || allowedRegion);
  const account = `<meta name="google-adsense-account" content="${client}" />`;
  if (!adsEnabled) return { html: html.replace(/<\/head\s*>/i, `${account}\n</head>`), nonce: '', adsEnabled: false };
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
  // Google supports nonce-based strict CSP; every first-party script must also carry it.
  const tagged = html.replace(/<script\b[^>]*>/gi, tag => tag.replace(/\snonce\s*=\s*(?:"[^"]*"|'[^']*')/gi, '').replace(/>$/, ` nonce="${nonce}">`));
  const script = `<script nonce="${nonce}" async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>`;
  return { html: tagged.replace(/<\/head\s*>/i, `${account}\n${script}\n</head>`), nonce, adsEnabled: true };
}
