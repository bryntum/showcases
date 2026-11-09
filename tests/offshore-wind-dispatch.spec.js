import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.js';

const
    url       = './offshore-wind-dispatch/',
    // The app's widgets, once rendered
    scheduler = page => page.locator('.ow-scheduler'),
    tray      = page => page.locator('.ow-tray'),
    trip      = (page, id) => scheduler(page).locator(`.b-sch-event-wrap[data-event-id="${id}"]`),
    // app.js sets data-ready once the plan is drawn, the fonts loaded and the wave height chart rendered
    open      = async(page, query = '') => {
        await page.goto(`${url}${query}`);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    };

let errors;

// Every test fails on a console or page error
test.beforeEach(({ page }) => {
    errors = collectErrors(page);
});

test.afterEach(() => {
    expect(errors).toEqual([]);
});

test.describe('Offshore Wind Dispatch', () => {
    test('loads without console or page errors', async({ page }) => {
        await open(page);
        await page.waitForLoadState('load');
    });

    test('renders the vessels, their trips, the weather window and the map', async({ page }) => {
        await open(page);

        await expect(scheduler(page)).toHaveClass(/\bb-scheduler\b/);
        // Four vessels and two helicopters
        await expect(scheduler(page).locator('.ow-resource')).toHaveCount(6);
        await expect(trip(page, 'NT-1')).toBeVisible();
        // The weather no-go of every vessel is a resource time range
        await expect(scheduler(page).locator('.ow-nogo')).toHaveCount(6);
        await expect(page.locator('.ow-kpis .ow-window')).toContainText('Closes 14:00');
        await expect(page.locator('.ow-side .ow-turbine')).toBeVisible();
        await expect(page.locator('.ow-side [data-turbine]')).not.toHaveCount(0);
        await expect(tray(page).locator('.ow-team')).toHaveCount(3);
    });

    test('dragging a team onto a trip previews the stop, then books it', async({ page }) => {
        await open(page);

        const
            chip   = tray(page).locator('.ow-team[data-team="F"]'),
            from   = await chip.boundingBox(),
            target = await trip(page, 'NT-1').boundingBox(),
            start  = { x : from.x + from.width / 2, y : from.y + from.height / 2 },
            end    = { x : target.x + target.width * 0.4, y : target.y + target.height / 2 };

        await page.mouse.move(start.x, start.y);
        await page.mouse.down();

        for (let step = 1; step <= 10; step++) {
            await page.mouse.move(start.x + (end.x - start.x) * step / 10, start.y + (end.y - start.y) * step / 10);
        }

        // Held over the trip: the tooltip says whether it fits before the window closes
        await expect(page.locator('.ow-drop-tip')).toContainText('T-34 fits on NT-1');
        await expect(page.locator('.ow-drop-tip')).toContainText('window closes 14:00');

        // The stop it would get is previewed as a leg of the trip
        await expect(trip(page, 'NT-1').locator('.b-nested-event .ow-seg-preview')).toContainText('T-34');

        await page.mouse.up();

        await expect(page.locator('.ow-drop-tip')).toHaveCount(0);
        await expect(chip).toHaveCount(0);
        await expect(trip(page, 'NT-1').locator('.b-nested-event[data-event-id="NT-1:T-34"]')).toBeVisible();
        expect(await page.evaluate(() => globalThis.bryntum.query('dispatchapp').scheduler.eventStore.getById('NT-1')
            .turbines)).toContain('T-34');
    });

    test('the next forecast closes the window earlier and re-plans the trips, Undo puts them back', async({ page }) => {
        await open(page);

        // Each trip's legs, the nested events: departure and stops
        const
            legsOf = () => page.evaluate(() => globalThis.bryntum.query('dispatchapp').trips.map(each =>
                `${each.id} ${each.departs} ${each.children.map(leg => leg.id).join(',')}`)),
            before = await legsOf();

        await page.locator('.ow-forecast-button').click();

        const notice = page.locator('.ow-toast');

        await expect(notice).toBeVisible();
        await expect(notice).toContainText('Forecast 08:00');
        await expect(page.locator('.ow-kpis .ow-window')).toHaveClass(/\bow-window-short\b/);
        await expect(page.locator('.ow-kpis .ow-window')).toContainText('was 14:00');

        const changed = await page.evaluate(() => globalThis.bryntum.query('dispatchapp').forecastPlanner.changes.length);

        expect(changed).toBeGreaterThan(0);
        expect(await legsOf()).not.toEqual(before);

        await notice.getByRole('button', { name : 'Undo' }).click();

        await expect(notice).toBeHidden();
        expect(await page.evaluate(() => globalThis.bryntum.query('dispatchapp').trips
            .filter(each => each.change).map(each => each.id))).toEqual([]);
        expect(await legsOf()).toEqual(before);
        await expect(scheduler(page).locator('.b-sch-dependency.ow-dep:not(.b-click-area)')).toHaveCount(1);
    });

});

test.describe('Offshore Wind Dispatch trips', () => {
    test('a trip holds its legs as nested events, the dependency runs into one stop', async({ page }) => {
        await open(page);

        // The legs are child events of the trip, drawn inside it by the NestedEvents feature
        const legs = trip(page, 'NT-1').locator('.b-nested-events-container .b-nested-event');

        await expect(legs.locator('.ow-seg-stop')).not.toHaveCount(0);
        await expect(legs.locator('.ow-seg-transit')).not.toHaveCount(0);
        await expect(trip(page, 'NT-1').locator('.b-nested-event[data-event-id="NT-1:T-22"]')).toContainText('T-22');

        // Drawn by the Dependencies feature, from the helicopter's trip into the T-45 stop of BP-1
        await expect(scheduler(page).locator('.b-sch-dependency.ow-dep:not(.b-click-area)')).toHaveCount(1);
        expect(await page.evaluate(() => {
            const { fromEvent, toEvent } = globalThis.bryntum.query('dispatchapp').scheduler.dependencyStore
                .getById('hv-t45');

            return [fromEvent.id, toEvent.id, toEvent.parent.id];
        })).toEqual(['H2-1', 'BP-1:T-45', 'BP-1']);
    });

    test('a trip cannot be dragged once it has left port', async({ page }) => {
        await open(page);

        const message = await page.evaluate(() => {
            const
                { scheduler } = globalThis.bryntum.query('dispatchapp'),
                gone          = scheduler.eventStore.getById('SR-1');

            return scheduler.validateTripDrag({ eventRecords : [gone], startDate : gone.startDate }).message;
        });

        expect(message).toMatch(/left port/);
    });
});

test.describe('Offshore Wind Dispatch on a phone', () => {
    test.use({ viewport : { width : 390, height : 844 } });

    test('shows the schedule and the map as tabs, without horizontal scroll', async({ page }) => {
        await open(page);

        await expect(page.locator('.ow-app')).toHaveClass(/\bow-phone\b/);
        await expect(scheduler(page)).toBeVisible();
        await expect(page.locator('.ow-side')).toBeHidden();

        await page.locator('.ow-tabs').getByRole('button', { name : 'Map' }).click();

        await expect(page.locator('.ow-side')).toBeVisible();
        await expect(scheduler(page)).toBeHidden();

        const { scrollWidth, clientWidth } = await page.evaluate(() => {
            const { scrollWidth, clientWidth } = document.documentElement;

            return { scrollWidth, clientWidth };
        });

        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
});
