import './style.css'

const marketHashName = 'Genesis Terminal'
const app = document.querySelector('#app')

app.innerHTML = `
  <main class="overview">
    <header class="header">
      <a class="brand" href="/">DROP<span>WATCH</span></a>
      <div class="header-status"><i></i><span id="connection-label">Connecting to Steam Market</span></div>
    </header>
    <section class="hero">
      <p class="eyebrow">COUNTER-STRIKE 2 / CONTAINER</p>
      <h1>Genesis <em>Terminal</em></h1>
      <p class="lede">One clear view of the current Steam Community Market price.</p>
      <a class="steam-link" href="https://steamcommunity.com/market/listings/730/Genesis%20Terminal" target="_blank" rel="noreferrer">Open on Steam <span>↗</span></a>
    </section>
    <section class="market-card" aria-live="polite">
      <div class="card-top"><span>LIVE STEAM MARKET DATA</span><span id="updated">Fetching current listing...</span></div>
      <div class="price-block"><span class="currency">USD</span><strong id="price">--</strong><span id="price-label">Lowest current listing</span></div>
      <div class="metrics">
        <div><span>Listings</span><strong id="volume">--</strong></div>
        <div><span>Median price</span><strong id="median">--</strong></div>
        <div><span>Source</span><strong>Steam Market</strong></div>
      </div>
      <div class="card-footer"><span id="message">Prices load directly from Steam when available.</span><button id="refresh" type="button">Refresh <b>↻</b></button></div>
    </section>
    <p class="note">Genesis Terminal is a container, so wear categories such as Factory New or Well-Worn do not apply to the item itself.</p>
  </main>
`

const formatPrice = (value) => value || '--'

async function loadMarketPrice() {
  const price = document.querySelector('#price')
  const median = document.querySelector('#median')
  const volume = document.querySelector('#volume')
  const updated = document.querySelector('#updated')
  const message = document.querySelector('#message')
  const connection = document.querySelector('#connection-label')
  const refresh = document.querySelector('#refresh')

  refresh.disabled = true
  connection.textContent = 'Connecting to Steam Market'
  updated.textContent = 'Fetching current listing...'
  message.textContent = 'Requesting the latest market snapshot.'
  try {
    const response = await fetch(`/steam/market/priceoverview/?appid=730&currency=3&market_hash_name=${encodeURIComponent(marketHashName)}`)
    if (!response.ok) throw new Error(`Steam returned ${response.status}`)
    const data = await response.json()
    if (!data.success) throw new Error('Item was not found in the Steam Market')

    price.textContent = formatPrice(data.lowest_price)
    median.textContent = formatPrice(data.median_price)
    volume.textContent = data.volume || '--'
    updated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    connection.textContent = 'Live from Steam Market'
    message.textContent = 'Values reflect Steam Community Market listings.'
  } catch (error) {
    price.textContent = '--'
    median.textContent = '--'
    volume.textContent = '--'
    updated.textContent = 'Unable to fetch current listing'
    connection.textContent = 'Steam Market unavailable'
    message.textContent = 'Steam may be rate-limiting requests. Try refreshing in a moment.'
  } finally {
    refresh.disabled = false
  }
}

document.querySelector('#refresh').addEventListener('click', loadMarketPrice)
loadMarketPrice()import './style.css'

const prices = [
  { name: 'Factory New', short: 'FN', price: 4.82, change: 12.4, color: '#f5c56b', note: 'Cleanest finish' },
  { name: 'Minimal Wear', short: 'MW', price: 3.67, change: 8.1, color: '#9bb8c9', note: 'Lightly used' },
  { name: 'Field-Tested', short: 'FT', price: 2.91, change: 4.7, color: '#d68c61', note: 'Market standard' },
  { name: 'Well-Worn', short: 'WW', price: 2.44, change: -1.8, color: '#bd7b82', note: 'Visible wear' },
  { name: 'Battle-Scarred', short: 'BS', price: 1.98, change: -3.2, color: '#8e7f89', note: 'Heavy wear' },
]

const money = (value) => `€${value.toFixed(2)}`

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Dropwatch home"><span class="brand-mark">D</span><span>DROP<span>WATCH</span></span></a>
    <nav class="main-nav" aria-label="Main navigation"><a class="active" href="#market">Market</a><a href="#history">Price history</a><a href="#about">About</a></nav>
    <div class="top-actions"><span class="status-dot"></span><span class="live-label">Live market</span><button class="icon-button" aria-label="Toggle theme">☼</button></div>
  </header>

  <main id="market">
    <section class="intro">
      <div><p class="eyebrow">CS2 / CONTAINERS / CASES</p><h1>Genesis <em>Case</em></h1><p class="subhead">Track the opening price across every wear grade.</p></div>
      <div class="updated"><span class="pulse"></span><span>Updated 2 min ago</span><button class="refresh" aria-label="Refresh prices">↻</button></div>
    </section>

    <section class="dashboard-grid">
      <article class="case-panel">
        <div class="case-panel-head"><span>Featured container</span><span class="verified">✦ verified</span></div>
        <div class="case-stage"><div class="halo"></div><div class="case-glow"></div><div class="case-art"><span class="case-stripe"></span><span class="case-letter">G</span><span class="case-title">GENESIS</span><span class="case-subtitle">COUNTER-STRIKE 2</span><span class="case-lock">◆</span></div><div class="case-shadow"></div></div>
        <div class="case-info"><div><h2>Genesis Case</h2><p>Container · Released 08 Aug 2024</p></div><span class="case-count">#24 / 41</span></div>
        <div class="case-stats"><div><span>Current price</span><strong>$2.39</strong></div><div><span>24h volume</span><strong>18,472</strong></div><div><span>Listings</span><strong>1,284</strong></div></div>
      </article>

      <article class="prices-panel">
        <div class="panel-heading"><div><p class="eyebrow">MARKET SNAPSHOT</p><h2>Price by wear</h2></div><button class="currency">EUR <span>⌄</span></button></div>
        <div class="price-tabs" role="tablist" aria-label="Wear grade filters">${prices.map((item, index) => `<button class="price-tab ${index === 0 ? 'selected' : ''}" data-index="${index}" role="tab" aria-selected="${index === 0}"><span>${item.short}</span><small>${item.name.split(' ')[0]}</small></button>`).join('')}</div>
        <div class="price-list">${prices.map((item, index) => `<button class="price-row ${index === 0 ? 'highlighted' : ''}" data-index="${index}"><span class="wear-icon" style="--wear:${item.color}">${item.short}</span><span class="wear-name"><strong>${item.name}</strong><small>${item.note}</small></span><span class="sparkline"><i style="height:${38 + index * 7}%"></i><i style="height:${55 - index * 4}%"></i><i style="height:${46 + index * 3}%"></i><i style="height:${72 - index * 5}%"></i><i style="height:${64 - index * 2}%"></i><i style="height:${82 - index * 7}%"></i></span><span class="wear-price"><strong>${money(item.price)}</strong><small class="${item.change < 0 ? 'negative' : ''}">${item.change > 0 ? '↑' : '↓'} ${Math.abs(item.change)}%</small></span></button>`).join('')}</div>
        <p class="disclaimer">Prices are aggregated from active Steam Community Market listings.</p>
      </article>
    </section>

    <section class="insight-strip"><div class="insight-label"><span class="signal-icon">↗</span><span><strong>Market insight</strong><small>Last 7 days</small></span></div><div class="insight-copy">Factory New is leading the case market with a <strong>12.4% lift</strong> this week.</div><div class="mini-chart"><span style="height:36%"></span><span style="height:48%"></span><span style="height:42%"></span><span style="height:60%"></span><span style="height:52%"></span><span style="height:78%"></span><span style="height:72%"></span><span style="height:93%"></span></div><button class="details-button">View details <span>→</span></button></section>
  </main>
  <footer><span>DROPWATCH <b>·</b> MARKET INTELLIGENCE FOR CS2</span><span>Data refreshes automatically <span class="footer-live"></span></span></footer>
`

document.querySelectorAll('[data-index]').forEach((button) => {
  button.addEventListener('click', () => {
    const index = button.dataset.index
    document.querySelectorAll('.price-tab, .price-row').forEach((item) => item.classList.toggle('highlighted', item.classList.contains('price-row') && item.dataset.index === index))
    document.querySelectorAll('.price-tab').forEach((item) => { item.classList.toggle('selected', item.dataset.index === index); item.setAttribute('aria-selected', item.dataset.index === index) })
  })
})
