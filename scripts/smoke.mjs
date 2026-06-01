import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.big-sim', { timeout: 10000 });

// Avvia simulazione
await page.click('.big-sim');
await page.waitForSelector('.standings-row', { timeout: 10000 });
await page.waitForTimeout(4000); // attendi animazione round

// Verifica contenuto
const topTeam = await page.textContent('.standings-row:first-child .team-name');
const topProb = await page.textContent('.standings-row:first-child .prob');
const champion = await page.textContent('.badge');

// Attiva Italia e ri-simula
await page.click('.slider-toggle');
await page.click('.resim');
await page.waitForTimeout(3000);
const italyVisible = await page.locator('.standings-row.italy').count();

await page.screenshot({ path: 'scripts/screenshot.png', fullPage: true });
await browser.close();

console.log('Top team:', topTeam, topProb);
console.log('Sample badge:', champion);
console.log('Italy row visible after toggle:', italyVisible > 0);
console.log('Console errors:', errors.length ? errors : 'NONE');
