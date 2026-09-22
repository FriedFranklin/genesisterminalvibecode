import { defineConfig } from 'vite'

const cacheTtl = 60 * 1000

function marketCachePlugin() {
  const cache = new Map()
  let queue = Promise.resolve()

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

  async function fetchSteam(path) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`https://steamcommunity.com${path}`)
      if (response.status !== 429) return response
      const retryAfter = Number(response.headers.get('retry-after'))
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1))
    }
    throw new Error('Steam rate limit')
  }

  function enqueue(task) {
    const result = queue.then(task, task)
    queue = result.catch(() => {})
    return result
  }

  return {
    name: 'steam-market-cache',
    configureServer(server) {
      server.middlewares.use('/api/market-price', async (request, response) => {
        const requestUrl = new URL(request.url, 'http://localhost')
        const marketHashName = requestUrl.searchParams.get('market_hash_name')
        if (!marketHashName) {
          response.statusCode = 400
          response.end(JSON.stringify({ success: false, error: 'market_hash_name is required' }))
          return
        }

        try {
          const result = await enqueue(async () => {
            const cached = cache.get(marketHashName)
            if (cached && Date.now() - cached.fetchedAt < cacheTtl) return { ...cached.value, cached: true, fetchedAt: cached.fetchedAt }

            const encodedName = encodeURIComponent(marketHashName)
            const [overviewResponse, searchResponse] = await Promise.all([
              fetchSteam(`/market/priceoverview/?appid=730&currency=1&market_hash_name=${encodedName}`),
              fetchSteam(`/market/search/render/?query=${encodedName}&start=0&count=10&search_descriptions=0&sort_column=price&sort_dir=asc&appid=730&norender=1`),
            ])
            const overview = await overviewResponse.json()
            const search = await searchResponse.json()
            const exact = search.results?.find((item) => item.hash_name === marketHashName)
            if (!overview.success || !exact?.sell_price_text) return { success: false, error: 'Steam item unavailable' }

            const value = {
              success: true,
              price: exact.sell_price_text,
              listings: exact.sell_listings,
              volume: overview.volume || '--',
            }
            const fetchedAt = Date.now()
            cache.set(marketHashName, { value, fetchedAt })
            return { ...value, cached: false, fetchedAt }
          })
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify(result))
        } catch (error) {
          response.statusCode = 503
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ success: false, error: error.message }))
        }
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [marketCachePlugin()],
  server: {
    proxy: {
      '/steam': {
        target: 'https://steamcommunity.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/steam/, ''),
      },
      '/skin-catalog': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: () => '/ByMykel/CSGO-API/main/public/api/en/skins.json',
      },
    },
  },
})