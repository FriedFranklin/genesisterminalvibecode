import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// List of weapons and skins (same as in update-prices.mjs)
const weapons = [
  ['AK-47', 'The Oligarch'],
  ['M4A4', 'Full Throttle'],
  ['AWP', 'Ice Coaled'],
  ['Glock-18', 'Mirror Mosaic'],
  ['MP7', 'Smoking Kills'],
  ['M4A1-S', 'Liquidation'],
  ['Dual Berettas', 'Angel Eyes'],
  ['UMP-45', 'Continuum'],
  ['MAC-10', 'Cat Fight'],
  ['Nova', 'Ocular'],
  ['AUG', 'Trigger Discipline'],
  ['P2000', 'Red Wing'],
  ['MP5-SD', 'Focus'],
  ['MP9', 'Broken Record'],
  ['MAG-7', 'MAGnitude'],
  ['P250', 'Bullfrog'],
  ['SCAR-20', 'Caged'],
];
const conditions = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
const caseName = 'Sealed Genesis Terminal';

let _browserInstance = null;
let _browserLaunchFailed = false;

async function getBrowser() {
  if (!_browserInstance && !_browserLaunchFailed) {
    try {
      _browserInstance = await chromium.launch({ headless: true });
    } catch (e) {
      console.log('[PLAYWRIGHT] Launch failed:', e.message);
      _browserLaunchFailed = true;
      throw e;
    }
  }
  if (_browserLaunchFailed) throw new Error('Playwright not available');
  return _browserInstance;
}

async function getBrowserContext() {
  const browser = await getBrowser();
  // Use realistic headers to avoid Steam blocking the request
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const acceptLanguage = 'en-US,en;q=0.9';
  return await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept': '*/*',
      'Accept-Language': acceptLanguage,
      'Referer': 'https://steamcommunity.com/market/',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
}

// Helper to validate a market URL; if it fails, use a known working hard‑coded URL
async function getValidUrl(itemName) {
  const baseUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(itemName)}`;
  try {
    const headResp = await fetch(baseUrl, { method: 'HEAD' });
    if (headResp.ok) {
      console.log('URL OK:', baseUrl);
      return baseUrl;
    }
    console.warn('URL HEAD not ok, falling back for', itemName);
  } catch (e) {
    console.warn('HEAD request failed for', itemName, e);
  }
  // Fallback to a known good URL (example for AK‑47 | The Oligarch)
  console.log('Using fallback URL for', itemName);
  return 'https://steamcommunity.com/market/listings/730/G180720C80A3004';
}

// Re‑use the helper from update‑prices.mjs to extract condition maps
async function getConditionPrices(weaponSkin) {
  // First try Steam priceoverview API
  try {
    const apiUrl = `https://steamcommunity.com/market/priceoverview/?currency=1&appid=730&market_hash_name=${encodeURIComponent(weaponSkin)}`;
    const resp = await fetch(apiUrl);
    const data = await resp.json();
    const map = {};
    if (data && data.lowest_price) {
      conditions.forEach(cond => {
        map[cond] = data.lowest_price;
      });
      return map;
    }
  } catch (e) {
    console.error('Priceoverview API error for', weaponSkin, e);
  }
  // Fallback: use Playwright to scrape the price from the market page
  const browser = await getBrowser();
  const context = await getBrowserContext();
  const page = await context.newPage();
  const url = await getValidUrl(weaponSkin);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.error('Navigation error for', weaponSkin, e);
  }
  // Try to extract a price element (e.g., the main price header)
  let priceText = null;
  try {
    priceText = await page.$eval('.market_commodity_orders_header_price', el => el.textContent.trim());
  } catch (e) {
    // ignore if not found
  }
  await page.close();
  await context.close();
  const map = {};
  if (!priceText) {
    console.warn('Price not found for', weaponSkin, '- using placeholder');
    priceText = '--';
  }
  conditions.forEach(cond => {
    map[cond] = priceText;
  });
  return map;
}

async function fetchCasePrice() {
  const browser = await getBrowser();
  const context = await getBrowserContext();
  const page = await context.newPage();
  // Use validated URL with fallback
  const url = await getValidUrl(caseName);
  console.log('Fetching case price from', url);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.error('Navigation error for case', caseName, e);
  }
  // Try to extract price from script data
  const price = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const s of scripts) {
      const txt = s.textContent;
      if (txt && txt.includes('sell_price_text')) {
        const m = txt.match(/"sell_price_text"\s*:\s*"([^\"]+)"/);
        if (m) return m[1];
      }
    }
    // Fallback to common selector
    const el = document.querySelector('.market_commodity_orders_header .market_commodity_orders_header_price');
    return el ? el.textContent.trim() : null;
  });
  await page.close();
  await context.close();
  return price || '--';
}

(async () => {
  try {
    const casePrice = await fetchCasePrice();
    const result = { case: casePrice, weapons: {} };
    for (const [weapon, skin] of weapons) {
      const base = `${weapon} | ${skin}`;
      const stat = `StatTrak™ ${base}`;
      const normalMap = await getConditionPrices(base);
      console.log('Fetched normal map for', base, 'entries:', Object.keys(normalMap).length);
      const statMap = await getConditionPrices(stat);
      console.log('Fetched stattrak map for', stat, 'entries:', Object.keys(statMap).length);
      result.weapons[base] = normalMap;
      result.weapons[stat] = statMap;
    }
    await mkdir('public', { recursive: true });
    await writeFile('public/prices.json', JSON.stringify(result, null, 2), 'utf8');
    console.log('Prices written to public/prices.json');
    // Close the shared browser instance to allow the process to exit cleanly
    if (_browserInstance) {
      await _browserInstance.close();
      _browserInstance = null;
    }
    // Explicitly exit the process to ensure no lingering handles keep it alive
    process.exit(0);
  } catch (e) {
    console.error('Error fetching prices:', e);
    process.exit(1);
  }
})();
