import './retro.css'

const marketHashName = 'Sealed Genesis Terminal'
const steamListingUrl = (marketName) => `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`
const weapons = [
  ['AK-47', 'The Oligarch', 'Covert'],
  ['M4A4', 'Full Throttle', 'Covert'],
  ['AWP', 'Ice Coaled', 'Classified'],
  ['Glock-18', 'Mirror Mosaic', 'Classified'],
  ['MP7', 'Smoking Kills', 'Classified'],
  ['M4A1-S', 'Liquidation', 'Restricted'],
  ['Dual Berettas', 'Angel Eyes', 'Restricted'],
  ['UMP-45', 'Continuum', 'Restricted'],
  ['MAC-10', 'Cat Fight', 'Restricted'],
  ['Nova', 'Ocular', 'Restricted'],
  ['AUG', 'Trigger Discipline', 'Mil-Spec'],
  ['P2000', 'Red Wing', 'Mil-Spec'],
  ['MP5-SD', 'Focus', 'Mil-Spec'],
  ['MP9', 'Broken Record', 'Mil-Spec'],
  ['MAG-7', 'MAGnitude', 'Mil-Spec'],
  ['P250', 'Bullfrog', 'Mil-Spec'],
  ['SCAR-20', 'Caged', 'Mil-Spec'],
]
const skinArtwork = []
const app = document.querySelector('#app')
const cacheKey = 'dropwatch-steam-prices-v1'
const cacheTtl = 60 * 1000
let refreshTimer
let marketRefreshInFlight = false
let conditionRefreshInFlight = false
let staticPricesPromise

document.body.insertAdjacentHTML('beforeend', '<div id="price-cache-status">Prices have not been fetched yet</div>')

function readPriceCache() {
  try {
    return JSON.parse(localStorage.getItem(cacheKey) || '{}')
  } catch {
    return {}
  }
}

function writePriceCache(cache) {
  localStorage.setItem(cacheKey, JSON.stringify(cache))
}

function getCachedPrice(key) {
  const entry = readPriceCache()[key]
  return entry && Date.now() - entry.savedAt < cacheTtl ? entry : null
}

function saveCachedPrice(key, value) {
  const cache = readPriceCache()
  cache[key] = { value, savedAt: Date.now() }
  writePriceCache(cache)
  updateCacheStatus(cache[key].savedAt)
}

function updateCacheStatus(timestamp = Math.max(0, ...Object.values(readPriceCache()).map((entry) => entry.savedAt || 0))) {
  const status = document.querySelector('#price-cache-status')
  if (status && timestamp) status.textContent = `Steam Community Market · fetched ${new Date(timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}`
}

function startAutoRefresh(callback) {
  clearInterval(refreshTimer)
  refreshTimer = setInterval(callback, 1000)
}

async function getMarketPrice(marketName) {
  try {
    const response = await fetch(`/api/market-price?market_hash_name=${encodeURIComponent(marketName)}`)
    if (response.ok) {
      const value = await response.json()
      if (value.success) return value
    }
  } catch {
    // GitHub Pages has no server API, so use the generated snapshot below.
  }
  staticPricesPromise ||= fetch(`${import.meta.env.BASE_URL}prices.json`).then((response) => response.ok ? response.json() : {})
  const snapshot = await staticPricesPromise
  const value = snapshot[marketName] || { success: false }
  if (value.success && snapshot._meta?.generatedAt) value.fetchedAt = snapshot._meta.generatedAt
  return value
}

app.innerHTML = `
  <main class="overview">
    <header class="header"><a class="brand" href="/">DROP<span>WATCH</span></a><nav><a href="#price">Market</a><a href="#weapons">Weapon pool</a><a href="https://steamcommunity.com/market/listings/730/Sealed%20Genesis%20Terminal" target="_blank" rel="noreferrer">Steam ↗</a></nav></header>
    <section class="hero"><div><p class="eyebrow">COUNTER-STRIKE 2 &gt; CONTAINER</p><h1>Genesis Terminal</h1><p class="lede">Steam Community Market overview</p></div><div class="online"><i></i><span id="connection-label">Connecting to Steam Market</span></div></section>
    <section class="market-card" id="price" aria-live="polite"><div class="card-top"><span>GENESIS TERMINAL / CURRENT MARKET PRICE</span><span id="updated">Fetching...</span></div><div class="price-block"><span class="currency">USD</span><strong id="price-value">--</strong><span>lowest current listing</span></div><div class="metrics"><div><span>Active listings</span><strong id="listings">--</strong></div><div><span>24h sales</span><strong id="volume">--</strong></div><div><span>Lowest price</span><strong id="lowest">--</strong></div></div><div class="card-footer"><span id="message">Prices load directly from Steam when available.</span><button id="refresh" type="button">Refresh price</button></div></section>
    <section class="weapons" id="weapons"><div class="section-title"><h2>Weapons you can get</h2><span>17 skins in the Genesis Terminal</span></div><div class="weapon-row">${weapons.map(([weapon, skin, rarity], index) => `<a class="weapon" href="#skin=${index}"><span class="weapon-image weapon-${index}"><img data-skin="${index}" alt="${weapon} | ${skin}" loading="lazy"><b>${weapon.slice(0, 2)}</b></span><strong>${weapon}</strong><small>${skin}</small><em>${rarity}</em></a>`).join('')}</div><p class="note">Weapon pool from the Genesis Terminal. Click a skin to view live prices by condition.</p></section>
    <footer>Dropwatch 2004-style market board <span>Last request: <b id="footer-time">--</b></span></footer>
  </main>
`

async function loadMarketPrice(force = false) {
  const price = document.querySelector('#price-value')
  const lowest = document.querySelector('#lowest')
  const listings = document.querySelector('#listings')
  const volume = document.querySelector('#volume')
  const updated = document.querySelector('#updated')
  const message = document.querySelector('#message')
  const connection = document.querySelector('#connection-label')
  const refresh = document.querySelector('#refresh')

  const cached = getCachedPrice(`overview:${marketHashName}`)
  if (cached && !force) renderMarketPrice(cached.value, true)
  if (cached && !force) return
  if (marketRefreshInFlight) return
  marketRefreshInFlight = true
  refresh.disabled = true
  connection.textContent = 'Connecting to Steam Market'
  updated.textContent = 'Fetching current listing...'
  message.textContent = 'Requesting the latest market snapshot.'
  try {
    const value = await getMarketPrice(marketHashName)
    if (!value.success) throw new Error('Item was not found in the Steam Market')
    value.listings = value.listings?.toLocaleString() || 'Unavailable'
    saveCachedPrice(`overview:${marketHashName}`, value)
    renderMarketPrice(value)
  } catch {
    price.textContent = 'Unavailable'
    lowest.textContent = 'Unavailable'
    listings.textContent = 'Unavailable'
    volume.textContent = 'Unavailable'
    updated.textContent = 'Unable to fetch current listing'
    connection.textContent = 'Steam Market unavailable'
    message.textContent = 'Steam may be rate-limiting requests. Try refreshing in a moment.'
    showSteamFallback(marketHashName, message)

  function showSteamFallback(marketName, target) {
    if (!target || target.querySelector('.steam-fallback')) return
    target.insertAdjacentHTML('beforeend', ` <a class="steam-fallback" href="${steamListingUrl(marketName)}" target="_blank" rel="noreferrer">Open official Steam listing ↗</a>`)
  }
  } finally {
    marketRefreshInFlight = false
    refresh.disabled = false
  }
}

function renderMarketPrice(value, cached = false) {
  document.querySelector('#price-value').textContent = value.price
  document.querySelector('#lowest').textContent = value.price
  document.querySelector('#listings').textContent = value.listings
  document.querySelector('#volume').textContent = value.volume
  const fetchedAt = value.fetchedAt ? new Date(value.fetchedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' }) : new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })
  document.querySelector('#updated').textContent = cached ? `Snapshot from ${fetchedAt}` : `Fetched ${fetchedAt}`
  document.querySelector('#footer-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  document.querySelector('#connection-label').textContent = cached ? 'Cached Steam Market data' : 'Live from Steam Market'
  document.querySelector('#message').textContent = cached ? 'Cached price is less than 60 seconds old.' : 'Values reflect Steam Community Market listings.'
}

async function loadSkinImages() {
  try {
    let response = await fetch('/skin-catalog/skins.json')
    if (!response.ok) response = await fetch(`${import.meta.env.BASE_URL}skins.json`)
    if (!response.ok) throw new Error('Skin catalog unavailable')
    let catalog = await response.json()
    if (!Array.isArray(catalog) && Object.keys(catalog).length === 0) {
      const remoteResponse = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json')
      if (remoteResponse.ok) catalog = await remoteResponse.json()
    }
    weapons.forEach(([weapon, skin], index) => {
      const name = `${weapon} | ${skin}`
      const artwork = Array.isArray(catalog) ? catalog.find((item) => item.name === name)?.image : catalog[name]
      if (!artwork) return
      skinArtwork[index] = artwork
      const image = document.querySelector(`[data-skin="${index}"]`)
      image.src = artwork
      image.onload = () => image.nextElementSibling.hidden = true
    })
  } catch {
    // The text fallback remains visible when the image catalog is unavailable.
  }
}

const conditions = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']
const overviewMarkup = app.innerHTML

function bindOverview() {
  document.querySelector('#refresh').addEventListener('click', loadMarketPrice)
  loadMarketPrice()
  updateCacheStatus()
  startAutoRefresh(loadMarketPrice)
  loadSkinImages()
  document.querySelectorAll('.weapon').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault()
    window.location.hash = link.getAttribute('href').slice(1)
  }))
}

function renderSkinDetail(index) {
  const [weapon, skin, rarity] = weapons[index]
  const displayName = `${weapon} | ${skin}`
  app.innerHTML = `
    <main class="overview detail-page">
      <header class="header"><a class="brand" href="#">DROP<span>WATCH</span></a><nav><a href="#">Market</a><a href="#">Weapon pool</a><a href="https://steamcommunity.com/market/search?q=${encodeURIComponent(displayName)}&appid=730" target="_blank" rel="noreferrer">Steam ↗</a></nav></header>
      <div class="market-crumb"><a href="#">Community Market</a> &gt; Genesis Terminal &gt; ${displayName}</div>
      <section class="item-overview">
        <div class="item-art-panel"><div class="item-art-large weapon-image"><img src="${skinArtwork[index] || ''}" alt="${displayName}"><b>${weapon.slice(0, 2)}</b></div><span class="art-caption">Counter-Strike 2</span></div>
        <div class="item-summary"><p class="eyebrow">GENESIS TERMINAL / ${rarity.toUpperCase()}</p><h1>${displayName}</h1><p class="item-description">A weapon skin from the Genesis Terminal collection.</p><div class="detail-lowest"><span>Lowest listing across all conditions</span><strong id="detail-lowest">Loading...</strong></div><div class="item-tags"><span>Normal quality</span><span>CS2</span><span>${rarity}</span></div><div class="item-actions"><a class="steam-button" href="https://steamcommunity.com/market/search?q=${encodeURIComponent(displayName)}&appid=730" target="_blank" rel="noreferrer">View on Steam Market ↗</a><a href="#" class="return-link">← Back to collection</a></div></div>
      </section>
      <section class="condition-card"><div class="card-top"><span>LISTINGS FOR ${displayName.toUpperCase()}</span><span id="detail-status">Fetching...</span></div><div class="condition-intro"><strong>Price by condition</strong><span>Lowest listing / USD</span></div><div class="condition-grid">${conditions.map((condition, row) => `<article class="condition-column" data-condition="${row}"><header><strong>${condition}</strong><small>${row === 0 ? 'Cleanest finish' : row === 4 ? 'Heavy wear' : 'Wear condition'}</small></header><div class="condition-offer"><span>Normal</span><strong class="normal-price">Loading...</strong><a class="normal-link" target="_blank" rel="noreferrer">Steam ↗</a></div><div class="condition-offer stattrak-offer"><span>StatTrak™</span><strong class="stattrak-price">Loading...</strong><a class="stattrak-link" target="_blank" rel="noreferrer">Steam ↗</a></div></article>`).join('')}</div><div class="card-footer"><span id="detail-source">Source: Steam Community Market · buyer-facing sell price</span><a href="https://steamcommunity.com/market/search?q=${encodeURIComponent(displayName)}&appid=730" target="_blank" rel="noreferrer">View all listings</a></div></section>
      <footer>Dropwatch 2004-style market board <span>${displayName}</span></footer>
    </main>`
  document.querySelector('.return-link').addEventListener('click', (event) => { event.preventDefault(); window.location.hash = '' })
  loadConditionPrices(displayName)
  updateCacheStatus()
  startAutoRefresh(() => loadConditionPrices(displayName))
}

async function loadConditionPrices(displayName, force = false) {
  if (conditionRefreshInFlight) return
  conditionRefreshInFlight = true
  const columns = [...document.querySelectorAll('.condition-column')]
  const prices = []
  for (const [index, condition] of conditions.entries()) {
    const column = columns[index]
    const normalName = `${displayName} (${condition})`
    const stattrakName = `StatTrak™ ${displayName} (${condition})`
    column.querySelector('.normal-link').href = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(normalName)}`
    column.querySelector('.stattrak-link').href = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(stattrakName)}`
    const fetchPrice = async (marketName) => {
      const cached = getCachedPrice(`skin:${marketName}`)
      if (cached && !force) return cached.value
      try {
        const data = await getMarketPrice(marketName)
        if (data.success && data.price) {
          saveCachedPrice(`skin:${marketName}`, data.price)
          return data.price
        }
        return 'Unavailable'
      } catch {
        return 'Unavailable'
      }
    }
    const normalPrice = await fetchPrice(normalName)
    const stattrakPrice = await fetchPrice(stattrakName)
    column.querySelector('.normal-price').textContent = normalPrice
    column.querySelector('.stattrak-price').textContent = stattrakPrice
    ;[normalPrice, stattrakPrice].forEach((value) => {
      const numeric = Number.parseFloat(value.replace('$', ''))
      if (Number.isFinite(numeric)) prices.push(numeric)
    })
  }
  document.querySelector('#detail-lowest').textContent = prices.length ? `$${Math.min(...prices).toFixed(2)}` : 'Unavailable'
  const fetchedAt = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })
  document.querySelector('#detail-status').textContent = `Fetched ${fetchedAt}`
  document.querySelector('#detail-source').textContent = `Source: Steam Community Market · buyer-facing sell price · ${fetchedAt}`
  updateCacheStatus()
  conditionRefreshInFlight = false
  if (!prices.length) {
    const source = document.querySelector('#detail-source')
    source.textContent = 'No cached price found. Open the official Steam listing to view current data.'
    showSteamFallback(displayName, source)
  }
}

function route() {
  clearInterval(refreshTimer)
  const match = window.location.hash.match(/^#skin=(\d+)$/)
  if (match && weapons[Number(match[1])]) renderSkinDetail(Number(match[1]))
  else {
    app.innerHTML = overviewMarkup
    bindOverview()
  }
}

window.addEventListener('hashchange', route)
route()
