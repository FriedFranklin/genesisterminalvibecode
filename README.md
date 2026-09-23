# Dropwatch

Dropwatch is a 2004-style Counter-Strike 2 Genesis Terminal market board that displays live Steam prices with historical price graphs (sparklines). It shows the container price, all 17 available skins, and Normal/StatTrak prices for every wear condition.

## Features

- **Real-time Steam prices** - Fetches buyer-facing prices from Steam Community Market
- **Historical price graphs** - Sparkline visualizations showing price trends over time
- **Condition breakdown** - Normal and StatTrak prices for all 5 wear conditions
- **2004 aesthetic** - Retro CSS design reminiscent of early 2000s web interfaces
- **Client-side caching** - 60-second TTL to reduce Steam API load
- **Static snapshot architecture** - Pre-generated prices.json for GitHub Pages deployment
- **Browser-based scraping** - Playwright with realistic headers to avoid bot detection
- **GitHub Actions automation** - Automated price updates every 15 minutes

## Data Model

Prices come from Steam Community Market search results and use Steam's buyer-facing `sell_price_text` value. Each snapshot records its generation time in `prices.json`.

The application uses two data paths:

- **Development:** Vite middleware exposes `/api/market-price` with server-side 60-second cache
- **GitHub Pages:** Frontend reads generated `public/prices.json` snapshot (no direct Steam contact)

Unavailable prices are shown as `Unavailable`; the UI does not invent or silently reuse failed values.

## Local Development

Requirements: Node.js 24 or newer and npm.

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173/`.

Useful checks:

```bash
# Build for production
npm run build

# Check scraper syntax
node --check scripts/update-prices-browser.mjs
```

## GitHub Pages Deployment

The repository contains two automated workflows:

1. **Update Steam prices** (`.github/workflows/update-prices.yml`)
   - Runs every 15 minutes via cron (`*/15 * * * *`)
   - Can also be triggered manually via workflow_dispatch
   - Uses Playwright with Chromium to scrape Steam prices
   - Writes updated `public/prices.json` and `public/skins.json`
   - Commits and pushes changes to trigger deployment

2. **Deploy to GitHub Pages** (`.github/workflows/deploy-pages.yml`)
   - Triggered on pushes to `main` branch
   - Can also be triggered manually
   - Installs dependencies, builds Vite site
   - Deploys `dist/` directory to GitHub Pages

To enable deployment:
1. Go to repository **Settings → Pages**
2. Select **GitHub Actions** as the source
3. Ensure repository Actions permissions allow read and write access

The scheduled workflow includes bounded retries and request timeouts. Steam rate limits may result in individual `Unavailable` entries; this is intentional to prevent stale or fabricated prices.

## Project Layout

```text
src/overview-clean.js       Frontend entry point with hash-based routing
src/retro.css               2000s-style visual design (Tahoma, gradients, etc.)
scripts/update-prices-browser.mjs   Playwright-based Steam price scraper
vite.config.js              Vite configuration with market cache middleware
public/prices.json          Generated price snapshot (updated by GitHub Actions)
public/skins.json           Generated skin artwork thumbnails
.github/workflows/          GitHub Actions workflows for automation
index.html                  Single-page application entry
package.json                Project dependencies and scripts
```

## Browser Compatibility

Dropwatch uses modern web APIs and is tested on:
- Chrome 120+
- Firefox 115+
- Safari 16+
- Edge 120+

## Price History & Sparklines

- **History retention:** 30 days of price data (2880 data points at 15-minute intervals)
- **Sparkline rendering:** Canvas-based mini-charts showing price trends
- **Overview page:** One sparkline per weapon showing most volatile condition
- **Detail page:** Separate sparklines for Normal and StatTrak of each condition
- **Data source:** Actual scraped prices (not estimated or interpolated)

## Steam Integration Notes

- Uses buyer-facing `sell_price_text` from Steam search/render API
- Falls back to direct page scraping when API data unavailable
- Implements realistic browser headers (Chrome 120 UA, full header suite)
- Blocks unnecessary resources (images, fonts) for faster scraping
- Respectful scraping with 1.5-second delays between requests
- Does not require Steam API keys or user credentials

## Disclaimer

> [!IMPORTANT]
> ## AI-Assisted Project Disclaimer
>
> This project was created and maintained with the assistance of AI coding tools. AI-generated code can contain mistakes, incomplete assumptions, security issues, or inaccurate data-handling decisions. Review and test all code before using it in production.
>
> Dropwatch is an informational hobby project. Prices are market snapshots, not guaranteed quotes, offers, or financial advice. Steam data may be delayed, incomplete, rate-limited, unavailable, or changed by Steam without notice. Always verify the current price and listing directly on Steam before making any purchase or sale.
>
> This project is not affiliated with, endorsed by, or sponsored by Valve Corporation or Steam. Steam, Counter-Strike, and related trademarks belong to their respective owners. Do not provide Steam passwords, session cookies, API keys, or other credentials to this project.