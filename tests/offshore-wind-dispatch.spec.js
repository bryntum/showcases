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

});

test.describe('Offshore Wind Dispatch, a team held over a trip', () => {
    test('a team can be held over a trip and booked from the keyboard', async({ page }) => {
        await open(page);

        const tip = page.locator('.ow-drop-tip');

        await tray(page).locator('.ow-team[data-team="F"]').focus();
        await page.keyboard.press('Enter');

        // Held over the selected trip, NT-1, with the stop it would get previewed
        await expect(tip).toContainText('T-34 fits on NT-1');
        await expect(tip).toHaveAttribute('aria-live', 'polite');
        await expect(trip(page, 'NT-1').locator('.ow-seg-preview')).toContainText('T-34');

        // The arrows move it to another trip, and back
        await page.keyboard.press('ArrowRight');
        await expect(tip).not.toContainText('on NT-1');
        await expect(trip(page, 'NT-1').locator('.ow-seg-preview')).toHaveCount(0);
        await page.keyboard.press('ArrowLeft');
        await expect(tip).toContainText('T-34 fits on NT-1');

        // Escape puts it back, the chip keeps the focus
        await page.keyboard.press('Escape');
        await expect(tip).toHaveCount(0);
        await expect(tray(page).locator('.ow-team[data-team="F"]')).toBeFocused();

        // Space holds it again, Enter books it
        await page.keyboard.press(' ');
        await expect(tip).toContainText('T-34 fits on NT-1');
        await page.keyboard.press('Enter');

        await expect(tip).toHaveCount(0);
        await expect(tray(page).locator('.ow-team[data-team="F"]')).toHaveCount(0);
        await expect(trip(page, 'NT-1').locator('.b-nested-event[data-event-id="NT-1:T-34"]')).toBeVisible();
    });

    test('while a team is held over a trip, the map dims every turbine it cannot reach', async({ page }) => {
        await open(page, '?state=drag');

        const marker = id => page.locator(`.ow-side [data-turbine="${id}"]`);

        await expect(page.locator('.ow-drop-tip')).toContainText('T-34 fits on NT-1');

        const statuses = await page.evaluate(() => {
            const
                app   = globalThis.bryntum.query('dispatchapp'),
                own   = new Set(app.drop.trip.turbines),
                reach = app.drop.reach;

            // Turbines on other trips, outside the reach of the held trip
            return app.trips.filter(each => each !== app.drop.trip).flatMap(each => each.turbines)
                .filter(id => !reach.has(id) && !own.has(id));
        });

        expect(statuses.length).toBeGreaterThan(0);

        for (const id of statuses) {
            await expect(marker(id)).toHaveClass(/\bow-m-dim\b/);
        }

        // The held trip's own stops and the turbines it can reach are not dimmed
        for (const id of await page.evaluate(() => globalThis.bryntum.query('dispatchapp').drop.trip.turbines)) {
            await expect(marker(id)).not.toHaveClass(/\bow-m-dim\b/);
        }

        await expect(page.locator('.ow-side .ow-m-reach')).not.toHaveCount(0);
        await expect(page.locator('.ow-side .ow-m-reach.ow-m-dim')).toHaveCount(0);
    });

    test('Escape puts back a team held by the URL state', async({ page }) => {
        await open(page, '?state=drag');

        await expect(page.locator('.ow-drop-tip')).toContainText('T-34 fits on NT-1');
        await expect(page.locator('.ow-drag-chip')).toHaveCount(1);
        await expect(trip(page, 'NT-1').locator('.ow-seg-preview')).toHaveCount(1);

        await page.keyboard.press('Escape');

        await expect(page.locator('.ow-drop-tip')).toHaveCount(0);
        await expect(page.locator('.ow-drag-chip')).toHaveCount(0);
        await expect(trip(page, 'NT-1').locator('.ow-seg-preview')).toHaveCount(0);
        await expect(tray(page).locator('.ow-team[data-team="F"]')).toHaveCount(1);
    });
});

// A team held over a trip is checked again whenever the plan or the forecast changes, never left showing an old check.
// heldState: the held team's check against a fresh one, the window close it shows against the trip's window now, and
// the trip's status against the one the plan alone gives, with the previewed stop taken off and put back
const heldState = page => page.evaluate(() => {
    const
        app                 = globalThis.bryntum.query('dispatchapp'),
        { trip, team, job } = app.drop,
        close               = app.dispatch.closeOf(trip.resource),
        pad                 = value => String(value).padStart(2, '0'),
        state               = {
            held      : app.drop.result,
            fresh     : app.checkDrop(trip, team, job),
            heldClose : app.drop.close,
            close,
            closeText : `${pad(Math.floor(close / 60))}:${pad(close % 60)}`,
            previews  : trip.children.filter(leg => leg.preview).length,
            status    : trip.status
        };

    app.clearPreview();
    app.evaluate();
    state.planStatus = trip.status;
    app.holdPreview(team.id, trip);

    return state;
});

test.describe('Offshore Wind Dispatch, a held team after a new forecast', () => {
    test('a new forecast checks the held team again, the tooltip shows the new window', async({ page }) => {
        await open(page, '?state=drag');

        const tip = page.locator('.ow-drop-tip');

        await expect(tip).toContainText('window closes 14:00');

        await page.locator('.ow-forecast-button').click();

        const state = await heldState(page);

        // The window closes earlier, the held team was checked against it
        expect(state.close).toBeLessThan(14 * 60);
        expect(state.heldClose).toBe(state.close);
        expect(state.held).toEqual(state.fresh);
        expect(state.previews).toBe(1);
        expect(state.status).toBe(state.planStatus);
        await expect(tip).toContainText(`window closes ${state.closeText}`);
        await expect(tip).toContainText(state.fresh.valid ? 'fits on' : 'does not fit on');
        await expect(page.locator('.ow-drag-chip')).toHaveCount(1);
    });

    test('Undo of the forecast checks the held team again, the plan comes back without the previewed stop', async({ page }) => {
        await open(page);

        const legsOf = () => page.evaluate(() => globalThis.bryntum.query('dispatchapp').trips.map(each =>
            `${each.id} ${each.departs} ${each.children.filter(leg => !leg.preview).map(leg => leg.id).join(',')}`));

        const before = await legsOf();

        await page.locator('.ow-forecast-button').click();
        await page.evaluate(() => {
            const app = globalThis.bryntum.query('dispatchapp');

            app.drag.showHeld('F', app.dropTargets()[0]);
        });
        await expect(page.locator('.ow-drop-tip')).toBeVisible();

        await page.locator('.ow-toast').getByRole('button', { name : 'Undo' }).click();

        const state = await heldState(page);

        expect(state.heldClose).toBe(state.close);
        expect(state.held).toEqual(state.fresh);
        expect(state.previews).toBe(1);
        await expect(page.locator('.ow-drop-tip')).toContainText(`window closes ${state.closeText}`);

        // Put back, the trips are as before the forecast
        await page.keyboard.press('Escape');
        expect(await legsOf()).toEqual(before);
    });
});

test.describe('Offshore Wind Dispatch, a held team while the plan moves', () => {
    // Every vessel row in view, so the forecast's review does not scroll the trip from under a still pointer
    test.use({ viewport : { width : 1440, height : 1100 } });

    test('a forecast during a pointer drag checks the trip under the pointer again', async({ page }) => {
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

        await expect(page.locator('.ow-drop-tip')).toContainText('window closes 14:00');

        // The forecast arrives while the pointer is still
        await page.evaluate(() => globalThis.bryntum.query('dispatchapp').applyForecast());

        const state = await heldState(page);

        expect(state.held).toEqual(state.fresh);
        await expect(page.locator('.ow-drop-tip')).toContainText(`window closes ${state.closeText}`);

        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(page.locator('.ow-drop-tip')).toHaveCount(0);
    });

    test('a trip dragged while a team is held over it is checked again from its new departure', async({ page }) => {
        await open(page, '?state=drag');

        const [departs, wanted] = await page.evaluate(() => {
            const
                app  = globalThis.bryntum.query('dispatchapp'),
                trip = app.drop.trip,
                // An hour later, late enough for the previewed stop to bring it back after the window
                to   = trip.departs + 60;

            // As EventDrag leaves it, then the app's afterEventDrop listener
            trip.startDate = new Date(trip.startDate.getTime() + 60 * 60000);
            app.onTripDrop({ eventRecords : [trip], valid : true });

            return [trip.departs, to];
        });

        expect(departs).toBe(wanted);

        const state = await heldState(page);

        // Checked from the new departure, the trip's status from the plan, not from the stop previewed on it
        expect(state.held).toEqual(state.fresh);
        expect(state.previews).toBe(1);
        expect(state.status).toBe(state.planStatus);
    });

    test('held from the keyboard over a trip the forecast moves away, the arrows step through the trips left', async({ page }) => {
        await open(page);

        await tray(page).locator('.ow-team[data-team="F"]').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.ow-drop-tip')).toContainText('on NT-1');

        await page.evaluate(() => globalThis.bryntum.query('dispatchapp').applyForecast());

        const targets = await page.evaluate(() => {
            const app = globalThis.bryntum.query('dispatchapp');

            return {
                stepped : app.drag.keyboard.trips.map(each => each.id),
                fresh   : app.dropTargets().map(each => each.id)
            };
        });

        // The trips the keys step through are those still on the day after the forecast
        expect(targets.stepped).toEqual(targets.fresh);

        await page.keyboard.press('ArrowRight');

        const state = await heldState(page);

        expect(state.held).toEqual(state.fresh);
        expect(targets.fresh).toContain(await page.evaluate(() => globalThis.bryntum.query('dispatchapp').drop.trip.id));
    });
});

test.describe('Offshore Wind Dispatch weather windows', () => {
    for (const [query, hour] of [['', 16], ['?state=forecast', 14]]) {
        const title = `the helicopter no-go starts at the first hour over 20 m/s${query ? ', 08:00 forecast' : ''}`;

        test(title, async({ page }) => {
            await open(page, query);

            const { wind, dayStart, starts } = await page.evaluate(() => {
                const app = globalThis.bryntum.query('dispatchapp');

                return {
                    wind     : app.dispatch.forecast.wind,
                    dayStart : app.dispatch.day.dayStart,
                    starts   : app.scheduler.resourceTimeRangeStore.records
                        .filter(range => range.resource?.mode === 'heli' && !String(range.id).startsWith('ghost-'))
                        .map(range => range.startDate.getHours() + range.startDate.getMinutes() / 60)
                };
            });

            const first = wind.findIndex(value => value > 20);

            // The hour before is within the limit, the hour it starts is over it
            expect(dayStart + first).toBe(hour);
            expect(wind[first - 1]).toBeLessThanOrEqual(20);
            expect(starts).toEqual([hour, hour]);
        });
    }
});

test.describe('Offshore Wind Dispatch forecast', () => {

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

    test('a trip the forecast brought forward, dragged past its window, is at risk', async({ page }) => {
        await open(page, '?state=forecast');

        const third = page.locator('.ow-kpis .ow-kpi').nth(2);

        // Right after the forecast nothing is past its window, the third count is what it moved to tomorrow
        await expect(third).toContainText('Moved to');
        await expect(third).toHaveClass(/\bow-kpi-alert\b/);

        const id = await page.evaluate(() => {
            const
                app  = globalThis.bryntum.query('dispatchapp'),
                trip = app.trips.find(each => each.change === 'pulled'),
                // Leave half an hour before the window closes, so it is back after it
                by   = app.dispatch.closeOf(trip.resource) - 30 - trip.departs;

            trip.startDate = new Date(trip.startDate.getTime() + by * 60000);
            app.onTripDrop({ eventRecords : [trip], valid : true });

            return trip.id;
        });

        expect(await page.evaluate(id => {
            const
                app  = globalThis.bryntum.query('dispatchapp'),
                trip = app.trips.find(each => each.id === id);

            return [trip.change, trip.status, trip.endMinute > app.dispatch.closeOf(trip.resource)];
        }, id)).toEqual(['pulled', 'at-risk', true]);
        await expect(trip(page, id).locator(':scope > .b-sch-event')).toHaveClass(/\bow-trip-at-risk\b/);
        await expect(page.locator('.ow-map-label-risk')).not.toHaveCount(0);
        // One slot for the third count: a trip past its window wins over the turbines moved to tomorrow
        await expect(third).toContainText('At risk');
        await expect(third.locator('b')).toHaveText('1');
        await expect(third).toHaveClass(/\bow-kpi-warn\b/);
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
