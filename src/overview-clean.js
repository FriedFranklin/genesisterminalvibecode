import './retro.css'

const MARKET_HASH_NAME = 'Sealed Genesis Terminal'
const CACHE_KEY = 'dropwatch-steam-prices-v1'
const CACHE_TTL = 60 * 1000
const CONDITIONS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']
const WEAPONS = [
  ['AK-47', 'The Oligarch', 'Covert'], ['M4A4', 'Full Throttle', 'Covert'], ['AWP', 'Ice Coaled', 'Classified'],
  ['Glock-18', 'Mirror Mosaic', 'Classified'], ['MP7', 'Smoking Kills', 'Classified'], ['M4A1-S', 'Liquidation', 'Restricted'],
  ['Dual Berettas', 'Angel Eyes', 'Restricted'], ['UMP-45', 'Continuum', 'Restricted'], ['MAC-10', 'Cat Fight', 'Restricted'],
  ['Nova', 'Ocular', 'Restricted'], ['AUG', 'Trigger Discipline', 'Mil-Spec'], ['P2000', 'Red Wing', 'Mil-Spec'],
  ['MP5-SD', 'Focus', 'Mil-Spec'], ['MP9', 'Broken Record', 'Mil-Spec'], ['MAG-7', 'MAGnitude', 'Mil-Spec'],
  ['P250', 'Bullfrog', 'Mil-Spec'], ['SCAR-20', 'Caged', 'Mil-Spec'],
]

const app = document.querySelector('#app')
const artwork = []
let refreshTimer
let staticPricesPromise
let marketRequestActive = false
let conditionRequestActive = false

/**
 * Application entry point - reads hash route and renders appropriate view
 */
function route() {

/**
 * Renders a price history sparkline on a canvas element.
 * @param {HTMLCanvasElement} canvas - The canvas to draw on
 * @param {Array<{price: string, timestamp: string}>} history - Price history array
 * @param {string} color - Line color (default: #1c3956)
 */
function renderSparkline(canvas, history, color = '#1c3956') {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width = canvas.offsetWidth * dpr
  const height = canvas.height = canvas.offsetHeight * dpr
  ctx.scale(dpr, dpr)
  const cssWidth = canvas.offsetWidth
  const cssHeight = canvas.offsetHeight

  if (!history || history.length === 0) return

  // Parse prices from history
  const prices = history
    .map(h => parseFloat(h.price.replace('$', '')))
    .filter(p => !isNaN(p))

  if (prices.length === 0) return

  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const range = maxPrice - minPrice || 1

  // Draw background
  ctx.fillStyle = '#f7fafc'
  ctx.fillRect(0, 0, cssWidth, cssHeight)

  if (prices.length === 1) {
    // Draw single point as a dot
    const x = cssWidth / 2
    const y = cssHeight / 2
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Draw line for 2+ points
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    prices.forEach((price, i) => {
      const x = (i / (prices.length - 1)) * cssWidth
      const y = cssHeight - ((price - minPrice) / range) * (cssHeight - 8) - 4
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Draw last point
    const lastX = cssWidth - 4
    const lastY = cssHeight - ((prices[prices.length - 1] - minPrice) / range) * (cssHeight - 8) - 4
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

const steamUrl = (name) => `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`
const now = () => new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })

/**
 * Shared browser cache. GitHub Pages falls back to the generated prices.json snapshot.
 * @returns {Object} Parsed cache entries from localStorage
 */
function cacheEntries() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

/**
 * Get a cached entry if it exists and is not expired
 * @param {string} key - Cache key
 * @returns {Object|null} Cached entry or null if missing/expired
 */
function cached(key) {
  const entry = cacheEntries()[key]
  return entry && Date.now() - entry.savedAt < CACHE_TTL ? entry : null
}

/**
 * Store a value in cache with current timestamp
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 */
function cache(key, value) {
  const entries = cacheEntries()
  entries[key] = { value, savedAt: Date.now() }
  localStorage.setItem(CACHE_KEY, JSON.stringify(entries))
  updateCacheStatus(entries[key].savedAt)
}

/**
 * Update the cache status display in the footer
 * @param {number} [timestamp] - Unix timestamp to display (defaults to most recent cache entry)
 */
function updateCacheStatus(timestamp = Math.max(0, ...Object.values(cacheEntries()).map((entry) => entry.savedAt || 0))) {
  const node = document.querySelector('#price-cache-status')
  if (node && timestamp) node.textContent = `Steam Community Market · fetched ${new Date(timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}`
}

/**
 * Begin a periodic refresh loop
 * @param {Function} callback - Function to call on each interval
 */
function beginRefreshLoop(callback) {
  clearInterval(refreshTimer)
  refreshTimer = setInterval(callback, 1000)
}

/**
 * Gets price data for a market hash name from the shared snapshot
 * @param {string} name - Steam market hash name
 * @returns {Promise<Object>} Price data object with success flag
 */
async function getPrice(name) {
  staticPricesPromise ||= fetch(`${import.meta.env.BASE_URL}prices.json`, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))
  const snapshot = await staticPricesPromise
  const snapshotValue = snapshot[name]
  if (snapshotValue?.success) {
    if (snapshot._meta?.generatedAt) snapshotValue.fetchedAt = snapshot._meta.generatedAt
    return snapshotValue
  }

  return { success: false }
}



function renderOverview() {
  app.innerHTML = `<main class="overview">
    <header class="header"><a class="brand" href="/">DROP<span>WATCH</span></a><nav><a href="#price">Market</a><a href="#weapons">Weapon pool</a><a href="${steamUrl(MARKET_HASH_NAME)}" target="_blank" rel="noreferrer">Steam ↗</a></nav></header>
    <section class="hero"><div><p class="eyebrow">COUNTER-STRIKE 2 &gt; CONTAINER</p><h1>Genesis Terminal</h1><p class="lede">Steam Community Market overview</p></div><div class="online"><i></i><span id="connection-label">Connecting to Steam Market</span></div></section>
    <section class="market-card" id="price" aria-live="polite"><div class="card-top"><span>GENESIS TERMINAL / CURRENT MARKET PRICE</span><span id="updated">Fetching...</span></div><div class="price-block"><span class="currency">USD</span><strong id="price-value">--</strong><span>lowest current listing</span></div><div class="metrics"><div><span>Active listings</span><strong id="listings">--</strong></div><div><span>24h sales</span><strong id="volume">--</strong></div><div><span>Lowest price</span><strong id="lowest">--</strong></div></div><div class="card-footer"><span id="message">Prices load from the shared Steam snapshot when available.</span><button id="refresh" type="button">Refresh price</button></div></section>
    <section class="weapons" id="weapons"><div class="section-title"><h2>Weapons you can get</h2><span>17 skins in the Genesis Terminal</span></div><div class="weapon-row">${WEAPONS.map(([weapon, skin, rarity], index) => `<a class="weapon" href="#skin=${index}"><span class="weapon-image weapon-${index}"><img data-skin="${index}" alt="${weapon} | ${skin}" loading="lazy"><b>${weapon.slice(0, 2)}</b></span><strong>${weapon}</strong><small>${skin}</small><em>${rarity}</em><canvas class="history-graph" data-skin-index="${index}" width="142" height="36"></canvas></a>`).join('')}</div><p class="note">Click a skin to view live prices by condition.</p></section>
    <footer>Dropwatch 2004-style market board <span>Last request: <b id="footer-time">--</b></span></footer>
  </main>`
  document.body.insertAdjacentHTML('beforeend', '<div id="price-cache-status">Prices have not been fetched yet</div>')
  bindOverview()
}

function bindOverview() {
  document.querySelector('#refresh').addEventListener('click', () => loadOverviewPrice(true))
  document.querySelectorAll('.weapon').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault()
    window.location.hash = link.getAttribute('href').slice(1)
  }))
  loadOverviewPrice()
  loadArtwork()
  updateCacheStatus()
  beginRefreshLoop(loadOverviewPrice)
}

/**
 * Loads the overview price for the Genesis Terminal container
 * @param {boolean} [force] - If true, bypasses cache and fetches fresh data
 */
async function loadOverviewPrice(force = false) {
  const key = `overview:${MARKET_HASH_NAME}`
  const saved = cached(key)
  if (saved && !force) return showOverviewPrice(saved.value, true)
  if (marketRequestActive) return
  marketRequestActive = true
  const refreshBtn = document.querySelector('#refresh')
  if (refreshBtn) refreshBtn.disabled = true
  try {
    const value = await getPrice(MARKET_HASH_NAME)
    if (!value.success) throw new Error('Price unavailable')
    value.listings = value.listings?.toLocaleString() || 'Unavailable'
    cache(key, value)
    showOverviewPrice(value)
  } catch {
    setOverviewUnavailable()
  } finally {
    marketRequestActive = false
    if (refreshBtn) refreshBtn.disabled = false
  }
}

/**
 * Displays the overview price data in the UI
 * @param {Object} value - Price data object from getPrice()
 * @param {boolean} [fromCache] - Whether the data came from cache
 */
function showOverviewPrice(value, fromCache = false) {
  const fetched = value.fetchedAt ? new Date(value.fetchedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' }) : now()
  document.querySelector('#price-value').textContent = value.price
  document.querySelector('#lowest').textContent = value.price
  document.querySelector('#listings').textContent = value.listings
  document.querySelector('#volume').textContent = value.volume
  document.querySelector('#updated').textContent = `${fromCache ? 'Snapshot' : 'Fetched'} ${fetched}`
  document.querySelector('#footer-time').textContent = fetched
  document.querySelector('#connection-label').textContent = fromCache ? 'Cached Steam Market data' : 'Live from Steam Market'
  document.querySelector('#message').textContent = fromCache ? 'Cached snapshot is less than 60 seconds old.' : 'Values reflect Steam Community Market listings.'
}

/**
 * Displays unavailable state when price data cannot be fetched
 */
function setOverviewUnavailable() {
  document.querySelector('#price-value').textContent = 'Unavailable'
  document.querySelector('#lowest').textContent = 'Unavailable'
  document.querySelector('#listings').textContent = 'Unavailable'
  document.querySelector('#volume').textContent = 'Unavailable'
  document.querySelector('#updated').textContent = 'No current price received'
  document.querySelector('#connection-label').textContent = 'Steam Market unavailable'
  document.querySelector('#message').textContent = 'No current data found.'
}

/**
 * Loads skin artwork images from the local catalog or remote fallback.
 * Also triggers overview sparkline rendering after images load.
 */
async function loadArtwork() {
  try {
    let response = await fetch('/skin-catalog/skins.json')
    if (!response.ok) response = await fetch(`${import.meta.env.BASE_URL}skins.json`)
    if (!response.ok) throw new Error('Catalog unavailable')
    let catalog = await response.json()

    // Fallback to remote catalog if local is empty
    if (!Array.isArray(catalog) && !Object.keys(catalog).length) {
      const remote = await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json')
      if (remote.ok) catalog = await remote.json()
    }

    WEAPONS.forEach(([weapon, skin], index) => {
      const name = `${weapon} | ${skin}`
      const image = Array.isArray(catalog)
        ? catalog.find((item) => item.name === name)?.image
        : catalog[name]

      if (!image) return

      artwork[index] = image
      const element = document.querySelector(`[data-skin="${index}"]`)
      if (element) {
        element.src = image
        element.onload = () => { element.nextElementSibling.hidden = true }
      }
    })
  } catch (err) {
    // Text initials remain visible when artwork is unavailable.
  }

  // Render sparklines for overview weapons
  renderOverviewSparklines()
}

/**
 * Renders sparklines for all weapons on the overview page.
 * Finds the condition with the most history data for each weapon.
 */
function renderOverviewSparklines() {
  staticPricesPromise ||= fetch(`${import.meta.env.BASE_URL}prices.json`, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))

  staticPricesPromise.then(snapshot => {
    WEAPONS.forEach(([weapon, skin], index) => {
      const name = `${weapon} | ${skin}`
      let bestHistory = null

      CONDITIONS.forEach(condition => {
        const normalName = `${name} (${condition})`
        const data = snapshot[normalName]
        if (data?.history?.length) {
          if (!bestHistory || data.history.length > bestHistory.length) {
            bestHistory = data.history
          }
        }
        const stattrakName = `StatTrak™ ${normalName}`
        const stattrakData = snapshot[stattrakName]
        if (stattrakData?.history?.length) {
          if (!bestHistory || stattrakData.history.length > bestHistory.length) {
            bestHistory = stattrakData.history
          }
        }
      })

      const canvas = document.querySelector(`canvas.history-graph[data-skin-index="${index}"]`)
      if (canvas && bestHistory) {
        renderSparkline(canvas, bestHistory)
      }
    })
  })
}

function renderDetail(index) {
  const [weapon, skin, rarity] = WEAPONS[index]
  const name = `${weapon} | ${skin}`
  app.innerHTML = `<main class="overview detail-page"><header class="header"><a class="brand" href="#">DROP<span>WATCH</span></a><nav><a href="#">Market</a><a href="#">Weapon pool</a><a href="${steamUrl(name)}" target="_blank" rel="noreferrer">Steam ↗</a></nav></header><div class="market-crumb"><a href="#">Community Market</a> &gt; Genesis Terminal &gt; ${name}</div><section class="item-overview"><div class="item-art-panel"><div class="item-art-large weapon-image"><img src="${artwork[index] || ''}" alt="${name}"><b>${weapon.slice(0, 2)}</b></div><span class="art-caption">Counter-Strike 2</span></div><div class="item-summary"><p class="eyebrow">GENESIS TERMINAL / ${rarity.toUpperCase()}</p><h1>${name}</h1><p class="item-description">A weapon skin from the Genesis Terminal collection.</p><div class="detail-lowest"><span>Lowest listing across all conditions</span><strong id="detail-lowest">Loading...</strong></div><div class="item-tags"><span>Normal quality</span><span>CS2</span><span>${rarity}</span></div><div class="item-actions"><a class="steam-button" href="https://steamcommunity.com/market/search?q=${encodeURIComponent(name)}&appid=730" target="_blank" rel="noreferrer">View on Steam Market ↗</a><a href="#" class="return-link">← Back to collection</a></div></div></section><section class="condition-card"><div class="card-top"><span>LISTINGS FOR ${name.toUpperCase()}</span><span id="detail-status">Fetching...</span></div><div class="condition-intro"><strong>Price by condition</strong><span>Lowest listing / USD</span></div><div class="condition-grid">${renderConditions()}</div><div class="card-footer"><span id="detail-source">Source: Steam Community Market · buyer-facing sell price</span><a href="${steamUrl(name)}" target="_blank" rel="noreferrer">View all listings</a></div></section><footer>Dropwatch 2004-style market board <span>${name}</span></footer></main>`
  document.querySelector('.return-link').addEventListener('click', (event) => { event.preventDefault(); window.location.hash = '' })
  loadConditions(name)
  updateCacheStatus()
  beginRefreshLoop(() => loadConditions(name))
}

function renderConditions() {
  return CONDITIONS.map((condition, index) => `<article class="condition-column" data-condition="${index}"><header><strong>${condition}</strong><small>${index === 0 ? 'Cleanest finish' : index === 4 ? 'Heavy wear' : 'Wear condition'}</small></header><div class="condition-offer"><span>Normal</span><strong class="normal-price">Loading...</strong><a class="normal-link" target="_blank" rel="noreferrer">Steam ↗</a><canvas class="history-graph" data-condition="${index}" data-type="normal" width="100%" height="32"></canvas></div><div class="condition-offer stattrak-offer"><span>StatTrak™</span><strong class="stattrak-price">Loading...</strong><a class="stattrak-link" target="_blank" rel="noreferrer">Steam ↗</a><canvas class="history-graph" data-condition="${index}" data-type="stattrak" width="100%" height="32"></canvas></div></article>`).join('')
}

async function loadConditions(displayName, force = false) {
  if (conditionRequestActive) return
  conditionRequestActive = true
  const columns = [...document.querySelectorAll('.condition-column')]
  const prices = []

  for (const [index, condition] of CONDITIONS.entries()) {
    const column = columns[index]
    const normal = `${displayName} (${condition})`
    const stattrak = `StatTrak™ ${displayName} (${condition})`
    column.querySelector('.normal-link').href = steamUrl(normal)
    column.querySelector('.stattrak-link').href = steamUrl(stattrak)
    const values = [await loadConditionPrice(normal, force), await loadConditionPrice(stattrak, force)]
    column.querySelector('.normal-price').textContent = values[0]
    column.querySelector('.stattrak-price').textContent = values[1]
    prices.push(...values.map((value) => Number.parseFloat(value.replace('$', ''))).filter(Number.isFinite))
  }

  const fetched = now()
  document.querySelector('#detail-lowest').textContent = prices.length ? `$${Math.min(...prices).toFixed(2)}` : 'Unavailable'
  document.querySelector('#detail-status').textContent = `Fetched ${fetched}`
  document.querySelector('#detail-source').textContent = `Source: Steam Community Market · buyer-facing sell price · ${fetched}`
  updateCacheStatus()
  if (!prices.length) {
    const source = document.querySelector('#detail-source')
    source.textContent = 'No current price found. Open the official Steam listing to view current data.'
  }

  // Render sparklines for detail page conditions
  renderDetailSparklines(displayName)

  conditionRequestActive = false
}

/**
 * Renders sparklines for all conditions of a weapon on the detail page.
 * @param {string} displayName - The weapon skin name (e.g., "AK-47 | The Oligarch")
 */
function renderDetailSparklines(displayName) {
  staticPricesPromise ||= fetch(`${import.meta.env.BASE_URL}prices.json`, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))

  staticPricesPromise.then(snapshot => {
    CONDITIONS.forEach((condition, index) => {
      const normalName = `${displayName} (${condition})`
      const normalData = snapshot[normalName]
      const normalCanvas = document.querySelector(`canvas.history-graph[data-condition="${index}"][data-type="normal"]`)
      if (normalCanvas && normalData?.history?.length) {
        renderSparkline(normalCanvas, normalData.history)
      }

      const stattrakName = `StatTrak™ ${normalName}`
      const stattrakData = snapshot[stattrakName]
      const stattrakCanvas = document.querySelector(`canvas.history-graph[data-condition="${index}"][data-type="stattrak"]`)
      if (stattrakCanvas && stattrakData?.history?.length) {
        renderSparkline(stattrakCanvas, stattrakData.history, '#a13b29')
      }
    })
  })
}

async function loadConditionPrice(name, force) {
  const saved = cached(`skin:${name}`)
  if (saved && !force) return saved.value
  try {
    const value = await getPrice(name)
    if (value.success && value.price) { cache(`skin:${name}`, value.price); return value.price }
  } catch { /* Keep this condition unavailable. */ }
  return 'Unavailable'
}

function route() {
  clearInterval(refreshTimer)
  document.querySelector('#price-cache-status')?.remove()
  const match = window.location.hash.match(/^#skin=(\d+)$/)
  if (match && WEAPONS[Number(match[1])]) renderDetail(Number(match[1]))
  else renderOverview()
}

window.addEventListener('hashchange', route)
route()
