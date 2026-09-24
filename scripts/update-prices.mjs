import { mkdir, writeFile } from 'node:fs/promises'

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

async function steam(path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`https://steamcommunity.com${path}`, { signal: AbortSignal.timeout(15000) })
      if (response.status !== 429) return response
      const retryAfter = Number(response.headers.get('retry-after'))
      await wait(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1), 5000))
    } catch {
      if (attempt === 0) await wait(2000)
    }
  }
  return null
}

async function lookup(marketHashName, includeVolume = false) {
  try {
    const query = encodeURIComponent(marketHashName)
    const searchResponse = await steam(
      `/market/search/render/?query=${query}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1`,
    )
    if (!searchResponse?.ok) return { success: false }
    const search = await searchResponse.json()
    const exact = search.results?.find((item) => item.hash_name === marketHashName)
    if (!exact?.sell_price_text) return { success: false }

    let volume = '--'
    let price = exact.sell_price_text
    if (includeVolume) {
      const overviewResponse = await steam(`/market/priceoverview/?appid=730&currency=3&market_hash_name=${query}`)
      if (overviewResponse?.ok) {
        const overview = await overviewResponse.json()
        volume = overview.volume || '--'
        if (overview.lowest_price) price = overview.lowest_price
      }
    }
    return { success: true, price, listings: exact.sell_listings, volume }
  } catch {
    return { success: false }
  }
}

async function fetchEURPrice(marketHashName) {
  try {
    const query = encodeURIComponent(marketHashName)
    const response = await steam(`/market/priceoverview/?appid=730&currency=3&market_hash_name=${query}`)
    if (response?.ok) {
      const data = await response.json()
      return data.lowest_price || null
    }
  } catch {}
  return null
}

async function lookupCondition(weapon, skin, condition) {
  try {
    const baseName = `${weapon} | ${skin} (${condition})`
    const query = encodeURIComponent(baseName)
    const response = await steam(
      `/market/search/render/?query=${query}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1`,
    )
    if (!response?.ok) return [[baseName, null], [`StatTrak™ ${baseName}`, null]]
    const search = await response.json()
    const normal = search.results?.find((item) => item.hash_name === baseName)
    const stattrakName = `StatTrak™ ${baseName}`
    const stattrak = search.results?.find((item) => item.hash_name === stattrakName)
    // Fetch EUR prices for each item via priceoverview
    const [normalPrice, stattrakPrice] = await Promise.all([
      normal ? fetchEURPrice(normal.hash_name) : null,
      stattrak ? fetchEURPrice(stattrakName) : null,
    ])
    return [
      [baseName, normal ? { ...normal, sell_price_text: normalPrice } : null],
      [stattrakName, stattrak ? { ...stattrak, sell_price_text: stattrakPrice } : null],
    ]
  } catch {
    const baseName = `${weapon} | ${skin} (${condition})`
    return [[baseName, null], [`StatTrak™ ${baseName}`, null]]
  }
}

const prices = {}
const skinCatalog = {}
const generatedAt = new Date().toISOString()
const container = 'Sealed Genesis Terminal'
prices[container] = await lookup(container, true)
for (const [weapon, skin] of skins) {
  for (const condition of conditions) {
    console.log(`Fetching ${weapon} | ${skin} (${condition})`)
    for (const [marketHashName, result] of await lookupCondition(weapon, skin, condition)) {
      prices[marketHashName] = result?.sell_price_text
        ? { success: true, price: result.sell_price_text, listings: result.sell_listings, volume: '--' }
        : { success: false }
    }
    await wait(300)
  }
}

try {
  const catalogResponse = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json', { signal: AbortSignal.timeout(15000) })
  if (catalogResponse.ok) {
    const catalog = await catalogResponse.json()
    for (const [weapon, skin] of skins) {
      const item = catalog.find((entry) => entry.name === `${weapon} | ${skin}`)
      if (item?.image) skinCatalog[`${weapon} | ${skin}`] = item.image
    }
  }
} catch {
  console.log('Skin catalog unavailable; preserving the existing static catalog.')
}

await mkdir('public', { recursive: true })
prices._meta = {
  source: 'Steam Community Market search/render',
  generatedAt,
  note: 'Prices are exact buyer-facing sell_price_text values returned by Steam.',
}
await writeFile('public/prices.json', `${JSON.stringify(prices, null, 2)}\n`)
await writeFile('public/skins.json', `${JSON.stringify(skinCatalog, null, 2)}\n`)
console.log(`Wrote ${Object.keys(prices).length} Steam prices to public/prices.json`)
