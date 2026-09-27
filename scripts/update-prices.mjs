// Rebuilt update‑prices script based on README-updater.md
// -------------------------------------------------------
// This script fetches CS:GO terminal collection skin prices from the Steam Community Market.
// It uses three strategies:
//   1️⃣ Fast API call (priceoverview)
//   2️⃣ HTML scrape of the market listing page
//   3️⃣ Playwright fallback (headless Chromium) when rate‑limited or API fails.
// It also extracts prices for all conditions in a single Playwright page load.

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// ---------- Configuration & helpers ----------
const start = Date.now();
let consecutive429s = 0;
const RATE_LIMIT_THRESHOLD = 3; // after this many 429s we switch to Playwright
let usePlaywrightFallback = false;

function recordRateLimit(hit) {
  if (hit) {
    consecutive429s++;
    if (consecutive429s >= RATE_LIMIT_THRESHOLD && !usePlaywrightFallback) {
      usePlaywrightFallback = true;
      console.log(`[RATE LIMIT] ${consecutive429s} consecutive 429s – switching to Playwright fallback`);
    }
  } else {
    consecutive429s = 0;
    if (usePlaywrightFallback) {
      console.log('[RATE LIMIT] Successful request – switching back to API');
      usePlaywrightFallback = false;
    }
  }
}
function shouldUsePlaywright() { return usePlaywrightFallback; }
function resetRateLimit() { consecutive429s = 0; usePlaywrightFallback = false; }

function getRandomUserAgent() {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}
function getRandomAcceptLanguage() {
  const langs = ['en-US,en;q=0.9', 'en-GB,en;q=0.8', 'de-DE,de;q=0.7', 'fr-FR,fr;q=0.7', 'es-ES,es;q=0.7'];
  return langs[Math.floor(Math.random() * langs.length)];
}

const defaultHeaders = () => ({
  'User-Agent': getRandomUserAgent(),
  'Accept-Language': getRandomAcceptLanguage(),
  'Referer': 'https://steamcommunity.com/market/',
  'Accept': '*/*',
  'X-Requested-With': 'XMLHttpRequest',
});

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function steam(path, extraHeaders = {}) {
  const headers = { ...defaultHeaders(), ...extraHeaders };
  console.log(`[API] GET ${path}`);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(`https://steamcommunity.com${path}`, { headers, signal: AbortSignal.timeout(15000) });
      const isRateLimited = response.status === 429;
      recordRateLimit(isRateLimited);
      if (!isRateLimited) {
        resetRateLimit();
        return response;
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await wait(Math.min(isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1), 5000));
    } catch (e) {
      console.log(`[API] Attempt ${attempt + 1} failed: ${e.message}`);
      if (attempt === 0) await wait(2000);
    }
  }
  console.log(`[API] All attempts failed for ${path}`);
  return null;
}

// ---------- Price / volume lookup ----------
async function lookup(marketHashName, includeVolume = false) {
  const query = encodeURIComponent(marketHashName);
  // 1️⃣ API (priceoverview) – try a few currencies to improve hit‑rate
  if (!shouldUsePlaywright()) {
    const currencies = ['1', '3', '6']; // USD, EUR, GBP
    for (const cur of currencies) {
      try {
        const resp = await steam(`/market/priceoverview/?appid=730&currency=${cur}&market_hash_name=${query}`);
        if (!resp?.ok) continue;
        const data = await resp.json();
        const price = data.lowest_price || data.price || '--';
        const volume = includeVolume ? data.volume || '--' : '--';
        return { success: true, price, listings: '--', volume };
      } catch {}
    }
  } else {
    console.log('[LOOKUP] Rate limited – skipping priceoverview API');
  }

  // 2️⃣ HTML scrape of the listing page
  console.log('[LOOKUP] Trying HTML scrape fallback');
  try {
    const resp = await steam(`/market/listings/730/${query}`);
    if (resp?.ok) {
      const html = await resp.text();
      const match = html.match(/"sell_price_text"\s*:\s*"([^"]+)"/i);
      if (match) {
        let price = match[1];
        if (price.includes('$')) price = price.replace('$', '€').replace('.', ',');
        return { success: true, price, listings: '--', volume: '--' };
      }
    }
  } catch {}

  // 3️⃣ search/render fallback (provides price & listings count)
  if (!shouldUsePlaywright()) {
    try {
      const resp = await steam(`/market/search/render/?query=${query}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1&currency=3`);
      if (!resp?.ok) return { success: false };
      const data = await resp.json();
      const exact = data.results?.find(i => i.hash_name === marketHashName);
      if (exact?.sell_price_text) {
        let price = exact.sell_price_text;
        if (price.includes('$')) price = price.replace('$', '€').replace('.', ',');
        return { success: true, price, listings: exact.sell_listings || '--', volume: '--' };
      }
    } catch {}
  }

  // 4️⃣ Playwright fallback – full browser scrape
  console.log('[LOOKUP] All fast methods failed – trying Playwright');
  try {
    const pwPrice = await playwrightFallback(marketHashName);
    if (pwPrice) return { success: true, price: pwPrice, listings: '--', volume: '--' };
  } catch (e) { console.error('[PLAYWRIGHT] fallback error', e); }
  return { success: false };
}

async function fetchVolume(marketHashName) {
  const query = encodeURIComponent(marketHashName);
  if (shouldUsePlaywright()) { console.log('[VOLUME] Rate limited – skipping API'); return '--'; }
  const currencies = ['1', '3', '6', '2', '5', '7', '8'];
  for (const cur of currencies) {
    try {
      const resp = await steam(`/market/priceoverview/?appid=730&currency=${cur}&market_hash_name=${query}`);
      if (!resp?.ok) continue;
      const data = await resp.json();
      if (data.volume) return data.volume;
    } catch {}
  }
  // HTML fallback for volume
  try {
    const resp = await steam(`/market/listings/730/${query}`);
    if (resp?.ok) {
      const html = await resp.text();
      const m = html.match(/"volume"\s*:\s*"?(\d+)"?/i);
      if (m) return m[1];
    }
  } catch {}
  return '--';
}

async function fetchPrice(marketHashName) {
  const query = encodeURIComponent(marketHashName);
  // Playwright cache path – if we already have condition map we can reuse it
  if (shouldUsePlaywright()) {
    const condMatch = marketHashName.match(/\(([^)]+)\)$/);
    const condition = condMatch ? condMatch[1] : null;
    const base = marketHashName.replace(/ \([^)]*\)$/, '');
    if (condition) {
      const map = await getConditionPrices(base);
      if (map && map[condition]) return map[condition];
    }
  }

  // HTML scrape first (often gives condition‑specific price)
  console.log('[PRICE] Trying HTML scrape');
  try {
    const resp = await steam(`/market/listings/730/${query}`);
    if (resp?.ok) {
      const html = await resp.text();
      const m = html.match(/"sell_price_text"\s*:\s*"([^"]+)"/i);
      if (m) {
        let price = m[1];
        if (price.includes('$')) price = price.replace('$', '€').replace('.', ',');
        return price;
      }
    }
  } catch {}

  // API priceoverview (multiple currencies)
  if (!shouldUsePlaywright()) {
    const currencies = ['1', '3', '6', '2', '5', '7', '8'];
    for (const cur of currencies) {
      try {
        const resp = await steam(`/market/priceoverview/?appid=730&currency=${cur}&market_hash_name=${query}`);
        if (!resp?.ok) continue;
        const data = await resp.json();
        let price = data.lowest_price || data.price;
        if (price && cur === '1' && price.includes('$')) price = price.replace('$', '€').replace('.', ',');
        if (price) return price;
      } catch {}
    }
  } else {
    console.log('[PRICE] Rate limited – skipping API');
  }

  // Older priceoverview without currency
  if (!shouldUsePlaywright()) {
    try {
      const resp = await steam(`/market/priceoverview/?appid=730&market_hash_name=${query}`);
      if (resp?.ok) {
        const data = await resp.json();
        let price = data.lowest_price || data.price;
        if (price && price.includes('$')) price = price.replace('$', '€').replace('.', ',');
        if (price) return price;
      }
    } catch {}
  }

  // Final Playwright fallback
  console.log('[PRICE] All fast methods failed – Playwright fallback');
  try { return await playwrightFallback(marketHashName); } catch (e) { console.error(e); }
  return null;
}

// ---------- Playwright helpers ----------
let _browserInstance = null;
let _browserLaunchFailed = false;
async function getBrowser() {
  if (!_browserInstance && !_browserLaunchFailed) {
    console.log('[PLAYWRIGHT] Launching headless Chromium');
    try { _browserInstance = await chromium.launch({ headless: true }); }
    catch (e) { console.log('[PLAYWRIGHT] Launch failed:', e.message); _browserLaunchFailed = true; throw e; }
  }
  if (_browserLaunchFailed) throw new Error('Playwright not available');
  return _browserInstance;
}
async function getBrowserContext() {
  const browser = await getBrowser();
  return await browser.newContext({
    userAgent: defaultHeaders()['User-Agent'],
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': defaultHeaders()['Accept-Language'],
      Accept: '*/*',
      Referer: 'https://steamcommunity.com/market/',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
}

async function playwrightFallback(marketHashName) {
  if (_browserLaunchFailed) return null;
  const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
  let page, context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Try to read price from embedded script data
    const scriptPrice = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const txt = s.textContent;
        if (txt && txt.includes('sell_price_text')) {
          const m = txt.match(/"sell_price_text"\s*:\s*"([^"]+)"/);
          if (m) return m[1];
        }
      }
      return null;
    });
    if (scriptPrice) return scriptPrice;
    // Generic selectors fallback
    const selectors = [
      '#market_commodity_buyrequests .market_listing_price.market_listing_price_with_fee',
      '#market_commodity_buyrequests .market_listing_price',
      '.market_commodity_buyrequests .market_listing_price',
      '.market_listing_price.market_listing_price_with_fee',
      '#market_commodity_buyrequests span.market_listing_price',
      '.market_table_value .market_listing_price',
      '[id^="buyOrder"] .market_listing_price',
      '.market_listing_price',
      '[data-price]',
      '.price',
    ];
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) {
        const txt = await el.textContent();
        if (txt && txt.trim()) return txt.trim();
      }
    }
    // Final text search
    const body = await page.evaluate(() => document.body.innerText);
    const m = body.match(/[\$€£]\s*\d+[.,]\d{2}/);
    return m ? m[0] : null;
  } catch (e) {
    if (e.message.includes('Executable doesn') || e.message.includes('browserType.launch')) {
      console.log('[PLAYWRIGHT] Browser not installed – disabling fallback');
      _browserLaunchFailed = true;
    } else {
      console.error('[PLAYWRIGHT] Error:', e.message);
    }
    return null;
  } finally {
    if (page) try { await page.close(); } catch {}
    if (context) try { await context.close(); } catch {}
  }
}

// Cache condition maps per weapon/skin
const weaponPageCache = new Map();
async function getConditionPrices(weaponSkin) {
  if (weaponPageCache.has(weaponSkin)) return weaponPageCache.get(weaponSkin);
  if (_browserLaunchFailed) return {};
  const browser = await getBrowser();
  const context = await getBrowserContext();
  const page = await context.newPage();
  const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(weaponSkin)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Try to read g_rgListingInfo (Steam's JS object)
  const map = await page.evaluate(() => {
    const out = {};
    if (window.g_rgListingInfo) {
      for (const key in window.g_rgListingInfo) {
        const info = window.g_rgListingInfo[key];
        const name = info.market_name || '';
        const price = info.sell_price_text || '';
        const m = name.match(/\(([^)]+)\)$/);
        if (m && price) out[m[1]] = price;
      }
    }
    return out;
  });
  // Fallback: parse Market_LoadOrderSpread script
  if (Object.keys(map).length === 0) {
    const script = await page.$$eval('script', ss => ss.map(s => s.textContent).join('\n'));
    const match = script.match(/Market_LoadOrderSpread\((\{.*?\})\);/s);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        if (data.sell_order) {
          data.sell_order.forEach(o => {
            const name = o.market_name || '';
            const price = o.sell_price_text || '';
            const m = name.match(/\(([^)]+)\)$/);
            if (m && price) map[m[1]] = price;
          });
        }
      } catch (e) { console.error('[PLAYWRIGHT] JSON parse error', e.message); }
    }
  }
  weaponPageCache.set(weaponSkin, map);
  try { await page.close(); } catch {}
  try { await context.close(); } catch {}
  return map;
}

async function lookupCondition(weapon, skin, condition) {
  const base = `${weapon} | ${skin}`;
  const full = `${weapon} | ${skin} (${condition})`;
  if (shouldUsePlaywright()) {
    const normalMap = await getConditionPrices(base);
    const statMap = await getConditionPrices(`StatTrak™ ${base}`);
    const normalPrice = normalMap[condition] || null;
    const statPrice = statMap[condition] || null;
    return [
      [base, normalPrice ? { sell_price_text: normalPrice, sell_listings: '--', volume: await fetchVolume(base) } : null],
      [`StatTrak™ ${base}`, statPrice ? { sell_price_text: statPrice, sell_listings: '--', volume: await fetchVolume(`StatTrak™ ${base}`) } : null],
    ];
  }
  // API / HTML path – reuse lookup()
  const result = await lookup(full);
  return [[full, result.success ? { sell_price_text: result.price, sell_listings: result.listings, volume: result.volume } : null]];
}

// ---------- Data definitions ----------
const conditions = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
const skins = [
  ['AK-47', 'The Oligarch'], ['M4A4', 'Full Throttle'], ['AWP', 'Ice Coaled'], ['Glock-18', 'Mirror Mosaic'], ['MP7', 'Smoking Kills'],
  ['M4A1-S', 'Liquidation'], ['Dual Berettas', 'Angel Eyes'], ['UMP-45', 'Continuum'], ['MAC-10', 'Cat Fight'], ['Nova', 'Ocular'],
  ['AUG', 'Trigger Discipline'], ['P2000', 'Red Wing'], ['MP5-SD', 'Focus'], ['MP9', 'Broken Record'], ['MAG-7', 'MAGnitude'],
  ['P250', 'Bullfrog'], ['SCAR-20', 'Caged'],
];
const container = 'Sealed Genesis Terminal';

// ---------- Main execution ----------
(async () => {
  const prices = {};
  const skinCatalog = {};
  const generatedAt = new Date().toISOString();

  const totalWeapons = skins.length;
  const totalItems = 1 + totalWeapons * conditions.length * 2; // container + each condition normal+stattrak
  let completed = 0;
  const renderBar = (label) => {
    const pct = ((completed / totalItems) * 100).toFixed(1).padStart(5);
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    console.log(`[PROGRESS] ${label} [${bar}] ${pct}% (${completed}/${totalItems})`);
  };

  // Container price
  console.log('[MAIN] Fetching container price');
  const containerResult = await lookup(container, true);
  prices[container] = containerResult.success ? { success: true, price: containerResult.price, listings: containerResult.listings, volume: containerResult.volume } : { success: false };
  completed++; renderBar('Container');

  // Iterate weapons & conditions
  for (const [weapon, skin] of skins) {
    for (const cond of conditions) {
      const entries = await lookupCondition(weapon, skin, cond);
      for (const [name, data] of entries) {
        if (data) {
          prices[name] = { success: true, price: data.sell_price_text, listings: data.sell_listings, volume: data.volume || '--' };
        } else {
          prices[name] = { success: false };
        }
        completed++; renderBar(name);
      }
    }
    // gentle pause between weapons
    await wait(2000);
  }

  // Fetch skin images from external CSGO‑API
  try {
    console.log('[CATALOG] Fetching skin catalog');
    const resp = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json', { signal: AbortSignal.timeout(15000) });
    if (resp.ok) {
      const catalog = await resp.json();
      for (const [weapon, skin] of skins) {
        const entry = catalog.find(e => e.name === `${weapon} | ${skin}`);
        if (entry?.image) skinCatalog[`${weapon} | ${skin}`] = entry.image;
      }
    }
  } catch (e) { console.log('[CATALOG] error', e.message); }

  // Write output files
  await mkdir('public', { recursive: true });
  prices._meta = { source: 'Steam Community Market', generatedAt, note: 'Prices are buyer‑facing sell_price_text values.' };
  await writeFile('public/prices.json', JSON.stringify(prices, null, 2) + '\n');
  await writeFile('public/skins.json', JSON.stringify(skinCatalog, null, 2) + '\n');

  const runtime = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`[SUMMARY] Completed in ${runtime}s – ${Object.keys(prices).length - 1} entries written`);

  // Clean up Playwright
  if (!_browserLaunchFailed) {
    try { const b = await getBrowser(); await b.close(); console.log('[PLAYWRIGHT] Browser closed'); } catch (e) { console.error(e); }
  }
})();

// Export utility functions for external use
export { getConditionPrices, shouldUsePlaywright, recordRateLimit, resetRateLimit };

