import './retro.css'

const marketHashName = 'Sealed Genesis Terminal'
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
const app = document.querySelector('#app')

app.innerHTML = `
  <main class="overview">
    <header class="header"><a class="brand" href="/">DROP<span>WATCH</span></a><nav><a href="#price">Market</a><a href="#weapons">Weapon pool</a><a href="https://steamcommunity.com/market/listings/730/Sealed%20Genesis%20Terminal" target="_blank" rel="noreferrer">Steam ↗</a></nav></header>
    <section class="hero"><div><p class="eyebrow">COUNTER-STRIKE 2 &gt; CONTAINER</p><h1>Genesis Terminal</h1><p class="lede">Steam Community Market overview</p></div><div class="online"><i></i><span id="connection-label">Connecting to Steam Market</span></div></section>
    <section class="market-card" id="price" aria-live="polite"><div class="card-top"><span>GENESIS TERMINAL / CURRENT MARKET PRICE</span><span id="updated">Fetching...</span></div><div class="price-block"><span class="currency">USD</span><strong id="price-value">--</strong><span>lowest current listing</span></div><div class="metrics"><div><span>Active listings</span><strong id="volume">--</strong></div><div><span>Median price</span><strong id="median">--</strong></div><div><span>Market</span><strong>Steam</strong></div></div><div class="card-footer"><span id="message">Prices load directly from Steam when available.</span><button id="refresh" type="button">Refresh price</button></div></section>
    <section class="weapons" id="weapons"><div class="section-title"><h2>Weapons you can get</h2><span>17 skins in the Genesis Terminal</span></div><div class="weapon-row">${weapons.map(([weapon, skin, rarity], index) => `<a class="weapon" href="https://steamcommunity.com/market/search?q=${encodeURIComponent(`${weapon} | ${skin}`)}&appid=730" target="_blank" rel="noreferrer"><span class="weapon-image weapon-${index}"><img data-skin="${index}" alt="${weapon} | ${skin}" loading="lazy"><b>${weapon.slice(0, 2)}</b></span><strong>${weapon}</strong><small>${skin}</small><em>${rarity}</em></a>`).join('')}</div><p class="note">Weapon pool from the Genesis Terminal. Thumbnails and names are loaded from Steam Market search.</p></section>
    <footer>Dropwatch 2004-style market board <span>Last request: <b id="footer-time">--</b></span></footer>
  </main>
`

async function loadMarketPrice() {
  const price = document.querySelector('#price-value')
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
    const response = await fetch(`/steam/market/priceoverview/?appid=730&currency=1&market_hash_name=${encodeURIComponent(marketHashName)}`)
    if (!response.ok) throw new Error(`Steam returned ${response.status}`)
    const data = await response.json()
    if (!data.success) throw new Error('Item was not found in the Steam Market')
    price.textContent = data.lowest_price || '--'
    median.textContent = data.median_price || '--'
    volume.textContent = data.volume || '--'
    updated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    document.querySelector('#footer-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    connection.textContent = 'Live from Steam Market'
    message.textContent = 'Values reflect Steam Community Market listings.'
  } catch {
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
loadMarketPrice()

async function loadSkinImages() {
  try {
    const response = await fetch('/skin-catalog/skins.json')
    const catalog = await response.json()
    weapons.forEach(([weapon, skin], index) => {
      const artwork = catalog.find((item) => item.name === `${weapon} | ${skin}`)?.image
      if (!artwork) return
      const image = document.querySelector(`[data-skin="${index}"]`)
      image.src = artwork
      image.onload = () => image.nextElementSibling.hidden = true
    })
  } catch {
    // The text fallback remains visible when the image catalog is unavailable.
  }
}

loadSkinImages()
