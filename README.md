# Dropwatch

Dropwatch is a small Counter-Strike 2 Genesis Terminal market board. It shows the container price, the 17 available skins, and Normal/StatTrak prices for every wear condition.

> [!IMPORTANT]
> ## AI-Assisted Project Disclaimer
>
> This project was created and maintained with the assistance of AI coding tools. AI-generated code can contain mistakes, incomplete assumptions, security issues, or inaccurate data-handling decisions. Review and test all code before using it in production.
>
> Dropwatch is an informational hobby project. Prices are market snapshots, not guaranteed quotes, offers, or financial advice. Steam data may be delayed, incomplete, rate-limited, unavailable, or changed by Steam without notice. Always verify the current price and listing directly on Steam before making any purchase or sale.
>
> This project is not affiliated with, endorsed by, or sponsored by Valve Corporation or Steam. Steam, Counter-Strike, and related trademarks belong to their respective owners. Do not provide Steam passwords, session cookies, API keys, or other credentials to this project.

## Data model

Prices come from Steam Community Market search results and use Steam's buyer-facing `sell_price_text` value. Each snapshot also records its generation time in `prices.json`.

The application has two data paths:

- **Development:** the Vite middleware exposes `/api/market-price` and keeps a server-side 60-second cache with serialized requests and retry backoff.
- **GitHub Pages:** the frontend reads the generated `public/prices.json` snapshot. Visitors do not contact Steam directly.

Unavailable prices are shown as `Unavailable`; the UI does not invent or silently reuse a failed value.

## Local development

Requirements: Node.js 24 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`.

Useful checks:

```bash
npm run build
node --check scripts/update-prices.mjs
```

## GitHub Pages deployment

The repository contains two workflows:

- `Update Steam prices` runs every 15 minutes and can also be started manually. It writes `public/prices.json` and `public/skins.json`.
- `Deploy to GitHub Pages` builds `dist/` and deploys it after pushes to `main`.

To enable deployment, open repository **Settings → Pages** and select **GitHub Actions** as the source. The repository Actions permissions must allow read and write access because the updater commits the generated snapshots.

The scheduled workflow uses bounded retries and request timeouts. Steam rate limits can still result in individual `Unavailable` entries; that is intentional and prevents stale or fabricated prices.

## Project layout

```text
src/overview-clean.js       Readable frontend entry and hash routes
src/retro.css               2000s-style visual design
scripts/update-prices.mjs   Scheduled Steam snapshot generator
vite.config.js              Local market cache middleware and proxies
public/prices.json          Generated shared price snapshot
public/skins.json           Generated skin artwork map
.github/workflows/           GitHub Actions workflows
```

Do not put Steam API keys or session credentials in frontend code or committed files.