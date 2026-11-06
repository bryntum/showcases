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
