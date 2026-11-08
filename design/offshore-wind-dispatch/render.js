/**
 * Renders the design mockup's key states, light and dark, desktop and phone, into renders/:
 * `node design/offshore-wind-dispatch/render.js` from the repository root.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const
    here    = dirname(fileURLToPath(import.meta.url)),
    root    = resolve(here, '../..'),
    out     = resolve(here, 'renders'),
    desktop = { width : 1440, height : 900, deviceScaleFactor : 1 },
    phone   = { width : 390, height : 844, deviceScaleFactor : 2, isMobile : true, hasTouch : true },
    shots   = [
        ...['plan', 'drag', 'forecast'].flatMap(state => ['light', 'dark'].map(mode => ({
            file : `desktop-${state}-${mode}`, state, mode, view : desktop
        }))),
        { file : 'phone-plan-light', state : 'plan', mode : 'light', view : phone },
        { file : 'phone-plan-dark', state : 'plan', mode : 'dark', view : phone },
        { file : 'phone-forecast-light', state : 'forecast', mode : 'light', view : phone },
        { file : 'phone-drag-map-dark', state : 'drag', mode : 'dark', view : phone, tab : 'map' },
        { file : 'turbine-light', state : 'plan', mode : 'light', view : { ...desktop, deviceScaleFactor : 3 }, part : '.ow-card' },
        { file : 'turbine-dark', state : 'plan', mode : 'dark', view : { ...desktop, deviceScaleFactor : 3 }, part : '.ow-card' }
    ];

const
    server  = await createServer({ root, logLevel : 'warn', server : { port : 0 } }),
    browser = await chromium.launch();

try {
    await server.listen();
    await mkdir(out, { recursive : true });

    const base = server.resolvedUrls.local[0];

    for (const { file, state, mode, view, tab, part } of shots) {
        const { width, height, ...rest } = view;
        const page = await browser.newPage({ viewport : { width, height }, colorScheme : mode, ...rest });

        await page.goto(`${base}design/offshore-wind-dispatch/?state=${state}${tab ? `&tab=${tab}` : ''}`);
        await page.waitForSelector('html[data-ready]');
        await page.addStyleTag({ content : '.b-license-badge { display : none !important; }' });
        // Phones open the schedule at 07:00, an hour into the day
        await page.evaluate(() => document.querySelector('.ow-schedule-body').scrollLeft = window.innerWidth < 760 ? 44 : 0);
        await page.waitForTimeout(400);

        const target = part ? page.locator(part) : page;

        await target.screenshot({ path : resolve(out, `${file}.png`), animations : 'disabled' });
        console.log(`renders/${file}.png`);
        await page.close();
    }
}
finally {
    await browser.close();
    await server.close();
}
