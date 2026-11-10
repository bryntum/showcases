import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.js';

test.describe('Gallery', () => {
    let errors;

    test.beforeEach(async({ page }) => {
        errors = collectErrors(page);
        await page.goto('./');
    });

    test('loads without console or page errors', async({ page }) => {
        await expect(page.getByRole('heading', { level : 1 })).toBeVisible();
        await page.waitForLoadState('load');

        expect(errors).toEqual([]);
    });

    test('features the latest showcase, Offshore Wind Dispatch', async({ page }) => {
        const featured = page.getByRole('region', { name : 'Offshore Wind Dispatch' });

        await expect(featured.getByRole('heading', { level : 2, name : 'Offshore Wind Dispatch' })).toBeVisible();
        await expect(featured.getByRole('list', { name : 'Built with' }).getByRole('listitem'))
            .toHaveText(['Scheduler', 'AG Charts']);
        await expect(featured.getByRole('link', { name : 'Live demo' }))
            .toHaveAttribute('href', './offshore-wind-dispatch/');
        await expect(featured.getByRole('link', { name : 'Source' }))
            .toHaveAttribute('href', 'https://github.com/bryntum/showcases/tree/main/offshore-wind-dispatch');
        await expect(page.getByRole('link', { name : 'Try the latest demo' }))
            .toHaveAttribute('href', './offshore-wind-dispatch/');
        // Every showcase has its card, the latest first
        await expect(page.locator('[data-cards] .card h3')).toHaveText(['Offshore Wind Dispatch', 'Logistics Control Tower',
            'EV Operations']);
    });

    test('shows the EV Operations card', async({ page }) => {
        const card = page.locator('[data-cards] .card').filter({ hasText : 'EV Operations' });

        await expect(card).toBeVisible();
        await expect(card.getByRole('heading', { name : 'EV Operations' })).toBeVisible();
    });

    test('the card\'s Live demo link opens the showcase', async({ page }) => {
        const card = page.locator('[data-cards] .card').filter({ hasText : 'EV Operations' });

        await card.getByRole('link', { name : 'Live demo' }).click();

        await expect(page).toHaveURL(/\/showcases\/ev-operations\/$/);
        await expect(page.locator('.b-scheduler').first()).toBeVisible();
    });

    test('the Logistics Control Tower card opens the showcase', async({ page }) => {
        const card = page.locator('[data-cards] .card').filter({ hasText : 'Logistics Control Tower' });

        await expect(card.getByRole('heading', { name : 'Logistics Control Tower' })).toBeVisible();
        await card.getByRole('link', { name : 'Live demo' }).click();

        await expect(page).toHaveURL(/\/showcases\/logistics-control-tower\/$/);
        await expect(page.locator('.b-scheduler').first()).toBeVisible();
        await expect(page.locator('.ag-root').first()).toBeVisible();
    });

    test('shows the three how built cards', async({ page }) => {
        const section = page.getByRole('region', { name : /Built the way you'd build it/ });

        for (const name of ['Public npm packages', 'Fully front-end', 'Source on GitHub']) {
            await expect(section.getByRole('heading', { level : 3, name })).toBeVisible();
        }

        await expect(section.getByRole('link', { name : /gantt-enterprise on npm/ }))
            .toHaveAttribute('href', 'https://www.npmjs.com/package/@bryntum/gantt-enterprise');
        await expect(section.getByRole('link', { name : /ag-grid-enterprise on npm/ }))
            .toHaveAttribute('href', 'https://www.npmjs.com/package/ag-grid-enterprise');
        await expect(section.getByRole('link', { name : /ag-charts-community on npm/ }))
            .toHaveAttribute('href', 'https://www.npmjs.com/package/ag-charts-community');
        await expect(section.getByRole('link', { name : 'Source on GitHub' }))
            .toHaveAttribute('href', 'https://github.com/bryntum/showcases');
    });
});

/**
 * In the page: a point where the `upper` image covers the `lower` one, and one where the `lower` one shows
 * @param {String[]} selectors The `lower` and `upper` images
 * @returns {{ overlap : Number[], visible : Number[] }}
 */
function overlapOf([lower, upper]) {
    const
        [below, above]               = [lower, upper].map(selector => document.querySelector(selector)),
        { left, top, width, height } = below.getBoundingClientRect(),
        found                        = {};

    for (let fy = 0.05; fy < 1; fy += 0.05) {
        for (let fx = 0.05; fx < 1; fx += 0.05) {
            const
                point = [left + width * fx, top + height * fy],
                hit   = document.elementsFromPoint(...point);

            if (hit[0] === above && hit.includes(below)) {
                found.overlap ??= point;
            }
            else if (hit[0] === below) {
                found.visible ??= point;
            }
        }
    }

    return found;
}

// The hero's stack of component tiles
test.describe('Gallery hero', () => {
    test.beforeEach(async({ page }) => {
        await page.goto('./');
    });

    test('the hero stack shows the seven components, in the dark screenshots in dark mode', async({ page }) => {
        const
            stack = page.getByRole('img', { name : /Bryntum Gantt.*AG Studio/ }),
            tiles = stack.locator('.tile');

        await expect(tiles).toHaveCount(7);
        await expect(tiles.locator('.chip')).toHaveText(['Gantt', 'Calendar', 'Task Board', 'AG Studio', 'Scheduler',
            'AG Charts', 'AG Grid']);

        // The toggle picks the mode the page is not in, then the tiles show its screenshots
        const
            toggle = page.locator('.sc-scheme-toggle'),
            grid   = stack.locator('[data-tile="ag-grid"] img');

        if (await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme) !== 'dark') {
            await toggle.click();
        }

        await expect.poll(() => grid.evaluate(img => img.currentSrc)).toMatch(/hero-ag-grid-dark/);

        await toggle.click();
        await expect.poll(() => grid.evaluate(img => img.currentSrc)).toMatch(/hero-ag-grid-light/);
    });

    test('hovering the AG Grid tile bands the row under the pointer', async({ page }) => {
        const
            tile = page.locator('[data-tile="ag-grid"]'),
            box  = await tile.locator('img').boundingBox();

        // The highest tile, so its middle is one of its rows. It lifts on hover, the second move is on the lifted tile
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 4);

        const band = tile.locator('.hot[data-kind="row"][data-on] .spot');

        await expect(band).toBeVisible();
        await expect.poll(() => band.evaluate(spot => getComputedStyle(spot).opacity)).toBe('1');
    });

    test('hovering a tile brings it to the front, the Scheduler above AG Grid', async({ page }) => {
        // No lean nor transitions, so the tiles stay where they are measured
        await page.emulateMedia({ reducedMotion : 'reduce' });
        await page.reload();

        const
            points = await page.evaluate(overlapOf, ['[data-tile="scheduler"] img', '[data-tile="ag-grid"] img']),
            topAt  = point => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.tile')?.dataset.tile,
                point);

        expect(points.overlap).toBeDefined();
        expect(await topAt(points.overlap)).toBe('ag-grid');

        await page.mouse.move(...points.visible);
        await expect.poll(() => topAt(points.overlap)).toBe('scheduler');

        // Settles back when the pointer leaves
        await page.mouse.move(1, 1);
        await expect.poll(() => topAt(points.overlap)).toBe('ag-grid');
    });

    test('the hero screenshots cannot be dragged', async({ page }) => {
        const images = page.locator('.hero-stack img');

        await expect(images).toHaveCount(7);
        expect(await images.evaluateAll(all => all.map(image => image.getAttribute('draggable'))))
            .toEqual(Array(7).fill('false'));
    });
});

// The customer logos between the hero and the featured showcase
test.describe('Gallery customers', () => {
    test('shows the thirteen customer logos once to assistive technology, the loop copy hidden', async({ page }) => {
        await page.goto('./');

        const strip = page.getByRole('region', { name : 'Trusted by teams at' });

        await expect(strip.getByRole('img')).toHaveCount(13);
        await expect(strip.getByRole('img', { name : 'Airbus' })).toBeAttached();
        await expect(strip.locator('.logos')).toHaveCount(2);
        await expect(strip.locator('.logos').nth(1)).toHaveAttribute('aria-hidden', 'true');
        await expect(strip.locator('.logos').nth(1).locator('.logo')).toHaveCount(13);
        // Masks of a token colour, not images
        expect(await strip.locator('.logo').first().evaluate(logo => getComputedStyle(logo).maskImage))
            .toMatch(/^url\(/);
    });

    test('with reduced motion the logos stand still, wrapped, without the copy', async({ page }) => {
        await page.emulateMedia({ reducedMotion : 'reduce' });
        await page.goto('./');

        const lists = page.locator('.trusted .logos');

        await expect(lists.nth(1)).toBeHidden();
        expect(await lists.first().evaluate(list => getComputedStyle(list).animationName)).toBe('none');
    });
});

// Phones and touch tablets: a still picture, or none
test.describe('Gallery hero on touch', () => {
    test.use({ viewport : { width : 768, height : 1024 }, isMobile : true, hasTouch : true });

    test('the stack lies flat and does not follow the pointer', async({ page }) => {
        await page.goto('./');

        const
            stack = page.locator('.hero-stack'),
            box   = await stack.boundingBox();

        expect(await page.locator('.stack-scene').evaluate(scene => getComputedStyle(scene).transform)).toBe('none');

        await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4);
        await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);

        expect(await stack.evaluate(element => element.style.getPropertyValue('--px'))).toBe('');
        await expect(page.locator('.hero-stack .hot')).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(768);
    });
});

test.describe('Gallery on a phone', () => {
    test.use({ viewport : { width : 390, height : 844 }, isMobile : true, hasTouch : true });

    test('hides the stack, keeps the call to action in view and the page as wide as the screen', async({ page }) => {
        await page.goto('./');

        await expect(page.locator('.hero-stack')).toBeHidden();
        await expect(page.getByRole('link', { name : 'Try the latest demo' })).toBeInViewport();
        await expect(page.getByRole('region', { name : 'Trusted by teams at' }).getByRole('img')).toHaveCount(13);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    });
});
