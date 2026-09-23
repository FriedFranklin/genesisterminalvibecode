import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Keep last 2880 price points per item (30 days at 15-min intervals)
const MAX_HISTORY_POINTS = 2880

/**
 * Merges new price data with existing history, preserving the longest history array.
 * @param {Object} existing - Existing price data with history
 * @param {Object} newData - New price data from scraper
 * @param {string} timestamp - ISO timestamp of the scrape
 * @returns {Object} Merged price data
 */
function mergePriceHistory(existing, newData, timestamp) {
  if (!newData?.success) return existing || { success: false }
  if (!existing?.success) return { ...newData, history: [{ price: newData.price, timestamp }] }

  const history = existing.history || []
  const price = newData.price
  const lastPrice = history[history.length - 1]?.price

  // Only add if price changed to reduce noise
  if (price !== lastPrice) {
    history.push({ price, timestamp })
    // Trim to max points (30 days at 15-min intervals)
    if (history.length > MAX_HISTORY_POINTS) history.shift()
  }

  return {
    ...newData,
    history,
    // Keep the original first-seen timestamp
    firstSeen: existing.firstSeen || timestamp,
  }
}

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

const container = 'Sealed Genesis Terminal'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Main scraping function that orchestrates the browser-based price collection.
 * Uses Playwright with realistic browser headers to avoid detection.
 */
async function scrapeWithBrowser() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  })

  // Add realistic browser headers to avoid bot detection
  await context.setExtraHTTPHeaders({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  })

  const page = await context.newPage()

  // Block unnecessary resources to speed up scraping
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType()
    if (['image', 'font', 'stylesheet', 'media'].includes(resourceType)) {
      route.abort()
    } else {
      route.continue()
    }
  })

  // Load existing prices to preserve history across runs
  let prices = {}
  try {
    const existing = await import('node:fs/promises').then(fs => fs.readFile('public/prices.json', 'utf8'))
    prices = JSON.parse(existing)
  } catch {
    // No existing file, start fresh
  }

  const generatedAt = new Date().toISOString()

  // Scrape container price
  const containerResult = await scrapeListing(page, container, true)
  prices[container] = mergePriceHistory(prices[container], containerResult, generatedAt)

  // Scrape each skin condition
  for (const [weapon, skin] of skins) {
    for (const condition of conditions) {
      const baseName = `${weapon} | ${skin} (${condition})`

      // Normal
      const normalResult = await scrapeListing(page, baseName, false)
      prices[baseName] = mergePriceHistory(prices[baseName], normalResult, generatedAt)

      // StatTrak
      const stattrakName = `StatTrak™ ${baseName}`
      const stattrakResult = await scrapeListing(page, stattrakName, false)
      prices[stattrakName] = mergePriceHistory(prices[stattrakName], stattrakResult, generatedAt)

      // Be respectful to Steam - wait between requests
      await wait(1500)
    }
  }

  // Scrape skin catalog images for weapon thumbnails
  const skinCatalog = {}
  try {
    const catalogResponse = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json', {
      signal: AbortSignal.timeout(15000),
    })
    if (catalogResponse.ok) {
      const catalog = await catalogResponse.json()
      for (const [weapon, skin] of skins) {
        const item = catalog.find((entry) => entry.name === `${weapon} | ${skin}`)
        if (item?.image) skinCatalog[`${weapon} | ${skin}`] = item.image
      }
    }
  } catch {
    // Skin catalog unavailable - thumbnails will use text initials
  }

  await browser.close()

  await mkdir('public', { recursive: true })
  prices._meta = {
    source: 'Steam Community Market (browser scrape)',
    generatedAt,
    note: 'Prices extracted from Steam listing pages via Playwright',
  }
  await writeFile('public/prices.json', `${JSON.stringify(prices, null, 2)}\n`)
  await writeFile('public/skins.json', `${JSON.stringify(skinCatalog, null, 2)}\n`)
}

async function scrapeListing(page, marketHashName, includeVolume) {
  const encoded = encodeURIComponent(marketHashName)
  const url = `https://steamcommunity.com/market/listings/730/${encoded}`

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await wait(2000) // Let JS render

    // Try to get price from the page - multiple selectors for resilience
    const priceSelectors = [
      '#market_commodity_buyrequests .market_listing_price.market_listing_price_with_fee',
      '.market_listing_price.market_listing_price_with_fee',
      '#market_commodity_buyrequests span.market_listing_price',
      '.market_table_value .market_listing_price',
      '[id^="buyOrder"] .market_listing_price',
    ]

    let price = null
    let listings = null

    for (const selector of priceSelectors) {
      const element = await page.$(selector)
      if (element) {
        const text = await element.textContent()
        if (text && text.includes('$')) {
          price = text.trim()
          break
        }
      }
    }

    // Get listings count
    const listingsSelectors = [
      '#market_commodity_buyrequests .market_listing_price_listings_count',
      '.market_listing_price_listings_count',
      '#market_commodity_forsale .market_listing_price_listings_count',
    ]

    for (const selector of listingsSelectors) {
      const element = await page.$(selector)
      if (element) {
        const text = await element.textContent()
        if (text && text.trim()) {
          listings = text.trim().replace(/[(),]/g, '')
          break
        }
      }
    }

    // Fallback: try to get from market_commodity_buyrequests JavaScript variable
    if (!price) {
      try {
        const scriptContent = await page.evaluate(() => {
          const scripts = document.querySelectorAll('script')
          for (const script of scripts) {
            if (script.textContent.includes('market_commodity_buyrequests') || script.textContent.includes('g_rgAssets')) {
              return script.textContent
            }
          }
          return null
        })
        if (scriptContent) {
          // Try to extract price from JS
          const priceMatch = scriptContent.match(/"price"\s*:\s*"([^"]+)"/)
          if (priceMatch) price = priceMatch[1]
        }
      } catch {
        // Ignore
      }
    }

    // Fallback: use search/render API from browser context (has cookies)
    if (!price) {
      try {
        const apiUrl = `https://steamcommunity.com/market/search/render/?query=${encoded}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1`
        const response = await page.request.get(apiUrl)
        if (response.ok()) {
          const data = await response.json()
          const exact = data.results?.find((item) => item.hash_name === marketHashName)
          if (exact?.sell_price_text) {
            price = exact.sell_price_text
            listings = exact.sell_listings
          }
        }
      } catch {
        // Ignore
      }
    }

    let volume = '--'
    if (includeVolume && price) {
      try {
        const overviewUrl = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encoded}`
        const response = await page.request.get(overviewUrl)
        if (response.ok()) {
          const data = await response.json()
          volume = data.volume || '--'
        }
      } catch {
        // Ignore
      }
    }

    if (price) {
      return { success: true, price, listings: listings || 'Unavailable', volume }
    }

    return { success: false }
  } catch (error) {
    console.error(`Error scraping ${marketHashName}:`, error.message)
    return { success: false }
  }
}

scrapeWithBrowser().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})