import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Simple script to open a Steam Market listing page and capture a screenshot.
// The item name can be provided via the PRICE_ITEM environment variable.
// Example: PRICE_ITEM="MAG-7 | MAGnitude" npm run view-price

const item = process.env.PRICE_ITEM || 'MAG-7 | MAGnitude';
const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(item)}`;

(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Ensure screenshots directory exists
    await mkdir('screenshots', { recursive: true });
    const path = `screenshots/${item.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`Screenshot saved to ${path}`);
    await browser.close();
  } catch (e) {
    console.error('Error capturing screenshot:', e);
    process.exit(1);
  }
})();
