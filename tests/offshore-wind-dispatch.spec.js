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
    },
    // Selects a trip, as a click on it does
    selectTrip = (page, id) => page.evaluate(id => {
        const app = globalThis.bryntum.query('dispatchapp');

        app.scheduler.selectEvent(app.trips.find(each => each.id === id));
    }, id);

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
        // The page opens on SP-1, past its window: NT-1 is selected first
        await selectTrip(page, 'NT-1');

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
// the trip's status against the one the plan alone gives, with the previewed stop taken off and put back where the
// team is held (a trip, or a vessel's row, which may give a new trip from port)
const heldState = page => page.evaluate(() => {
    const
        app                         = globalThis.bryntum.query('dispatchapp'),
        { trip, team, job, target } = app.drop,
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
    app.holdPreview(team.id, target);

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

    test('a trip dragged so that it is at sea when its window has closed is invalid, and says why', async({ page }) => {
        await open(page);

        const
            hour = await page.evaluate(() => globalThis.bryntum.query('dispatchapp').scheduler.tickSize),
            box  = await trip(page, 'NT-1').boundingBox(),
            from = { x : box.x + 30, y : box.y + 4 };

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();

        // Two hours later it would be back at 14:11, after the CTV window closed at 14:00
        for (let step = 1; step <= 10; step++) {
            await page.mouse.move(from.x + hour * 2 * step / 10, from.y);
        }

        // The feature's own drag tooltip carries the message, the trip is drawn invalid
        await expect(page.locator('.b-tooltip', { hasText : 'Back in port 14:11, the CTV window closes 14:00 (waves over 1.5 m)' }))
            .toBeVisible();
        await expect(page.locator('.b-drag-invalid')).not.toHaveCount(0);

        await page.keyboard.press('Escape');
        await page.mouse.up();
    });

    test('a trip dragged while a team is held over it is checked again from its new departure', async({ page }) => {
        await open(page, '?state=drag');

        const [departs, wanted] = await page.evaluate(async() => {
            const
                app  = globalThis.bryntum.query('dispatchapp'),
                trip = app.drop.trip,
                // An hour later, late enough for the previewed stop to bring it back after the window
                to   = trip.departs + 60;

            // As EventDrag leaves it, then the app's afterEventDrop listener, which lets the engine place it
            trip.startDate = new Date(trip.startDate.getTime() + 60 * 60000);
            await app.onTripDrop({ eventRecords : [trip], valid : true });

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
        await selectTrip(page, 'NT-1');

        await tray(page).locator('.ow-team[data-team="F"]').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.ow-drop-tip')).toContainText('on NT-1');

        await page.evaluate(() => globalThis.bryntum.query('dispatchapp').applyForecast());

        const targets = await page.evaluate(() => {
            const app = globalThis.bryntum.query('dispatchapp');

            return {
                stepped : app.drag.keys.keyboard.trips.map(each => each.id),
                fresh   : app.dropTargets().map(each => each.id)
            };
        });

        // The trips the keys step through are those still on the day after the forecast
        expect(targets.stepped).toEqual(targets.fresh);

        await page.keyboard.press('ArrowRight');

        const state = await heldState(page);

        expect(state.held).toEqual(state.fresh);
        expect(targets.fresh).toContain(await page.evaluate(() => globalThis.bryntum.query('dispatchapp').drop.target.id));
    });
});

test.describe('Offshore Wind Dispatch, the schedule\'s views', () => {
    const
        bar   = page => page.locator('.ow-schedule .ow-panel-bar'),
        axis  = page => page.evaluate(() => {
            const { scheduler } = globalThis.bryntum.query('dispatchapp');

            return {
                x     : scheduler.timeAxisSubGrid.scrollable.x,
                start : scheduler.startDate.getTime(),
                tick  : scheduler.tickSize
            };
        });

    test('the Day view shows the whole day where it fits, its arrows off; narrower, they move the hours by two to the ends', async({ page }) => {
        const
            previous = () => bar(page).locator('.ow-nudge').first(),
            next     = () => bar(page).locator('.ow-nudge').last();

        await page.setViewportSize({ width : 1600, height : 960 });
        await open(page);
        await expect(bar(page).getByRole('button', { name : 'Day' })).toHaveClass(/b-pressed/);
        await expect(previous()).toBeDisabled();
        await expect(next()).toBeDisabled();

        await page.setViewportSize({ width : 1000, height : 800 });
        await open(page);
        await expect(previous()).toBeDisabled();
        await expect(next()).toBeEnabled();

        const first = await axis(page);

        await next().click();
        await expect.poll(async() => (await axis(page)).x).toBeCloseTo(2 * first.tick, 0);
        await expect(previous()).toBeEnabled();

        // On to the end of the day, where the arrow goes off, then back to its start
        for (let i = 0; i < 12 && await next().isEnabled(); i++) {
            await next().click();
        }
        await expect(next()).toBeDisabled();
        for (let i = 0; i < 12 && await previous().isEnabled(); i++) {
            await previous().click();
        }
        await expect(previous()).toBeDisabled();
        await expect(next()).toBeEnabled();
    });

    test('the Week view has a column per day, keeps the weather rows and shifts a week with the arrows', async({ page }) => {
        await open(page);
        await bar(page).getByRole('button', { name : 'Week' }).click();

        await expect(bar(page).getByRole('button', { name : 'Week' })).toHaveClass(/b-pressed/);
        await expect(bar(page).getByRole('button', { name : 'Day' })).not.toHaveClass(/b-pressed/);
        await expect(scheduler(page).locator('.ow-hour-cell')).toHaveCount(7);
        await expect(scheduler(page).locator('.ow-sea-today .ow-wave-chart')).toHaveCount(1);
        await expect(scheduler(page).locator('.ow-wind[data-peak]')).toHaveCount(1);

        const
            previous = bar(page).locator('.ow-nudge').first(),
            next     = bar(page).locator('.ow-nudge').last(),
            first    = await axis(page);

        await expect(previous).toBeDisabled();
        await next.click();
        await expect.poll(async() => (await axis(page)).start - first.start).toBe(7 * 24 * 3600_000);
        await next.click();
        await expect(next).toBeDisabled();

        // Back to the day, which is where the data is
        await bar(page).getByRole('button', { name : 'Day' }).click();
        await expect(trip(page, 'SP-1')).toBeVisible();
        await expect.poll(async() => (await axis(page)).x).toBe(0);
        await expect(scheduler(page).locator('.ow-hour-cell', { hasText : '06:00' })).toBeVisible();
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

        const id = await page.evaluate(async() => {
            const
                app  = globalThis.bryntum.query('dispatchapp'),
                trip = app.trips.find(each => each.change === 'pulled'),
                // Leave half an hour before the window closes, so it is back after it
                by   = app.dispatch.closeOf(trip.resource) - 30 - trip.departs;

            trip.startDate = new Date(trip.startDate.getTime() + by * 60000);
            await app.onTripDrop({ eventRecords : [trip], valid : true });

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
    // Every row in view, Heli 2 included: the Dependencies feature draws a dependency whose trips are rendered
    test.use({ viewport : { width : 1440, height : 1100 } });

    test('a trip holds its legs as nested events, the dependency runs into one stop', async({ page }) => {
        await open(page);

        // The stops are child events of the trip, drawn inside it by the NestedEvents feature
        const legs = trip(page, 'NT-1').locator('.b-nested-events-container .b-nested-event');

        await expect(legs.locator('.ow-seg-stop')).not.toHaveCount(0);
        await expect(trip(page, 'NT-1').locator('.b-nested-event[data-event-id="NT-1:T-22"]')).toContainText('T-22');

        // The sail out and back are the trip's buffer time, drawn by the EventBuffer feature with their clock times
        await expect(trip(page, 'NT-1').locator('.b-sch-event-buffer-before.ow-transit-out')).toHaveText('07:45');
        await expect(trip(page, 'NT-1').locator('.b-sch-event-buffer-after.ow-transit-back')).toHaveText('12:11');
        expect(await page.evaluate(() => {
            const trip = globalThis.bryntum.query('dispatchapp').trips.find(each => each.id === 'NT-1');

            return [trip.departs, trip.legs[0].type, trip.legs.at(-1).type, trip.preamble.magnitude > 0];
        })).toEqual([7 * 60 + 45, 'transit', 'transit', true]);

        // SP-1 is back after the CTV window: its sail back ends in the time and how late it is
        await expect(trip(page, 'SP-1').locator('.b-sch-event-buffer-after.ow-transit-late')).toHaveText('14:17 · +17 min');

        // Drawn by the Dependencies feature, from the helicopter's trip into the T-45 stop of BP-1, as a chevron in the
        // gap before the stop: it stays in BP-1's row
        const
            chevron = await scheduler(page).locator('.b-sch-dependency.ow-dep:not(.b-click-area)').boundingBox(),
            t45     = await trip(page, 'BP-1').locator('.b-nested-event[data-event-id="BP-1:T-45"]').boundingBox();

        await expect(scheduler(page).locator('.b-sch-dependency.ow-dep:not(.b-click-area)')).toHaveCount(1);
        expect(chevron.x + chevron.width).toBeLessThanOrEqual(t45.x + 1);
        expect(chevron.y).toBeGreaterThanOrEqual(t45.y - 1);
        expect(chevron.y + chevron.height).toBeLessThanOrEqual(t45.y + t45.height + 1);
        expect(await page.evaluate(() => {
            const { fromEvent, toEvent } = globalThis.bryntum.query('dispatchapp').scheduler.dependencyStore
                .getById('hv-t45');

            return [fromEvent.id, toEvent.id, toEvent.parent.id];
        })).toEqual(['H2-1', 'BP-1:T-45', 'BP-1']);
    });

});

// Holds a team's chip by the pointer and moves it to a point in steps, as a person drags, without releasing it
async function holdAt(page, teamId, point) {
    const
        from  = await tray(page).locator(`.ow-team[data-team="${teamId}"]`).boundingBox(),
        start = { x : from.x + from.width / 2, y : from.y + from.height / 2 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();

    for (let step = 1; step <= 8; step++) {
        await page.mouse.move(start.x + (point.x - start.x) * step / 8, start.y + (point.y - start.y) * step / 8);
    }
}

test.describe('Offshore Wind Dispatch, the scheduling engine', () => {
    // Every row in view, Heli 2 included
    test.use({ viewport : { width : 1440, height : 1100 } });

    // The times of the trips the HV isolation links, minutes since midnight. A trip's own end is its last stop's, the
    // sail back after it is its buffer: H2-1's end is when the isolation at the substation is done
    const times = page => page.evaluate(() => {
        const
            { scheduler } = globalThis.bryntum.query('dispatchapp'),
            minutes       = date => date.getHours() * 60 + date.getMinutes(),
            event         = id => scheduler.eventStore.getById(id);

        return {
            heliDone : minutes(event('H2-1').endDate),
            t45      : minutes(event('BP-1:T-45').startDate),
            t55      : minutes(event('BP-1:T-55').startDate),
            bpBack   : event('BP-1').endMinute,
            bpStatus : event('BP-1').status,
            wait     : event('BP-1').wait
        };
    });

    test('the helicopter dragged later pushes the stop that waits for it and the rest of its trip', async({ page }) => {
        await open(page);

        const
            before = await times(page),
            heli   = trip(page, 'H2-1').locator('.ow-trip-head'),
            box    = await heli.boundingBox(),
            // H2-1 is 80 minutes long, port to port, its buffer included: the px of a minute, then two hours later
            perMin = (await trip(page, 'H2-1').boundingBox()).width / 80,
            line   = scheduler(page).locator('.b-sch-dependency.ow-dep:not(.b-click-area)');

        // On load the isolation is done in time: done at 09:25, BP-1 reaches T-45 at 10:39
        expect(before).toMatchObject({ heliDone : 9 * 60 + 25, t45 : 10 * 60 + 39, wait : 0, bpStatus : 'on-plan' });
        await expect(line).not.toHaveClass(/\bow-dep-broken\b/);

        // The EventDrag feature drags H2-1 two hours later
        await page.mouse.move(box.x + 10, box.y + box.height / 2);
        await page.mouse.down();

        for (let step = 1; step <= 10; step++) {
            await page.mouse.move(box.x + 10 + perMin * 120 * step / 10, box.y + box.height / 2);
        }

        await page.mouse.up();

        // The engine starts T-45 once the isolation is done, BP-1 waits on station, its legs after T-45 move on
        await expect.poll(async() => (await times(page)).heliDone).toBe(before.heliDone + 120);

        const after = await times(page);

        expect(after.t45).toBe(after.heliDone);
        expect(after.wait).toBe(after.heliDone - before.t45);
        expect(after.t55 - before.t55).toBe(after.wait);
        expect(after.bpBack - before.bpBack).toBe(after.wait);

        // Now back after the SWATH window closes at 17:00: past its window, and the dependency marked broken, the
        // engine could not resolve it within the weather
        expect(after.bpBack).toBeGreaterThan(17 * 60);
        expect(after.bpStatus).toBe('at-risk');
        await expect(trip(page, 'BP-1').locator(':scope > .b-sch-event')).toHaveClass(/\bow-trip-at-risk\b/);
        await expect(line).toHaveClass(/\bow-dep-broken\b/);
    });
});

test.describe('Offshore Wind Dispatch, teams dragged onto vessels', () => {
    test.use({ viewport : { width : 1440, height : 1100 } });

    test('each waiting team dragged onto each vessel row: which fit, and why the others do not', async({ page }) => {
        // Eighteen drags
        test.setTimeout(120_000);
        await open(page);

        const
            teams   = await page.evaluate(() => globalThis.bryntum.query('dispatchapp').dispatch.waitingTeams
                .map(({ team }) => team.id)),
            vessels = await page.evaluate(() => globalThis.bryntum.query('dispatchapp').dispatch.vessels
                .map(({ id, name }) => ({ id, name }))),
            results = [];

        expect(teams).toEqual(['F', 'G', 'H']);
        expect(vessels).toHaveLength(6);

        // The Day view shows ten of the day's twelve hours: scrolled to the end of the day, the point is near 18:00
        await page.evaluate(() => {
            const { scrollable } = globalThis.bryntum.query('dispatchapp').scheduler.timeAxisSubGrid;

            scrollable.x = scrollable.maxX;
        });

        for (const teamId of teams) {
            for (const { id, name } of vessels) {
                // A point on the vessel's row in the time axis, near its end, clear of its trips
                const
                    axis   = scheduler(page).locator('.b-time-axis-sub-grid'),
                    rowBox = await axis.locator(`.b-grid-row[data-id="${id}"]`).boundingBox(),
                    point  = { x : rowBox.x + rowBox.width - 20, y : rowBox.y + rowBox.height / 2 };

                await holdAt(page, teamId, point);
                await expect.poll(() => page.evaluate(() => globalThis.bryntum.query('dispatchapp').drop?.target.id),
                    { message : `${teamId} held over ${name}` }).toBeTruthy();
                await expect(page.locator('.ow-drop-tip')).toBeVisible();

                const held = await page.evaluate(() => {
                    const { drop } = globalThis.bryntum.query('dispatchapp');

                    return { trip   : drop.trip.id, valid  : drop.result.valid, reason : drop.result.reason,
                        short  : drop.result.short };
                });

                // The proxy says the same as the check, in short
                await expect(page.locator('.ow-drag-chip .ow-drag-status')).toHaveText(held.short);
                await expect(page.locator('.ow-drag-chip')).toHaveAttribute('data-state', held.valid ? 'valid' : 'invalid');
                await expect(page.locator('.ow-drop-tip')).toContainText(held.valid ? 'fits on' : 'does not fit on');

                results.push({ team : teamId, vessel : name, ...held });

                await page.keyboard.press('Escape');
                await page.mouse.up();
                await expect(page.locator('.ow-drop-tip')).toHaveCount(0);
            }
        }

        // What fits where, with the data the page opens with
        const fits = results.filter(each => each.valid).map(each => `${each.team} on ${each.trip}`);

        console.log(results.map(each => `${each.team} → ${each.vessel} (${each.trip}): ${each.valid ? 'fits' : each.reason}`)
            .join('\n'));

        // Dropped at the end of the day, inside every window's no-go range: none fits there
        expect(fits).toEqual([]);

        // Refused in plain words: when it would be back and the window that closes, with the weather that closes it
        expect(results.find(each => each.team === 'G' && each.vessel === 'Northern Tern').reason)
            .toBe('Back in port 17:47, the CTV window closes 14:00 (waves over 1.5 m)');
        // Not only trips that come back late: F would be back at 13:19, but is dropped at the end of the day
        expect(results.find(each => each.team === 'F' && each.vessel === 'Northern Tern').reason)
            .toBe('Back in port 13:19, the CTV window closes 14:00 (waves over 1.5 m)');

        // The same team dropped on the same row before the window closes fits, the day scrolled back to its start
        await page.evaluate(() => {
            globalThis.bryntum.query('dispatchapp').scheduler.timeAxisSubGrid.scrollable.x = 0;
        });

        const
            axisBox = await scheduler(page).locator('.b-time-axis-sub-grid').boundingBox(),
            rowBox  = await scheduler(page).locator('.b-grid-row[data-id="nt"]').first().boundingBox(),
            noon    = await page.evaluate(() => {
                const { scheduler : s } = globalThis.bryntum.query('dispatchapp');

                return s.getCoordinateFromDate(new Date(s.startDate.getFullYear(), s.startDate.getMonth(),
                    s.startDate.getDate(), 12), true);
            });

        await holdAt(page, 'F', { x : axisBox.x + noon, y : rowBox.y + rowBox.height / 2 });
        await expect.poll(() => page.evaluate(() => globalThis.bryntum.query('dispatchapp').drop?.result.valid))
            .toBe(true);
        await page.keyboard.press('Escape');
        await page.mouse.up();

        // A vessel with no trip left to join gets a new trip from port
        expect(results.find(each => each.team === 'F' && each.vessel === 'Skarv Runner').trip).toBe('SR-2');
        expect(results.find(each => each.team === 'F' && each.vessel === 'Heli 1').short).toBe('Vessels only');
    });

    test('the proxy turns green or red as it moves, and neutral over empty space', async({ page }) => {
        await open(page);

        const
            chip   = page.locator('.ow-drag-chip'),
            status = chip.locator('.ow-drag-status'),
            nt     = await trip(page, 'NT-1').boundingBox(),
            sp     = await trip(page, 'SP-1').boundingBox();

        await holdAt(page, 'F', { x : nt.x + nt.width / 2, y : nt.y + nt.height / 2 });

        await expect(chip).toHaveAttribute('data-state', 'valid');
        await expect(status).toHaveText(/^Fits NT-1, back \d\d:\d\d$/);
        await expect(trip(page, 'NT-1').locator(':scope > .b-sch-event')).toHaveClass(/\bow-trip-drop\b/);

        // Sea Puffin's trip is back after its window already
        await page.mouse.move(sp.x + sp.width / 2, sp.y + sp.height / 2, { steps : 4 });
        await expect(chip).toHaveAttribute('data-state', 'invalid');
        await expect(status).toHaveText(/after window$/);
        await expect(page.locator('.ow-drop-tip')).toContainText('does not fit on SP-1');
        await expect(trip(page, 'NT-1').locator(':scope > .b-sch-event')).not.toHaveClass(/\bow-trip-drop\b/);

        // Over the tray, nothing to drop on
        const trayBox = await tray(page).boundingBox();

        await page.mouse.move(trayBox.x + trayBox.width - 40, trayBox.y + trayBox.height / 2, { steps : 4 });
        await expect(chip).toHaveAttribute('data-state', 'neutral');
        await expect(status).toBeHidden();
        await expect(page.locator('.ow-drop-tip')).toBeHidden();

        await page.mouse.up();
    });
});

test.describe('Offshore Wind Dispatch on a phone', () => {
    test.use({ viewport : { width : 390, height : 844 } });

    test('shows the schedule and the map as tabs, without horizontal scroll', async({ page }) => {
        await open(page);

        // The map half, not its tab, which carries the half's class too
        const
            side = page.locator('.b-container.ow-side'),
            tabs = page.locator('.ow-tabs [role="tablist"]').getByRole('tab');

        await expect(page.locator('.ow-app')).toHaveClass(/\bow-phone\b/);
        await expect(scheduler(page)).toBeVisible();
        await expect(side).toBeHidden();

        // A Bryntum TabPanel: a tab list, the selected tab marked
        await expect(tabs).toHaveText(['Schedule', 'Map']);
        await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

        await tabs.nth(1).click();

        await expect(side).toBeVisible();
        await expect(scheduler(page)).toBeHidden();
        await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

        // The arrow keys move along the tab list and show the tab
        await tabs.nth(1).focus();
        await page.keyboard.press('ArrowLeft');
        await expect(tabs.first()).toBeFocused();
        await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
        await expect(scheduler(page)).toBeVisible();
        await expect(side).toBeHidden();

        const { scrollWidth, clientWidth } = await page.evaluate(() => {
            const { scrollWidth, clientWidth } = document.documentElement;

            return { scrollWidth, clientWidth };
        });

        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
});
