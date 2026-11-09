import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.js';

// The turbine map of Offshore Wind Dispatch: selection, hover and keyboard, linked with the Scheduler both ways

const
    url       = './offshore-wind-dispatch/',
    scheduler = page => page.locator('.ow-scheduler'),
    trip      = (page, id) => scheduler(page).locator(`.b-sch-event-wrap[data-event-id="${id}"]`),
    marker    = (page, id) => page.locator(`.ow-side .ow-marker[data-turbine="${id}"]`),
    tooltip   = page => page.locator('.ow-map-tip'),
    // The selected turbine under the map, not the tooltip's copy of it
    card      = page => page.locator('.ow-side .ow-card'),
    selectedTrip = page => page.evaluate(() => globalThis.bryntum.query('dispatchapp').scheduler.selectedEvents
        .map(each => each.id)),
    open      = async page => {
        await page.goto(url);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    };

let errors;

test.beforeEach(({ page }) => {
    errors = collectErrors(page);
});

test.afterEach(() => {
    expect(errors).toEqual([]);
});

test.describe('Offshore Wind Dispatch map selection', () => {
    test('the turbines are a store, the selection a collection, each turbine an option with aria-selected', async({ page }) => {
        await open(page);

        expect(await page.evaluate(() => {
            const map = globalThis.bryntum.query('turbinemap');

            return [map.turbines.isStore, map.turbines.count, map.selected.isCollection,
                map.selected.values.map(each => each.id)];
        })).toEqual([true, 60, true, ['T-22']]);

        await expect(page.locator('.ow-side [role="listbox"] [role="option"]')).toHaveCount(60);
        await expect(page.locator('.ow-side .ow-marker[aria-selected="true"]')).toHaveCount(1);
        await expect(marker(page, 'T-22')).toHaveAttribute('aria-selected', 'true');
    });

    test('a turbine clicked on the map selects its trip, a trip selected in the schedule rings its turbines', async({ page }) => {
        await open(page);

        await page.evaluate(() => {
            globalThis.mapChanges = [];
            globalThis.bryntum.query('turbinemap').on({
                selectionChange : ({ selection, user }) => globalThis.mapChanges.push({
                    selection : selection.map(each => each.id),
                    user
                })
            });
        });

        await marker(page, 'T-07').click();

        // The first change is the click's, the app's own redraw follows without one
        expect((await page.evaluate(() => globalThis.mapChanges))[0]).toEqual({ selection : ['T-07'], user : true });
        await expect(marker(page, 'T-07')).toHaveAttribute('aria-selected', 'true');
        await expect(marker(page, 'T-22')).toHaveAttribute('aria-selected', 'false');
        expect(await selectedTrip(page)).toEqual(['SR-1']);
        await expect(card(page)).toContainText('T-07');

        // The other way: a trip selected in the schedule selects its first turbine and rings all of its turbines
        await page.evaluate(() => globalThis.bryntum.query('dispatchapp').scheduler.selectEvent(
            globalThis.bryntum.query('dispatchapp').trips.find(each => each.id === 'BP-1')));

        await expect(marker(page, 'T-45')).toHaveAttribute('aria-selected', 'true');

        for (const id of ['T-45', 'T-46', 'T-55']) {
            await expect(marker(page, id)).toHaveClass(/\bow-m-ring\b/);
        }

        await expect(marker(page, 'T-07')).not.toHaveClass(/\bow-m-ring\b/);
    });
});

test.describe('Offshore Wind Dispatch map hover and tooltip', () => {
    test('a turbine hovered lights up its trip, a trip hovered rings its turbines', async({ page }) => {
        await open(page);

        await marker(page, 'T-46').hover();

        // The Scheduler's own event highlighting: its trip lit, the others faded
        await expect(trip(page, 'BP-1')).toHaveClass(/\bb-highlighted\b/);
        await expect(trip(page, 'SR-1')).not.toHaveClass(/\bb-highlighted\b/);
        await expect(scheduler(page).locator('.b-time-axis-sub-grid')).toHaveClass(/\bb-is-highlighting\b/);
        await expect(marker(page, 'T-46')).toHaveClass(/\bow-m-hover\b/);

        // The rich tooltip: the card's turbine and sea, its job, team and when
        await expect(tooltip(page)).toBeVisible();
        await expect(tooltip(page)).toContainText('T-46');
        await expect(tooltip(page)).toContainText('BP-1');
        await expect(tooltip(page).locator('.ow-turbine')).toBeVisible();
        await expect(tooltip(page).locator('dt', { hasText : 'When' })).toHaveCount(1);

        // Off the map, nothing is lit
        await page.mouse.move(5, 5);
        await expect(scheduler(page).locator('.b-time-axis-sub-grid')).not.toHaveClass(/\bb-is-highlighting\b/);

        // The other way: a trip hovered in the schedule rings its turbines
        await trip(page, 'SR-1').locator('.ow-trip-head').hover();

        for (const id of ['T-07', 'T-08', 'T-17']) {
            await expect(marker(page, id)).toHaveClass(/\bow-m-ring\b/);
        }

        // NT-1, the selected trip, rings its turbines again once the pointer leaves
        await page.mouse.move(5, 5);
        await expect(marker(page, 'T-23')).toHaveClass(/\bow-m-ring\b/);
        await expect(marker(page, 'T-07')).not.toHaveClass(/\bow-m-ring\b/);
    });

    test('the tooltip of a turbine no trip serves says when a trip could still reach it', async({ page }) => {
        await open(page);

        const id = await page.evaluate(() => {
            const app = globalThis.bryntum.query('dispatchapp');

            return globalThis.bryntum.query('turbinemap').turbines.records.map(each => each.id)
                .find(each => !app.trips.some(one => one.turbines.includes(each) || one.removed?.includes(each)));
        });

        await marker(page, id).hover();
        await expect(tooltip(page)).toContainText(id);
        await expect(tooltip(page)).toContainText(/Reachable \d\d:\d\d on \w+-\d|No trip left reaches it/);
    });
});

test.describe('Offshore Wind Dispatch map keyboard', () => {
    test('the map is one tab stop, the arrows move to the nearest turbine, Enter selects', async({ page }) => {
        await open(page);

        const focusable = page.locator('.ow-side .ow-marker[tabindex="0"]');

        // One tab stop, on the selected turbine
        await expect(focusable).toHaveCount(1);
        await expect(focusable).toHaveAttribute('data-turbine', 'T-22');

        await focusable.focus();
        await page.keyboard.press('ArrowRight');

        // The next turbine of its row, T-23, now the tab stop and focused, with its tooltip
        await expect(marker(page, 'T-23')).toBeFocused();
        await expect(focusable).toHaveCount(1);
        await expect(focusable).toHaveAttribute('data-turbine', 'T-23');
        await expect(tooltip(page)).toContainText('T-23');

        await page.keyboard.press('ArrowLeft');
        await expect(marker(page, 'T-22')).toBeFocused();

        // A row down, then select it
        await page.keyboard.press('ArrowDown');

        const down = await page.evaluate(() => document.activeElement.dataset.turbine);

        expect(['T-31', 'T-32', 'T-33']).toContain(down);

        await page.keyboard.press('Enter');
        await expect(marker(page, down)).toHaveAttribute('aria-selected', 'true');
        await expect(marker(page, 'T-22')).toHaveAttribute('aria-selected', 'false');
        await expect(card(page)).toContainText(down);

        // Space selects too
        await page.keyboard.press('ArrowRight');

        const next = await page.evaluate(() => document.activeElement.dataset.turbine);

        await page.keyboard.press(' ');
        await expect(marker(page, next)).toHaveAttribute('aria-selected', 'true');
    });
});
