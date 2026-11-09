/**
 * The gallery screenshots of every showcase, light and dark: `npm run screenshots`.
 *
 * Starts the Vite dev server, opens each showcase in Chromium (Playwright), brings it to its screenshot state, hides
 * the Bryntum trial badge and captures the app panel. From one 2x capture per mode it writes, in gallery/, the webp
 * images at 800 and 1600 wide and the png at 1200 wide, and in public/gallery/ the social preview (1200 x 630, the
 * top of the png). The browser encodes the images, no other tools needed.
 *
 * Set VITE_AG_LICENSE_KEY (for example in .env.local) for screenshots without the AG Grid watermark.
 */
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const
    root    = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    // The panel is captured a little wider than the 1200 of the images: at 1200 the Logistics Control Tower stacks
    width   = 1210,
    height  = Math.round(width * 741 / 1200),
    scale   = 2,
    // Each showcase, the mode of its social preview, and how to bring it to its screenshot state
    showcases = [
        {
            name    : 'logistics-control-tower',
            ogMode  : 'dark',
            // The seeded simulation, paused at 09:30 (15 ticks)
            prepare : async page => {
                await page.waitForFunction(() => document.querySelector('.lct-clock-time')?.textContent === '09:30',
                    null, { polling : 'raf', timeout : 30000 });
                await page.locator('.lct-play').click();
            }
        },
        {
            name    : 'ev-operations',
            ogMode  : 'light',
            // The production line at its start, nothing to do
            prepare : async() => {}
        },
        {
            name    : 'offshore-wind-dispatch',
            ogMode  : 'light',
            // The plan at 07:40, drawn once the wave height chart has rendered
            prepare : async page => {
                await page.locator('html[data-ready="true"]').waitFor({ timeout : 30000 });
            }
        }
    ],
    // The trial badge out, the panel at the capture size
    captureCss = `
        .b-license-badge { display : none !important; }
        .sc-container > .b-outer { flex : none; width : ${width}px; height : ${height}px; }
    `;

/**
 * Scales and crops a png in the browser, returns the encoded image
 * @param {import('playwright').Page} page A page to draw in
 * @param {Buffer} png The capture
 * @param {Object} options `{ width, crop, type, quality }`, `crop` the height to keep at that width
 * @returns {Promise<Buffer>}
 */
async function encode(page, png, { width : outWidth, crop, type, quality }) {
    const dataUrl = await page.evaluate(async({ src, outWidth, crop, type, quality }) => {
        const image = new Image();

        image.src = src;
        await image.decode();

        const
            outHeight = Math.round(image.height * outWidth / image.width),
            canvas    = Object.assign(document.createElement('canvas'), { width : outWidth, height : crop ?? outHeight }),
            context   = canvas.getContext('2d');

        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, outWidth, outHeight);

        return canvas.toDataURL(type, quality);
    }, { src : `data:image/png;base64,${png.toString('base64')}`, outWidth, crop, type, quality });

    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

const
    server  = await createServer({ root, logLevel : 'warn', server : { port : 0 } }),
    browser = await chromium.launch();

try {
    await server.listen();

    const
        base   = server.resolvedUrls.local[0],
        drawer = await browser.newPage();

    for (const { name, ogMode, prepare } of showcases) {
        for (const mode of ['light', 'dark']) {
            const page = await browser.newPage({
                viewport          : { width : width + 200, height : height + 300 },
                deviceScaleFactor : scale,
                colorScheme       : mode
            });

            await page.goto(`${base}${name}/`);
            await page.addStyleTag({ content : captureCss });
            await page.locator('.sc-container > .b-outer').waitFor();
            await prepare(page);
            // Fonts, images, and the flashes and transitions of the last changes
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(1500);

            const png = await page.locator('.sc-container > .b-outer').screenshot({ animations : 'disabled' });

            await page.close();

            const images = {
                [`gallery/${name}-${mode}-1600.webp`] : { width : 1600, type : 'image/webp', quality : 0.9 },
                [`gallery/${name}-${mode}-800.webp`]  : { width : 800, type : 'image/webp', quality : 0.9 },
                [`gallery/${name}-${mode}-1200.png`]  : { width : 1200, type : 'image/png' },
                ...(mode === ogMode && {
                    [`public/gallery/og-${name}.png`] : { width : 1200, crop : 630, type : 'image/png' }
                })
            };

            for (const [file, options] of Object.entries(images)) {
                const path = resolve(root, file);

                await mkdir(dirname(path), { recursive : true });
                await writeFile(path, await encode(drawer, png, options));
                console.log(file);
            }
        }
    }
}
finally {
    await browser.close();
    await server.close();
}
