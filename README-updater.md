# Update‑Prices Script – Overview

**What it does**
The script collects the current market prices (in euros) for CS:GO skins that belong to the terminal collection. It writes the price data to JSON files that the rest of the project can read.

**How it works**
1. **Fast API call** – The script first asks Steam’s public API for the cheapest price. This is the quickest method and does not require a browser.
2. **HTML page scrape** – If the API does not respond, the script downloads the public market page and reads the price shown on the page.
3. **Playwright fallback** – When the first two methods fail, the script opens a hidden Chromium browser (Playwright) and lets the page run its JavaScript. This allows the script to see the full data that Steam builds dynamically.

**The multi‑header idea**
When the script makes a plain HTTP request (steps 1 and 2) it adds several realistic headers – a common User‑Agent string, an Accept‑Language, a Referer and other typical headers. By sending a set of headers that look like a normal web browser, the request is less likely to be blocked as a bot. This technique is called the *multi‑header* approach.

**JavaScript support**
Only the Playwright fallback can execute JavaScript. When Playwright is used, the page’s scripts run exactly as they would in a real browser, so the script can read values that are generated on the client side.

**Scope – terminal collection skins only**
The updater is designed to work exclusively with the skins that belong to the terminal collection. It does not attempt to fetch prices for any other items.

**Playwright single‑call condition fetching**
When Playwright loads a market page, the page contains a data structure that holds the price for every condition (Factory New, Minimal Wear, etc.). The script reads that structure once and extracts the price for the requested condition. It does **not** make ten separate network calls – a single page load gives all the condition prices at once.

**Why there are three ways**
- The API method is fast but can be rate‑limited, meaning Steam may temporarily stop answering many requests.
- The HTML scrape works without logging in but only returns one price per skin.
- The Playwright fallback gives the most detailed information (prices for every condition) but is slower and requires the hidden browser.

**How to run it**
Run the script with Node:
```
node scripts/update-prices.mjs
```
It will create two JSON files in the `public` folder – one with the prices and one with the skin images.

**Choosing the right approach**
- Use the fast API method when you just need a quick overview of prices.
- Use the simple page‑scrape when you do not want to run a browser and only need one price per skin.
- Use the Playwright fallback when you need the exact price for every condition and are okay with a slower run.

This plain‑language description should help anyone understand what the updater script does, how the multi‑header technique works, and what to expect from each method.