import { admissionsGuides } from '../content/admissionsGuides.js';
import { projectPages } from '../content/projectPages.js';
import { APP_ROUTES, parseAppRoute } from '../public/js/core/appRoutes.js';

// Public HTML pages and their existing aliases, including the tools' own URLs.
const contentPaths = [...Object.values(APP_ROUTES).map(route => route.path).filter(path => path !== '/'), '/cam-nang/', ...admissionsGuides.map(guide => `/cam-nang/${guide.slug}/`), ...projectPages.map(page => `/${page.slug}/`)];
export const ADSENSE_PAGE_PATHS = new Set(['/', '/index.html', '/privacy', '/privacy.html', ...contentPaths.flatMap(path => [path, `${path}index.html`])]);
export function isAdSenseContentPage(pathname = '') {
  return ADSENSE_PAGE_PATHS.has(pathname) || Boolean(parseAppRoute(pathname)?.universityId);
}

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

export function nonceHtmlScripts(html) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
  return {
    html: html.replace(/<script\b[^>]*>/gi, tag => tag.replace(/\snonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/>$/, ` nonce="${nonce}">`)),
    nonce
  };
}

export function prepareAdSenseHtml(html, environment = {}, country = '', pathname = '') {
  const client = adsenseClient(environment);
  if (!client || !/<\/head\s*>/i.test(html)) return { html, nonce: '', adsEnabled: false };
  const location = String(country || '').toUpperCase();
  const consentReady = environment.ADSENSE_CMP_READY === 'true';
  // Use trusted Cloudflare geography. Unknown geography stays off until a CMP is ready.
  const allowedRegion = /^[A-Z]{2}$/.test(location) && location !== 'XX' && !CONSENT_REGIONS.has(location);
  const adsEnabled = isAdSenseContentPage(pathname) && environment.ADSENSE_ENABLED === 'true' && (consentReady || allowedRegion);
  const account = `<meta name="google-adsense-account" content="${client}" />`;
  if (!adsEnabled) return { html: html.replace(/<\/head\s*>/i, `${account}\n</head>`), nonce: '', adsEnabled: false };
  // Google supports nonce-based strict CSP; every first-party script must also carry it.
  const { html: tagged, nonce } = nonceHtmlScripts(html);
  // Apply Google's publisher privacy treatment to every visitor, without collecting age.
  const script = `<script nonce="${nonce}" async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous" data-privacy-treatments="disablePersonalization"></script>`;
  return { html: tagged.replace(/<\/head\s*>/i, `${account}\n${script}\n</head>`), nonce, adsEnabled: true };
}
