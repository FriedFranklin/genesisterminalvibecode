import { mkdir, writeFile } from 'node:fs/promises'

const conditions = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']
const skins = [
  ['AK-47', 'The Oligarch'], ['M4A4', 'Full Throttle'], ['AWP', 'Ice Coaled'], ['Glock-18', 'Mirror Mosaic'], ['MP7', 'Smoking Kills'],
  ['M4A1-S', 'Liquidation'], ['Dual Berettas', 'Angel Eyes'], ['UMP-45', 'Continuum'], ['MAC-10', 'Cat Fight'], ['Nova', 'Ocular'],
  ['AUG', 'Trigger Discipline'], ['P2000', 'Red Wing'], ['MP5-SD', 'Focus'], ['MP9', 'Broken Record'], ['MAG-7', 'MAGnitude'],
  ['P250', 'Bullfrog'], ['SCAR-20', 'Caged'],
]
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function steam(path) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://steamcommunity.com${path}`)
    if (response.status !== 429) return response
    await wait(2000 * (attempt + 1))
  }
  throw new Error('Steam rate limit')
}

async function lookup(marketHashName, includeVolume = false) {
  const query = encodeURIComponent(marketHashName)
  const searchResponse = await steam(`/market/search/render/?query=${query}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1`)
  const search = await searchResponse.json()
  const exact = search.results?.find((item) => item.hash_name === marketHashName)
  if (!exact?.sell_price_text) return { success: false }

  let volume = '--'
  if (includeVolume) {
    const overviewResponse = await steam(`/market/priceoverview/?appid=730&currency=1&market_hash_name=${query}`)
    const overview = await overviewResponse.json()
    volume = overview.volume || '--'
  }
  return { success: true, price: exact.sell_price_text, listings: exact.sell_listings, volume }
}

async function lookupCondition(weapon, skin, condition) {
  const baseName = `${weapon} | ${skin} (${condition})`
  const query = encodeURIComponent(baseName)
  const response = await steam(`/market/search/render/?query=${query}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1`)
  const search = await response.json()
  const normal = search.results?.find((item) => item.hash_name === baseName)
  const stattrakName = `StatTrak™ ${baseName}`
  const stattrak = search.results?.find((item) => item.hash_name === stattrakName)
  return [
    [baseName, normal],
    [stattrakName, stattrak],
  ]
}

const prices = {}
const skinCatalog = {}
const container = 'Sealed Genesis Terminal'
prices[container] = await lookup(container, true)
for (const [weapon, skin] of skins) {
  for (const condition of conditions) {
    for (const [marketHashName, result] of await lookupCondition(weapon, skin, condition)) {
      prices[marketHashName] = result?.sell_price_text
        ? { success: true, price: result.sell_price_text, listings: result.sell_listings, volume: '--' }
        : { success: false }
    }
    await wait(300)
  }
}

const catalogResponse = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json')
if (catalogResponse.ok) {
  const catalog = await catalogResponse.json()
  for (const [weapon, skin] of skins) {
    const item = catalog.find((entry) => entry.name === `${weapon} | ${skin}`)
    if (item?.image) skinCatalog[`${weapon} | ${skin}`] = item.image
  }
}

await mkdir('public', { recursive: true })
await writeFile('public/prices.json', `${JSON.stringify(prices, null, 2)}\n`)
await writeFile('public/skins.json', `${JSON.stringify(skinCatalog, null, 2)}\n`)
console.log(`Wrote ${Object.keys(prices).length} Steam prices to public/prices.json`)
