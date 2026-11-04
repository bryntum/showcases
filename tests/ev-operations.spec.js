import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.js';

const
    // The view switch's buttons, by their labels at desktop width
    tabs = {
        service : 'Service & charging',
        program : 'Vehicle program'
    },
    view = (page, ref) => page.locator(`.ev-views [data-ref="${ref}"]`);

test.describe('EV Operations', () => {
    let errors;

    test.beforeEach(async({ page }) => {
        errors = collectErrors(page);
        await page.goto('./ev-operations/');
        // The Production line view renders its bars once the data has loaded
        await expect(view(page, 'production').locator('.b-sch-event').first()).toBeVisible();
    });

    test('loads without console or page errors', async({ page }) => {
        await page.waitForLoadState('load');

        expect(errors).toEqual([]);
    });

    test('the Production line view renders a Scheduler with bars', async({ page }) => {
        const production = view(page, 'production');

        await expect(production).toHaveClass(/\bb-scheduler\b/);
        await expect(production.locator('.b-sch-event')).not.toHaveCount(0);
        await expect(page.locator('.ev-heading')).toContainText('Plant 3');
    });

    test('the view switch shows the Service and Program views', async({ page }) => {
        const viewSwitch = page.locator('.ev-view-switch');

        await viewSwitch.getByRole('button', { name : tabs.service }).click();

        await expect(view(page, 'service')).toBeVisible();
        await expect(view(page, 'service')).toHaveClass(/\bb-scheduler\b/);
        await expect(view(page, 'service').locator('.b-sch-event').first()).toBeVisible();
        await expect(view(page, 'production')).toBeHidden();
        await expect(page.locator('.ev-heading')).toContainText('Service Center North');

        await viewSwitch.getByRole('button', { name : tabs.program }).click();

        await expect(view(page, 'program')).toBeVisible();
        await expect(view(page, 'program')).toHaveClass(/\bb-gantt\b/);
        await expect(view(page, 'program').locator('.b-gantt-task').first()).toBeVisible();
        await expect(view(page, 'service')).toBeHidden();
        await expect(page.locator('.ev-heading')).toContainText('Program NV9');
    });

    test('Simulate advances the simulated clock', async({ page }) => {
        const
            pill    = view(page, 'production').locator('.ev-now-pill'),
            initial = await pill.textContent();

        await page.locator('.ev-controls').getByRole('button', { name : 'Simulate' }).click();

        await expect.poll(() => pill.textContent(), { message : 'The now pill moves on' }).not.toBe(initial);
        await expect(page.locator('.ev-controls').getByRole('button', { name : 'Pause' })).toBeVisible();
    });

    test('the light / dark toggle switches the scheme and keeps it after a reload', async({ page }) => {
        const
            root   = page.locator('html'),
            toggle = page.locator('.sc-header .sc-scheme-toggle'),
            scheme = () => root.evaluate(element => getComputedStyle(element).colorScheme);

        // The default context prefers light
        await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');

        await toggle.click();

        await expect(root).toHaveAttribute('data-theme', 'dark');
        await expect.poll(scheme).toBe('dark');
        await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');

        await page.reload();

        await expect(root).toHaveAttribute('data-theme', 'dark');
        await expect.poll(scheme).toBe('dark');
        await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    });
});

test.describe('EV Operations on a phone', () => {
    test.use({ viewport : { width : 390, height : 844 } });

    test('has no horizontal scroll at 390px', async({ page }) => {
        await page.goto('./ev-operations/');
        await expect(view(page, 'production').locator('.b-sch-event').first()).toBeVisible();
        // Compact mode has taken effect, the short tab labels show
        await expect(page.locator('.ev-view-switch').getByRole('button', { name : 'Production', exact : true }))
            .toBeVisible();

        const { scrollWidth, clientWidth } = await page.evaluate(() => {
            const { scrollWidth, clientWidth } = document.documentElement;

            return { scrollWidth, clientWidth };
        });

        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
});
