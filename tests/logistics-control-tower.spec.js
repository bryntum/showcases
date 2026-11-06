import { expect, test } from '@playwright/test';
import { agGridLicenseNotice, collectErrors } from './errors.js';

const
    url      = './logistics-control-tower/',
    // A shipment with a dock slot booked at load, the same in every run (seeded data)
    bookedId = 'SHP-10069',
    otherId  = 'SHP-10061',
    // The quick search narrows the grid to SHP-10060 - SHP-10069, so both rows render
    search   = 'SHP-1006',
    // The app's widgets, once rendered
    grid     = page => page.locator('.lct-grid-panel .ag-root'),
    schedule = page => page.locator('.b-dock-schedule');

// Waits for both views, pauses the simulation, so the layout holds still, and searches the shipments
async function openPaused(page) {
    await page.goto(url);
    await expect(grid(page).locator('.ag-row').first()).toBeVisible();
    await expect(schedule(page).locator('.b-sch-event').first()).toBeVisible();
    await page.locator('.lct-controls').getByRole('button', { name : 'Pause' }).click();
    await expect(page.locator('.lct-controls').getByRole('button', { name : 'Play' })).toBeVisible();
    await page.getByPlaceholder('Search shipments').fill(search);
    await expect(grid(page).locator(`.ag-row[row-id="${bookedId}"]`)).toBeVisible();
}

test.describe('Logistics Control Tower', () => {
    let errors;

    test.beforeEach(({ page }) => {
        // AG Grid runs without a licence key in the tests and logs its licence notice, nothing else is tolerated
        errors = collectErrors(page, { ignore : agGridLicenseNotice });
    });

    test('loads without console or page errors', async({ page }) => {
        await page.goto(url);
        await expect(grid(page).locator('.ag-row').first()).toBeVisible();
        await page.waitForLoadState('load');

        expect(errors).toEqual([]);
    });

    test('renders the shipment grid and the dock schedule', async({ page }) => {
        await openPaused(page);

        await expect(grid(page)).toBeVisible();
        await expect(page.locator('.lct-grid-panel .lct-carrier-group').first()).toBeVisible();
        await expect(page.locator('.lct-grid-panel .ag-status-bar')).toContainText(/Total Rows\s*:\s*2,000/);
        await expect(schedule(page)).toHaveClass(/\bb-scheduler\b/);
        await expect(schedule(page).locator('.lct-dock-name').first()).toHaveText('Door 01');
    });

    test('the simulation ticks the clock until paused', async({ page }) => {
        await page.goto(url);

        const clock = page.locator('.lct-clock-time');

        await expect(clock).toHaveText(/^\d\d:\d\d$/);

        const initial = await clock.textContent();

        await expect.poll(() => clock.textContent(), { message : 'The clock moves on' }).not.toBe(initial);

        await page.locator('.lct-controls').getByRole('button', { name : 'Pause' }).click();

        await expect(page.locator('.lct-controls').getByRole('button', { name : 'Play' })).toBeVisible();
        expect(await page.evaluate(() => globalThis.bryntum.query('controltowerapp').simulator.isRunning)).toBe(false);
    });

    test('selecting a row selects its slot and the other way round', async({ page }) => {
        await openPaused(page);

        const row = grid(page).locator(`.ag-row[row-id="${bookedId}"]`);

        await row.locator('[col-id="ref"]').click();
        await expect(schedule(page).locator(`.b-sch-event-wrap[data-event-id="${bookedId}"]`)).toHaveClass(/\bb-selected\b/);

        // Another slot on the schedule selects its row
        await schedule(page).locator(`.b-sch-event-wrap[data-event-id="${otherId}"]`).click();
        await expect(grid(page).locator(`.ag-row[row-id="${otherId}"]`)).toHaveClass(/\bag-row-selected\b/);
    });

    test('the context menu offers book, unbook and expedite', async({ page }) => {
        await openPaused(page);

        await grid(page).locator(`.ag-row[row-id="${bookedId}"] [col-id="status"]`).click({ button : 'right' });

        const menu = page.locator('.ag-menu');

        await expect(menu.getByText('Book dock')).toBeVisible();
        await expect(menu.getByText('Unbook')).toBeVisible();
        await expect(menu.getByText('Expedite')).toBeVisible();

        // Unbooking removes the slot and puts the shipment on hold
        await menu.getByText('Unbook').click();
        await expect(schedule(page).locator(`.b-sch-event-wrap[data-event-id="${bookedId}"]`)).toHaveCount(0);
        await expect(grid(page).locator(`.ag-row[row-id="${bookedId}"] [col-id="dockName"]`)).toHaveText('On hold');
    });
});

test.describe('Logistics Control Tower theme colours', () => {
    test('the grid follows light and dark mode', async({ page }) => {
        const background = async colorScheme => {
            await page.emulateMedia({ colorScheme });
            await page.goto(url);
            await expect(grid(page)).toBeVisible();

            return page.locator('.lct-grid-panel .ag-root-wrapper').evaluate(element => getComputedStyle(element).backgroundColor);
        };

        const
            light = await background('light'),
            dark  = await background('dark');

        expect(light).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
        expect(dark, 'the grid follows the scheme').not.toBe(light);
    });
});

test.describe('Logistics Control Tower on a phone', () => {
    test.use({ viewport : { width : 390, height : 844 } });

    test('stacks the views without horizontal scroll, the title in full', async({ page }) => {
        await page.goto(url);
        await expect(grid(page).locator('.ag-row').first()).toBeVisible();
        await expect(page.locator('.lct-app')).toHaveClass(/\blct-compact\b/);

        const { scrollWidth, clientWidth } = await page.evaluate(() => {
            const { scrollWidth, clientWidth } = document.documentElement;

            return { scrollWidth, clientWidth };
        });

        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

        const
            title     = page.getByRole('navigation', { name : 'Breadcrumb' })
                .getByRole('heading', { level : 1, name : 'Logistics Control Tower' }),
            titleBox  = await title.boundingBox(),
            toggleBox = await page.locator('.sc-header .sc-scheme-toggle').boundingBox();

        expect(await title.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(toggleBox.x);
    });
});
