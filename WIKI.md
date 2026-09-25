# Dropwatch Project Wiki

## Table of Contents
- [Project Overview](#project-overview)
- [Architecture Overview](#architecture-overview)
  - [Dual Data Path Design](#dual-data-path-design)
  - [Data Flow Diagram](#data-flow-diagram)
- [Frontend Implementation](#frontend-implementation)
  - [Routing & Navigation](#routing--navigation)
  - [Caching Strategy](#caching-strategy)
  - [Sparkline Rendering](#sparkline-rendering)
  - [Styling System (retro.css)](#styling-system-retrocss)
- [Scraping Pipeline](#scraping-pipeline)
  - [Playwright Scraper (Browser Mode)](#playwright-scraper-browser-mode)
  - [Node Scraper (CI Mode)](#node-scraper-ci-mode)
  - [Price Extraction Logic](#price-extraction-logic)
  - [History Merging & Storage](#history-merging--storage)
- [Deployment & CI/CD](#deployment--cicd)
  - [GitHub Actions Workflows](#github-actions-workflows)
  - [Static Hosting on GitHub Pages](#static-hosting-on-github-pages)
- [Development & Build Commands](#development--build-commands)
- [Future Work & Extensibility](#future-work--extensibility)

---

## Project Overview

**Dropwatch** is a lightweight, vanilla‑JavaScript single‑page application that tracks the market price of the **Genesis Terminal** container and its 17 weapon skins from *Counter‑Strike 2* (CS2). It provides:
- Real‑time price data (when running locally) via a Vite development server that proxies Steam Community Market API calls.
- Static snapshots for production, hosted on GitHub Pages, to avoid CORS and rate‑limit issues.
- Interactive sparkline graphs visualising 30‑day price history for each skin/condition.
- A retro 2004‑era UI theme implemented in `retro.css`.

The repository contains three main components:
1. **Frontend SPA** (`src/overview-clean.js`, `src/retro.css`, `index.html`).
2. **Scraping pipeline** (`scripts/update-prices-browser.mjs` for local testing, `scripts/update-prices.mjs` for CI). 
3. **Vite dev server** with a custom middleware (`vite.config.js`) that caches and queues market‑price requests.

---

## Architecture Overview

### Dual Data Path Design
- **Development mode** – The Vite dev server proxies `/api/market-price` to the Steam API. Requests are cached in‑memory for 60 seconds and queued to avoid thundering‑herd.
- **Production mode** – The SPA loads static JSON snapshots (`public/prices.json` and `public/skins.json`). This eliminates the need for server‑side API calls, making the site fully static and CORS‑free.

### Data Flow Diagram
```
+-------------------+      +-------------------+      +-------------------+
|   Frontend SPA    | ---> | Vite Middleware   | ---> | Steam Market API |
| (overview-clean) |      | /api/market-price |      +-------------------+
+-------------------+      +-------------------+                |
        ^                         ^                         |
        |                         |                         |
        |   (static snapshot)     |   (cached response)      |
        |                         |                         |
+-------------------+      +-------------------+                |
|   Static JSONs    | <----|  CI Scraper Job   | <-----------------
| (prices.json)     |      | (update‑prices.mjs) |
+-------------------+      +-------------------+
```

---

## Frontend Implementation

### Routing & Navigation
- Hash‑based routing (`#overview` default, `#skin=<index>` for detail view).
- `route()` listens to `hashchange` and renders the appropriate view.
- Weapon cards link to detail pages via `#skin=` hashes.

### Caching Strategy
- **LocalStorage** cache with a 60 second TTL (`cached(key)`, `cache(key, value)`).
- Separate caches for overview price, skin artwork, and per‑condition prices.
- Fallback to live API when cache miss or stale.

### Sparkline Rendering
- `renderSparkline(canvas, history, color)` draws a 30‑day price history on a `<canvas>`.
- Auto‑scales Y‑axis, draws tooltips on hover, and uses a configurable `MAX_HISTORY_POINTS = 2880` (15‑min intervals).
- Mini‑sparklines on the overview page show the most volatile condition per weapon.

### Styling System (`retro.css`)
- Retro 2004 UI theme with gradient borders, box‑shadows, and a limited colour palette.
- Responsive breakpoints at 700 px for mobile.
- Component classes: `.overview`, `.market-card`, `.weapon`, `.detail-page`, `.condition-grid`, `.sparkline`.
- All UI elements are pure CSS – no framework dependencies.

---

## Scraping Pipeline

### Playwright Scraper (Browser Mode)
- `scripts/update-prices-browser.mjs` launches Chromium via Playwright.
- Realistic request headers (User‑Agent, Accept‑Language, Accept‑Encoding).
- Resource blocking for images, fonts, and stylesheets to speed up scraping.
- 1.5 s delay between requests to respect Steam rate limits.
- Scrapes the container and each skin/condition (5 conditions × 2 variants = 10 listings per skin).

### Node Scraper (CI Mode)
- `scripts/update-prices.mjs` runs in GitHub Actions on Ubuntu.
- Uses the same extraction logic as the browser version but without a headless browser (direct HTTP requests).
- Commits updated `public/prices.json` and `public/skins.json` back to the repository.

### Price Extraction Logic
- Primary method: Parse the Steam Community Market page DOM using up to **five** CSS selectors.
- Fallback: Parse embedded JavaScript variables (`g_rgAssets`, `g_rgListingInfo`).
- Secondary fallback: Use the `priceoverview` API for price & volume, then the `search/render` API for missing data.
- Handles HTTP 429 with exponential back‑off and respects the `Retry‑After` header.

### History Merging & Storage
- `MAX_HISTORY_POINTS = 2880` (30 days × 96 intervals/day).
- `mergePriceHistory()` only appends a new data point when the price changes, reducing noise.
- History is stored as an array of `{timestamp, price}` objects inside each item entry in `prices.json`.

---

## Deployment & CI/CD

### GitHub Actions Workflows
1. **Update Prices** – `.github/workflows/update-prices.yml`
   - Runs every 15 minutes (`cron: '*/15 * * * *'`) and on manual dispatch.
   - Checks out the repo, sets up Node 24, runs `npm ci` and `node scripts/update-prices.mjs`.
   - Commits the updated JSON snapshots back to the repository.
2. **Deploy Pages** – `.github/workflows/deploy-pages.yml`
   - Triggers on pushes to `main` and manual dispatch.
   - Builds the Vite project (`npm run build`) and uploads the `dist` folder as a GitHub Pages artifact.
   - Deploys to the `github-pages` environment using `actions/deploy-pages@v4`.

### Static Hosting on GitHub Pages
- The built site is served from the `dist` directory with `base: './'` in `vite.config.js` to ensure correct relative asset paths.
- All runtime data is loaded from the static JSON snapshots, making the site fully static and cache‑friendly.

---

## Development & Build Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Starts Vite dev server with market‑price middleware (live API). |
| `npm run build` | Generates production assets in `dist/`. |
| `npm run preview` | Serves the built site locally (static mode). |
| `node scripts/update-prices.mjs` | Manually run the CI scraper to refresh snapshots. |
| `node scripts/update-prices-browser.mjs` | Run the Playwright scraper locally for debugging. |

---

## Future Work & Extensibility
- **Additional Market Items** – Extend the scraper to support other containers or game items.
- **WebSocket Updates** – Push live price updates to the SPA without page reload.
- **Theming** – Add a dark‑mode toggle while preserving the retro aesthetic.
- **Unit Tests** – Introduce Jest tests for the caching layer and price‑history utilities.
- **Dockerization** – Provide a Dockerfile for reproducible local development environments.

---

*This wiki page was generated automatically based on the current repository state (2026‑09‑25). It aims to serve as a single source of truth for developers, contributors, and users of the Dropwatch project.*
