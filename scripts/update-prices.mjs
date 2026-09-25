import { mkdir, writeFile, access, constants, unlink } from 'node:fs/promises'

// Lock file to prevent concurrent executions
const lockPath = 'public/.prices.lock'
try {
  // If lock file exists, another instance is running
  await access(lockPath, constants.F_OK)
  console.log('Another instance is already running. Exiting.')
  process.exit(0)
} catch {
  // No lock file, create one
  await writeFile(lockPath, String(Date.now()));
// Ensure lock file is removed on process exit or termination
process.on('exit', async () => {
  await unlink(lockPath).catch(() => {});
});
process.on('SIGINT', async () => {
  await unlink(lockPath).catch(() => {});
  process.exit(1);
});
process.on('SIGTERM', async () => {
  await unlink(lockPath).catch(() => {});
  process.exit(1);
});
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
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function steam(path) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
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
      `/market/search/render/?query=${query}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1&currency=3`,
    )
    if (!searchResponse?.ok) return { success: false }
    const search = await searchResponse.json()
    const exact = search.results?.find((item) => item.hash_name === marketHashName)
    if (!exact?.sell_price_text) return { success: false }
    // Convert USD price to EUR format if needed
    let price = exact.sell_price_text
    if (price.includes('$')) {
      price = price.replace('$', '€').replace('.', ',')
    }
    let volume = '--'
    let listings = exact.sell_listings
    if (includeVolume) {
      const overviewResponse = await steam(`/market/priceoverview/?appid=730&currency=3&market_hash_name=${query}`)
      if (overviewResponse?.ok) {
        const overview = await overviewResponse.json()
        volume = overview.volume || '--'
        if (overview.lowest_price) price = overview.lowest_price
      }
    }
    return { success: true, price, listings, volume }
  } catch {
    return { success: false }
  }
}

async function fetchVolume(marketHashName) {
  try {
    const query = encodeURIComponent(marketHashName)
    const response = await steam(`/market/priceoverview/?appid=730&currency=3&market_hash_name=${query}`)
    if (response?.ok) {
      const data = await response.json()
      return data.volume || '--'
    }
  } catch {}
  return '--'
}
async function fetchEURPrice(marketHashName) {
  try {
    const query = encodeURIComponent(marketHashName)
    const response = await steam(`/market/priceoverview/?appid=730&currency=3&market_hash_name=${query}`)
    if (response?.ok) {
      const data = await response.json()
      let price = data.lowest_price || null
      if (price && price.includes('$')) {
        price = price.replace('$', '€').replace('.', ',')
      }
      return price
    }
  } catch {}
  return null
}

async function lookupCondition(weapon, skin, condition) {
  try {
    const baseName = `${weapon} | ${skin} (${condition})`
    const query = encodeURIComponent(baseName)
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
    }
    // If search didn't find items, fall back to direct priceoverview fetch
    const [normalPrice, stattrakPrice] = await Promise.all([
      normal ? fetchEURPrice(normal.hash_name) : fetchEURPrice(baseName),
      stattrak ? fetchEURPrice(stattrak.hash_name) : fetchEURPrice(`StatTrak™ ${baseName}`),
    ])
    return [
      [baseName, normalPrice ? { sell_price_text: normalPrice, sell_listings: normal?.sell_listings, volume: await fetchVolume(baseName) } : null],
      [`StatTrak™ ${baseName}`, stattrakPrice ? { sell_price_text: stattrakPrice, sell_listings: stattrak?.sell_listings, volume: await fetchVolume(`StatTrak™ ${baseName}`) } : null],
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
        ? { success: true, price: result.sell_price_text, listings: result.sell_listings, volume: result.volume || '--' }
        : { success: false }
      console.log(`Fetched price for ${marketHashName}: ${result?.sell_price_text || 'unavailable'}`)
    }
    await wait(8000)
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
// Remove lock file after successful run
await unlink(lockPath).catch(() => {})
