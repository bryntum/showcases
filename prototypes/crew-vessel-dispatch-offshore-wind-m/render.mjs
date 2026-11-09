/**
 * Renders the mockup's key states, light and dark, desktop and phone, into renders/. Review aid only.
 * Run from the repository root: node prototypes/crew-vessel-dispatch-offshore-wind-m/render.mjs
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const
    here   = dirname(fileURLToPath(import.meta.url)),
    root   = resolve(here, '../..'),
    out    = resolve(here, 'renders'),
    shots  = [
        ['plan', '', 1440, 900], ['drag', '', 1440, 900], ['forecast', '', 1440, 900],
        ['plan', '', 390, 844], ['drag', '', 390, 844], ['forecast', '', 390, 844],
        ['plan', 'map', 390, 844], ['forecast', 'map', 390, 844]
    ];

await mkdir(out, { recursive : true });

const
    server  = await createServer({ root, configFile : resolve(root, 'vite.config.js'), server : { port : 5199, open : false }, logLevel : 'error' }),
    browser = await chromium.launch();

await server.listen();

for (const mode of ['light', 'dark']) {
    for (const [state, tab, width, height] of shots) {
        const
            phone = width < 500,
            ctx   = await browser.newContext({ viewport : { width, height }, deviceScaleFactor : phone ? 2 : 1, colorScheme : mode }),
            errs  = [];

        await ctx.addInitScript(m => localStorage.setItem('bryntum-showcases-color-scheme', m), mode);

        const page = await ctx.newPage();

        page.on('pageerror', e => errs.push(e.message));
        page.on('console', m => m.type() === 'error' && errs.push(m.text()));
        await page.goto(`http://localhost:5199/prototypes/crew-vessel-dispatch-offshore-wind-m/?state=${state}${tab ? '&tab=' + tab : ''}`);
        await page.waitForSelector('html[data-ready=true]', { timeout : 30000 });
        await page.addStyleTag({ content : '.ow-turbine-rotor { animation : none !important; }' });
        await page.waitForTimeout(400);

        const
            name     = `${state}${tab ? '-' + tab : ''}-${phone ? 'phone' : 'desktop'}-${mode}.png`,
            overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

        await page.screenshot({ path : resolve(out, name) });
        console.log(name, errs.length ? 'ERRORS: ' + errs.join(' | ') : 'ok', overflow ? 'H-OVERFLOW' : '');
        await ctx.close();
    }
}

await browser.close();
await server.close();
