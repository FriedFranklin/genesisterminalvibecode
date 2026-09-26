import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'



// Start timer for runtime measurement
const start = Date.now();

const conditions = [
  'Factory New',
  'Minimal Wear',
  'Field-Tested',
  'Well-Worn',
  'Battle-Scarred',
]
const skins = [
  ['AK-47', 'The Oligarch'], ['M4A4', 'Full Throttle'], ['AWP', 'Ice Coaled'], ['Glock-18', 'Mirror Mosaic'], ['MP7', 'Smoking Kills'],
  ['M4A1-S', 'Liquidation'], ['Dual Berettas', 'Angel Eyes'], ['UMP-45', 'Continuum'], ['MAC-10', 'Cat Fight'], ['Nova', 'Ocular'],
  ['AUG', 'Trigger Discipline'], ['P2000', 'Red Wing'], ['MP5-SD', 'Focus'], ['MP9', 'Broken Record'], ['MAG-7', 'MAGnitude'],
  ['P250', 'Bullfrog'], ['SCAR-20', 'Caged'],
]
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

// Default headers with rotating user agent
const defaultHeaders = {
  'User-Agent': getRandomUserAgent(),
  'Accept-Language': getRandomAcceptLanguage(),
  'Referer': 'https://steamcommunity.com/market/',
  'Accept': '*/*',
  'X-Requested-With': 'XMLHttpRequest',
};

// Randomly select an Accept-Language header to vary requests
function getRandomAcceptLanguage() {
  const langs = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.8',
    'de-DE,de;q=0.7',
    'fr-FR,fr;q=0.7',
    'es-ES,es;q=0.7',
  ];
  return langs[Math.floor(Math.random() * langs.length)];
}

async function steam(path, extraHeaders = {}) {
  const headers = { ...defaultHeaders, ...extraHeaders };
  console.log(`[API] Fetching: ${path}`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`https://steamcommunity.com${path}`, { ...headers, signal: AbortSignal.timeout(15000) });
      console.log(`[API] Response: ${response.status} ${response.statusText} for ${path}`);
      if (response.status !== 429) return response;
      const retryAfter = Number(response.headers.get('retry-after'));
      await wait(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1), 5000));
    } catch (err) {
      console.log(`[API] Error on attempt ${attempt + 1}/5 for ${path}: ${err.message}`);
      if (attempt === 0) await wait(2000);
    }
  }
  console.log(`[API] All attempts failed for ${path}`);
  return null;
}

// Generate a random User-Agent string from a pool
function getRandomUserAgent() {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}

async function lookup(marketHashName, includeVolume = false) {
  const query = encodeURIComponent(marketHashName);
  // Try a few currency options to avoid rate limiting / unavailable
  const currencyOptions = ['1', '3', '6']; // 1=USD, 3=EUR, 6=GBP (if supported)
  for (const cur of currencyOptions) {
    try {
      const path = `/market/priceoverview/?appid=730&currency=${cur}&market_hash_name=${query}`;
      const response = await steam(path);
      if (!response?.ok) continue;
      const data = await response.json();
      const price = data.lowest_price || data.price || '--';
      // Convert price if needed (e.g., if it's in USD)
      let formattedPrice = price;
      if (cur === '1' && formattedPrice.includes('$')) {
        formattedPrice = formattedPrice.replace('$', '€').replace('.', ',');
      }
      const volume = data.volume || '--';
      return {
        success: true,
        price: formattedPrice,
        listings: '--',
        volume,
      };
    } catch {
      continue;
    }
  }
  // Fallback: original search‑render method
  try {
    const searchResponse = await steam(
      `/market/search/render/?query=${query}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1&currency=3`,
    );
    if (!searchResponse?.ok) return { success: false };
    const search = await searchResponse.json();
    const exact = search.results?.find((item) => item.hash_name === marketHashName);
    if (!exact?.sell_price_text) return { success: false };
    let price = exact.sell_price_text;
    if (price.includes('$')) {
      price = price.replace('$', '€').replace('.', ',');
    }
    let volume = '--';
    let listings = exact.sell_listings;
    if (includeVolume) {
      const overviewResponse = await steam(
        `/market/priceoverview/?appid=730&currency=3&market_hash_name=${query}`
      );
      if (overviewResponse?.ok) {
        const overview = await overviewResponse.json();
        volume = overview.volume || '--';
        if (overview.lowest_price) price = overview.lowest_price;
      }
    }
    return {
      success: true,
      price,
      listings,
      volume,
    };
  } catch {
    return { success: false };
  }
}

async function fetchVolume(marketHashName) {
  const query = encodeURIComponent(marketHashName);
  console.log(`[VOLUME] Fetching volume for: ${marketHashName}`);
  // Re‑use the expanded currency list for volume lookup
  const currencyOptions = ['1', '3', '6', '2', '5', '7', '8'];
  for (const cur of currencyOptions) {
    try {
      const response = await steam(`/market/priceoverview/?appid=730&currency=${cur}&market_hash_name=${query}`);
      if (!response?.ok) continue;
      const data = await response.json();
      if (data.volume) {
        console.log(`[VOLUME] ✓ Found via priceoverview (currency=${cur}): ${data.volume}`);
        return data.volume;
      }
    } catch {}
  }
  // Fallback: scrape the HTML listing page for volume information
  try {
    const htmlResponse = await steam(`/market/listings/730/${query}`);
    if (htmlResponse?.ok) {
      const html = await htmlResponse.text();
      const match = html.match(/"volume"\s*:\s*"?(\d+)"?/i);
      if (match) {
        console.log(`[VOLUME] ✓ Found via HTML scrape: ${match[1]}`);
        return match[1];
      }
    }
  } catch {}
  console.log(`[VOLUME] ✗ No volume data found for: ${marketHashName}`);
  return '--';
}

async function fetchPrice(marketHashName) {
  const query = encodeURIComponent(marketHashName);
  // Expanded list of currency IDs to increase chance of success
  const currencyOptions = ['1', '3', '6', '2', '5', '7', '8']; // 1=USD, 3=EUR, 6=GBP, others are additional currencies supported by Steam
  console.log(`[PRICE] Fetching price for: ${marketHashName}`);
  // Try each currency with a few retries and exponential back‑off
  for (const cur of currencyOptions) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const path = `/market/priceoverview/?appid=730&currency=${cur}&market_hash_name=${query}`;
        const response = await steam(path);
        if (!response?.ok) {
          // If rate‑limited, wait a bit before retrying
          await wait(1000 * Math.pow(2, attempt));
          continue;
        }
        const data = await response.json();
        let price = data.lowest_price || data.price || null;
        if (price && cur === '1' && price.includes('$')) {
          // Convert USD to Euro‑style formatting
          price = price.replace('$', '€').replace('.', ',');
        }
        if (price) {
          console.log(`[PRICE] ✓ Found via priceoverview (currency=${cur}): ${price}`);
          return price;
        }
      } catch {
        // Network hiccup – wait before next attempt
        await wait(500 * Math.pow(2, attempt));
      }
    }
  }
  console.log(`[PRICE] priceoverview failed, trying HTML scrape fallback...`);
  // Fallback 1: use the search/render endpoint (already tried in lookupCondition) – try direct HTML scrape of the listing page
  try {
    const htmlResponse = await steam(`/market/listings/730/${query}`);
    if (htmlResponse?.ok) {
      const html = await htmlResponse.text();
      const priceMatch = html.match(/"sell_price_text"\s*:\s*"([^\"]+)"/i);
      if (priceMatch) {
        let price = priceMatch[1];
        if (price.includes('$')) price = price.replace('$', '€').replace('.', ',');
        console.log(`[PRICE] ✓ Found via HTML scrape: ${price}`);
        return price;
      }
    }
  } catch {}
  // Fallback 2: try the older priceoverview endpoint without currency (defaults to user locale)
  try {
    const response = await steam(`/market/priceoverview/?appid=730&market_hash_name=${query}`);
    if (response?.ok) {
      const data = await response.json();
      let price = data.lowest_price || data.price || null;
      if (price && price.includes('$')) price = price.replace('$', '€').replace('.', ',');
      if (price) {
        console.log(`[PRICE] ✓ Found via priceoverview (no currency): ${price}`);
        return price;
      }
    }
  } catch {}
  console.log(`[PRICE] All API methods failed, trying Playwright browser fallback...`);
  // Final fallback: Playwright browser scrape
  try {
    const pwPrice = await playwrightFallback(marketHashName);
    if (pwPrice) {
      console.log(`[PRICE] ✓ Found via Playwright browser: ${pwPrice}`);
      return pwPrice;
    }
  } catch (e) {
    console.error('[PRICE] Playwright fallback error:', e);
  }
  console.log(`[PRICE] ✗ All methods failed for: ${marketHashName}`);
  return null;
}

// Playwright fallback implementation – launches a headless browser only when needed
let _browserPromise = null;
let _pagePromise = null; // holds { context, page }
let _browserLaunchFailed = false;

async function getBrowser() {
  if (!_browserPromise && !_browserLaunchFailed) {
    console.log('[PLAYWRIGHT] Launching headless browser...');
    try {
      _browserPromise = chromium.launch({ headless: true });
      await _browserPromise; // Wait for launch to verify it works
    } catch (e) {
      console.log('[PLAYWRIGHT] Browser launch failed (not installed?):', e.message);
      _browserLaunchFailed = true;
      _browserPromise = null;
      throw e;
    }
  }
  if (_browserLaunchFailed) {
    throw new Error('Playwright browser not available');
  }
  return _browserPromise;
}

async function getPage() {
  if (!_pagePromise) {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    const page = await context.newPage();
    _pagePromise = { context, page };
  }
  return _pagePromise.page;
}

async function playwrightFallback(marketHashName) {
  if (_browserLaunchFailed) {
    console.log(`[PLAYWRIGHT] Skipping - browser not available`);
    return null;
  }
  console.log(`[PLAYWRIGHT] Attempting browser scrape for: ${marketHashName}`);
  try {
    const page = await getPage();
    const encoded = encodeURIComponent(marketHashName);
    const url = `https://steamcommunity.com/market/listings/730/${encoded}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(2000);
    const priceSelectors = [
      '#market_commodity_buyrequests .market_listing_price.market_listing_price_with_fee',
      '.market_listing_price.market_listing_price_with_fee',
      '#market_commodity_buyrequests span.market_listing_price',
      '.market_table_value .market_listing_price',
      '[id^="buyOrder"] .market_listing_price',
    ];
    for (const sel of priceSelectors) {
      const el = await page.$(sel);
      if (el) {
        const txt = await el.textContent();
        if (txt && txt.trim()) {
          console.log(`[PLAYWRIGHT] ✓ Found price via selector: ${sel}`);
          return txt.trim();
        }
      }
    }
    // As a last resort, try extracting from page script variables
    const scriptContent = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        if (s.textContent && (s.textContent.includes('market_commodity_buyrequests') || s.textContent.includes('g_rgAssets'))) {
          return s.textContent;
        }
      }
      return null;
    });
    if (scriptContent) {
      const match = scriptContent.match(/"price"\s*:\s*"([^\"]+)"/);
      if (match) {
        console.log(`[PLAYWRIGHT] ✓ Found price via script extraction`);
        return match[1];
      }
    }
  } catch (e) {
    if (e.message.includes('Executable doesn') || e.message.includes('browserType.launch')) {
      console.log('[PLAYWRIGHT] Browser not installed, disabling Playwright fallback');
      _browserLaunchFailed = true;
    } else {
      console.error('[PLAYWRIGHT] Error:', e.message);
    }
  }
  console.log(`[PLAYWRIGHT] ✗ Failed to find price for: ${marketHashName}`);
  return null;
}

async function lookupCondition(weapon, skin, condition) {
  try {
    const baseName = `${weapon} | ${skin} (${condition})`
    const query = encodeURIComponent(baseName)
    console.log(`[LOOKUP] Searching for: ${baseName}`);
    const response = await steam(
      `/market/search/render/?query=${query}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1&currency=3`,
    )
    let normal = null
    let stattrak = null
    if (response?.ok) {
      const search = await response.json()
      normal = search.results?.find((item) => item.hash_name === baseName)
      const stattrakName = `StatTrak™ ${baseName}`
      stattrak = search.results?.find((item) => item.hash_name === stattrakName)
      if (normal) console.log(`[LOOKUP] ✓ Found normal via search/render`);
      if (stattrak) console.log(`[LOOKUP] ✓ Found StatTrak via search/render`);
    } else {
      console.log(`[LOOKUP] search/render failed, will use direct price fetch`);
    }
    // If search didn't find items, fall back to direct priceoverview fetch
    const [normalPrice, stattrakPrice] = await Promise.all([
      normal ? fetchPrice(normal.hash_name) : fetchPrice(baseName),
      stattrak ? fetchPrice(stattrak.hash_name) : fetchPrice(`StatTrak™ ${baseName}`),
    ])
    return [
      [baseName, normalPrice ? { sell_price_text: normalPrice, sell_listings: normal?.sell_listings, volume: await fetchVolume(baseName) } : null],
      [`StatTrak™ ${baseName}`, stattrakPrice ? { sell_price_text: stattrakPrice, sell_listings: stattrak?.sell_listings, volume: await fetchVolume(`StatTrak™ ${baseName}`) } : null],
    ]
  } catch (err) {
    console.log(`[LOOKUP] ✗ Error for ${weapon} | ${skin} (${condition}): ${err.message}`);
    const baseName = `${weapon} | ${skin} (${condition})`
    return [[baseName, null], [`StatTrak™ ${baseName}`, null]]
  }
}

const prices = {}
const skinCatalog = {}
const generatedAt = new Date().toISOString()
const container = 'Sealed Genesis Terminal'

// Progress tracking
const totalWeapons = skins.length;
const conditionsPerWeapon = conditions.length;
const totalItems = 1 + (totalWeapons * conditionsPerWeapon * 2); // container + (weapons * conditions * normal+stattrak)
let completedItems = 0;

function renderProgressBar(label, current, total, width = 30) {
  const percent = total > 0 ? current / total : 0;
  const filled = Math.round(percent * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pct = (percent * 100).toFixed(1).padStart(5);
  return `[PROGRESS] ${label} [${bar}] ${pct}% (${current}/${total})`;
}

function logProgress(label) {
  completedItems++;
  console.log(renderProgressBar(label, completedItems, totalItems));
}

console.log(`[MAIN] Starting price fetch for container: ${container}`);
console.log(renderProgressBar('Initializing', 0, totalItems));
prices[container] = await lookup(container, true)
console.log(`[MAIN] Container price: ${prices[container]?.price || 'unavailable'}`);
logProgress('Container');

for (const [weapon, skin] of skins) {
  console.log(`[MAIN] Processing weapon: ${weapon} | ${skin}`);
  // Process all conditions in parallel for this weapon/skin
  const conditionPromises = conditions.map(async (condition) => {
    console.log(`[MAIN]   Fetching ${weapon} | ${skin} (${condition})`)
    const entries = await lookupCondition(weapon, skin, condition)
    for (const [marketHashName, result] of entries) {
      prices[marketHashName] = result?.sell_price_text
        ? { success: true, price: result.sell_price_text, listings: result.sell_listings, volume: result.volume || '--' }
        : { success: false }
      const status = result?.sell_price_text ? '✓' : '✗';
      console.log(`[MAIN]   ${status} ${marketHashName}: ${result?.sell_price_text || 'unavailable'}`)
      logProgress(marketHashName);
    }
  })
  await Promise.all(conditionPromises)
  // Small pause between weapons to be gentle on the API
  await wait(2000)
}

try {
  console.log('[CATALOG] Fetching skin catalog from CSGO-API...');
  const catalogResponse = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json', { signal: AbortSignal.timeout(15000) })
  if (catalogResponse.ok) {
    const catalog = await catalogResponse.json()
    let found = 0;
    for (const [weapon, skin] of skins) {
      const item = catalog.find((entry) => entry.name === `${weapon} | ${skin}`)
      if (item?.image) {
        skinCatalog[`${weapon} | ${skin}`] = item.image
        found++;
      }
    }
    console.log(`[CATALOG] ✓ Found ${found}/${skins.length} skin images`);
  } else {
    console.log('[CATALOG] ✗ Failed to fetch catalog (non-OK response)');
  }
} catch (err) {
  console.log(`[CATALOG] ✗ Error fetching catalog: ${err.message}`);
}

await mkdir('public', { recursive: true })
prices._meta = {
  source: 'Steam Community Market search/render',
  generatedAt,
  note: 'Prices are exact buyer-facing sell_price_text values returned by Steam.',
}
await writeFile('public/prices.json', `${JSON.stringify(prices, null, 2)}\n`)
await writeFile('public/skins.json', `${JSON.stringify(skinCatalog, null, 2)}\n`)

// Final progress bar
console.log(renderProgressBar('Complete', totalItems, totalItems));

// Summary statistics
const totalEntries = Object.keys(prices).length - 1; // exclude _meta
const successful = Object.values(prices).filter(v => v && v.success === true).length;
const unavailable = Object.values(prices).filter(v => v && v.success === false).length;
const runtime = ((Date.now() - start) / 1000).toFixed(2);

console.log(`[SUMMARY] ========================================`);
console.log(`[SUMMARY] Total entries: ${totalEntries}`);
console.log(`[SUMMARY] Successful: ${successful}`);
console.log(`[SUMMARY] Unavailable: ${unavailable}`);
console.log(`[SUMMARY] Success rate: ${((successful / totalEntries) * 100).toFixed(1)}%`);
console.log(`[SUMMARY] Total runtime: ${runtime}s`);
console.log(`[SUMMARY] Written to: public/prices.json, public/skins.json`);
console.log(`[SUMMARY] ========================================`);
