# Update‑Prices Script – Overview

**What it does**
The script gathers the current market prices for CS:GO weapon skins from the Steam Community Market. It collects this information and saves it to files that can be used by the rest of the project.

**How it works**
1. It first tries to ask Steam’s public API for the price. This is the quickest method.
2. If the API is unavailable or blocked, it loads the web page for the item and reads the price that is displayed on the page.
3. When both of those methods fail, it opens a hidden web browser, loads the full page, and extracts the price for each condition (e.g., Factory New, Minimal Wear). This step needs you to be logged into Steam so the page shows the detailed data.

**Why there are three ways**
- The API is fast but can be rate‑limited, meaning Steam may temporarily stop answering many requests.
- The simple web‑page scrape works without logging in but only gives a single price, not the price for each condition.
- The hidden‑browser method gives the most detailed information (prices for every condition) but is slower and requires a logged‑in Steam session.

**How to run it**
Simply execute the script with Node:
```
node scripts/update-prices.mjs
```
It will create two JSON files – one with the prices and one with the skin images.

**Choosing the right approach**
- Use the fast API method when you just need a quick overview of prices.
- Use the simple page‑scrape when you don’t want to log in and only need one price per skin.
- Use the hidden‑browser method when you need the exact price for every condition and are okay with a slower run

This plain‑language description should help anyone understand what the updater script does and the options it provides.