import { expect, test } from '@playwright/test';

// When the CTV window closes, and closed before the latest forecast: the dispatch state (the header no longer shows it)
const ctvClose = page => page.evaluate(() => {
    const
        { dispatch } = globalThis.bryntum.query('dispatchapp'),
        hhmm         = minutes => minutes == null ? null : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

    return { closes : hhmm(dispatch.windows.ctv), was : hhmm(dispatch.previousWindows?.ctv) };
});
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
        // Tall enough for every row: the cards, the header and the tray under the schedule take their space
        await page.setViewportSize({ width : 1280, height : 860 });
        await open(page);

        await expect(scheduler(page)).toHaveClass(/\bb-scheduler\b/);
        // Five vessels, the standby Kittiwake among them, and two helicopters
        await expect(scheduler(page).locator('.ow-resource')).toHaveCount(7);
        await expect(page.locator('.ow-schedule .ow-panel-count')).toHaveText('5 CTV · 2 heli');
        await expect(scheduler(page).locator('.ow-group')).toHaveText(['Vessels · 5', 'Helicopters · 2']);
        await expect(trip(page, 'NT-1')).toBeVisible();
        // The weather no-go of every vessel is a resource time range
        await expect(scheduler(page).locator('.ow-nogo')).toHaveCount(7);
        expect((await ctvClose(page)).closes).toBe('14:00');
        await expect(page.locator('.ow-side .ow-turbine')).toBeVisible();
        await expect(page.locator('.ow-side [data-turbine]')).not.toHaveCount(0);
        await expect(tray(page).locator('.ow-team')).toHaveCount(3);
    });

    test('at 1600 x 960 the page and the schedule do not scroll, the frame is aligned to its corner, the status line is one line', async({ page }) => {
        await page.setViewportSize({ width : 1600, height : 960 });
        await open(page);

        const m = await page.evaluate(() => {
            const
                left   = selector => document.querySelector(selector).getBoundingClientRect().left,
                right  = selector => document.querySelector(selector).getBoundingClientRect().right,
                app    = document.querySelector('.ow-app'),
                kpis   = [...document.querySelectorAll('.ow-kpis > *')].at(-1),
                note   = document.querySelector('.ow-side .ow-card-note > span:last-child'),
                { scheduler } = globalThis.bryntum.query('dispatchapp'),
                radius = parseFloat(getComputedStyle(app).borderTopLeftRadius),
                border = parseFloat(getComputedStyle(app).borderLeftWidth);

            return {
                body     : [document.body.scrollHeight, document.body.clientHeight],
                scroll   : scheduler.scrollable.maxY,
                clock    : left('.ow-clock'),
                schedule : left('.ow-schedule'),
                tray     : left('.ow-tray'),
                kpis     : kpis.getBoundingClientRect().right,
                side     : right('.ow-side'),
                inset    : left('.ow-clock') - app.getBoundingClientRect().left - border,
                radius,
                noteCut  : note.scrollWidth > note.clientWidth,
                noteRows : note.getBoundingClientRect().height < 20
            };
        });

        expect(m.body[0]).toBe(m.body[1]);
        expect(m.scroll).toBe(0);
        // The header text, the schedule card and the crews tray share one x, the KPIs and the rail card another; the
        // frame's padding is its corner radius
        expect(Math.abs(m.clock - m.schedule)).toBeLessThanOrEqual(1);
        expect(Math.abs(m.tray - m.schedule)).toBeLessThanOrEqual(1);
        expect(Math.abs(m.kpis - m.side)).toBeLessThanOrEqual(1);
        expect(Math.abs(m.inset - m.radius)).toBeLessThanOrEqual(1);
        expect(m.noteCut).toBe(false);
        expect(m.noteRows).toBe(true);
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

    test('the Day | Week toggle stands alone, the Day view shows the whole day where it fits and scrolls where it does not', async({ page }) => {
        await page.setViewportSize({ width : 1600, height : 960 });
        await open(page);
        await expect(bar(page).getByRole('button', { name : 'Day' })).toHaveClass(/b-pressed/);
        await expect(bar(page).locator('.b-button-group .b-button')).toHaveCount(2);
        await expect(bar(page).locator('.ow-nudge')).toHaveCount(0);
        expect((await axis(page)).x).toBe(0);
        expect(await page.evaluate(() => globalThis.bryntum.query('dispatchapp').scheduler.timeAxisSubGrid.scrollable.maxX))
            .toBeLessThan(1);

        // Narrower, the hours keep their width and the timeline scrolls, as Scheduler does
        await page.setViewportSize({ width : 1100, height : 800 });
        await open(page);
        expect(await page.evaluate(() => globalThis.bryntum.query('dispatchapp').scheduler.timeAxisSubGrid.scrollable.maxX))
            .toBeGreaterThan(1);
    });

});

test.describe('Offshore Wind Dispatch, the Week view as a day board', () => {
    test.use({ viewport : { width : 1600, height : 960 } });

    const
        board = page => page.locator('.ow-week-board'),
        bar   = page => page.locator('.ow-schedule .ow-panel-bar'),
        // The cell of a vessel's day: its event, or its resource time range when it has no trip
        cell  = (page, vessel, day) => board(page)
            .locator(`[data-event-id="${vessel}:${day}"], [data-event-id="resourcetimerange-${vessel}:${day}"]`),
        // What the board holds, by vessel and day: the cell's kind and text
        cells = page => page.evaluate(() => {
            const { board : b } = globalThis.bryntum.query('dispatchapp').widgetMap;

            return Object.fromEntries([
                ...b.eventStore.records.map(event => [event.id, { kind     : 'trip', name     : event.name,
                    turbines : event.turbines, late     : event.late, pax      : event.pax, seats    : event.seats }]),
                ...b.resourceTimeRangeStore.records.map(range => [range.id, { kind : range.kind, name : range.name }])
            ]);
        });

    test('seven days by seven vessels, one cell each, of the kind the weather gives', async({ page }) => {
        await open(page, '?view=week');

        await expect(bar(page).getByRole('button', { name : 'Week' })).toHaveClass(/b-pressed/);
        await expect(board(page)).toBeVisible();
        await expect(scheduler(page)).toBeHidden();

        // A header per day: the date, the crew transfer vessels' sea state, the wave height and the wind
        const days = board(page).locator('.b-sch-header-time-axis-cell.ow-week-day');

        await expect(days).toHaveCount(7);
        await expect(days.first()).toContainText('· today');
        await expect(days.locator('.ow-sea')).toHaveText(['Go until 14', 'No CTV', 'Go until 15', 'Go · all day',
            'Go · all day', 'Go until 11', 'No CTV']);
        await expect(days.first().locator('small')).toHaveText('Hs 0.9–2.2 m · wind 24');

        // Every vessel's day is one cell: a trip, free or no-go, never two
        const all = await cells(page);

        expect(Object.keys(all)).toHaveLength(49);

        const
            vessels = ['sr', 'nt', 'sp', 'kw', 'bp', 'h1', 'h2'],
            kinds   = day => vessels.map(vessel => all[`${vessel}:${day}`].kind);

        // Tuesday: no crew transfer vessel, no helicopter, the SWATH until 13
        expect(kinds(1)).toEqual(['nogo', 'nogo', 'nogo', 'nogo', 'trip', 'nogo', 'nogo']);
        // Sunday: no-go for all
        expect(kinds(6)).toEqual(vessels.map(() => 'nogo'));
        // Thursday and Friday, the best days: no no-go, the standby vessel free all day
        for (const day of [3, 4]) {
            expect(kinds(day)).not.toContain('nogo');
            expect(all[`kw:${day}`]).toEqual({ kind : 'free', name : 'Free · all day' });
        }

        // Saturday the crew transfer vessels go until 11: a free one says so
        expect(all['kw:5']).toEqual({ kind : 'free', name : 'Free · until 11' });

        // Each trip back before its day's window closes, its seats within the vessel's
        for (const [id, each] of Object.entries(all).filter(([id, each]) => each.kind === 'trip' && !id.endsWith(':0'))) {
            expect(each.late, id).toBe(0);
            expect(each.pax, id).toBeLessThanOrEqual(each.seats);
        }

        // Drawn: the trips as cells with their seats bar, the free and no-go days as ranges
        const count = kind => Object.values(all).filter(each => each.kind === kind).length;

        await expect(board(page).locator('.b-sch-event.ow-cell')).toHaveCount(count('trip'));
        await expect(board(page).locator('.b-sch-event.ow-cell .b-task-percent-bar')).toHaveCount(count('trip'));
        await expect(board(page).locator('.ow-week-free')).toHaveCount(count('free'));
        await expect(board(page).locator('.ow-week-nogo')).toHaveCount(count('nogo'));

        // The Summary feature's row: the jobs planned against the jobs due, per day
        await expect(board(page).locator('.b-time-axis-summary-value')).toHaveCount(7);
        await expect(board(page).locator('.b-time-axis-summary-value').first()).toHaveText('11 / 14');
    });

    test('Monday is today: the same trips, Sea Puffin late', async({ page }) => {
        await open(page, '?view=week');

        const all = await cells(page);

        expect(['sr', 'nt', 'sp', 'kw', 'bp', 'h1', 'h2'].map(vessel => all[`${vessel}:0`])).toEqual([
            { kind : 'trip', name : '06:30–13:04', turbines : 'T-07 T-08 T-17', late : 0, pax : 3, seats : 12 },
            { kind : 'trip', name : '07:45–12:11', turbines : 'T-22 T-23', late : 0, pax : 3, seats : 12 },
            { kind : 'trip', name : '08:15–14:17', turbines : 'T-31 T-41', late : 17, pax : 4, seats : 12 },
            { kind : 'free', name : 'Free · until 14' },
            { kind : 'trip', name : '06:45–16:40', turbines : 'T-46 T-45 T-55', late : 0, pax : 7, seats : 24 },
            { kind : 'trip', name : '09:00–15:40', turbines : 'T-58', late : 0, pax : 2, seats : 6 },
            { kind : 'trip', name : '08:30–09:50', turbines : 'OSS', late : 0, pax : 1, seats : 6 }
        ]);

        // Sea Puffin's day in orange, how late first
        await expect(cell(page, 'sp', 0).locator('.ow-cell-late')).toContainText('+17 min · T-31 T-41');
        await expect(cell(page, 'sp', 0)).toContainText('4/12');
    });

    test('a crew dropped on a free cell plans a new trip there, checked against that day\'s window', async({ page }) => {
        await open(page, '?view=week');

        const centre = async locator => {
            const box = await locator.boundingBox();

            return { x : box.x + box.width / 2, y : box.y + box.height / 2 };
        };

        // Team H's 6 h annual service does not fit today on the standby vessel
        await holdAt(page, 'H', await centre(cell(page, 'kw', 0)));
        await expect(page.locator('.ow-drop-tip')).toContainText('T-02 does not fit on a new trip, KW-1 from port at 08:00');
        await expect(page.locator('.ow-drop-tip')).toContainText('Back in port 16:28, the CTV window closes 14:00');
        await expect(page.locator('.ow-drag-chip')).toHaveAttribute('data-state', 'invalid');

        // On Thursday, a free day, it does: back before the window, all day
        const thursday = await centre(cell(page, 'kw', 3));

        for (let step = 1; step <= 4; step++) {
            await page.mouse.move(thursday.x - 40 + step * 10, thursday.y);
        }

        await expect(page.locator('.ow-drop-tip')).toContainText('T-02 fits on a new trip, KW-1 from port at 06:30');
        await expect(page.locator('.ow-drop-tip dd b')).toHaveText('14:58');
        await expect(page.locator('.ow-drop-tip')).toContainText('window closes 18:00');
        await expect(page.locator('.ow-drag-chip')).toHaveAttribute('data-state', 'valid');
        await page.mouse.up();

        await expect(page.locator('.ow-drop-tip')).toHaveCount(0);
        await expect(tray(page).locator('.ow-team[data-team="H"]')).toHaveCount(0);
        await expect(board(page).locator('[data-event-id="kw:3"] .ow-cell-jobs')).toHaveText('T-02');
        await expect(board(page).locator('[data-event-id="kw:3"] .ow-cell-head')).toContainText('06:30–14:58');
        expect(await page.evaluate(() => {
            const trip = globalThis.bryntum.query('dispatchapp').scheduler.eventStore.getById('KW-1');

            return [trip.day, trip.turbines];
        })).toEqual([3, ['T-02']]);
    });

    test('a click on a day\'s header or cell opens the Day view on that date', async({ page }) => {
        await open(page, '?view=week');

        // Thursday's header: its trips on its hours, its forecast, no Today
        await board(page).locator('.b-sch-header-time-axis-cell[data-tick-index="3"]').click();

        await expect(bar(page).getByRole('button', { name : 'Day' })).toHaveClass(/b-pressed/);
        await expect(board(page)).toBeHidden();
        await expect(scheduler(page)).toBeVisible();
        await expect(scheduler(page).locator('.ow-day')).not.toContainText('Today');
        await expect.poll(async() => (await ctvClose(page)).closes).toBe('18:00');

        const thursday = await page.evaluate(() => {
            const
                app   = globalThis.bryntum.query('dispatchapp'),
                start = app.scheduler.startDate,
                week  = app.widgetMap.board.eventStore.records.filter(each => each.day === 3);

            return {
                hour  : start.getHours(),
                day   : Math.round((start - app.widgetMap.board.startDate) / 864e5 - 0.25),
                trips : app.trips.map(each => each.id).sort(),
                cells : week.flatMap(each => each.trips.split(' ')).sort()
            };
        });

        expect(thursday.hour).toBe(6);
        expect(thursday.day).toBe(3);
        expect(thursday.trips).toEqual(thursday.cells);
        await expect(trip(page, thursday.trips[0])).toBeVisible();

        // Back to the week, a click on Sea Puffin's Monday opens today again
        await bar(page).getByRole('button', { name : 'Week' }).click();
        await cell(page, 'sp', 0).click();

        await expect(scheduler(page).locator('.ow-day')).toContainText('Today');
        await expect(trip(page, 'SP-1')).toBeVisible();
        await expect.poll(async() => (await ctvClose(page)).closes).toBe('14:00');
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
        // The window closes earlier than it did before the forecast
        await expect.poll(async() => (await ctvClose(page)).was).toBe('14:00');
        expect((await ctvClose(page)).closes < '14:00').toBe(true);

        const changed = await page.evaluate(() => globalThis.bryntum.query('dispatchapp').forecastPlanner.changes.length);

        expect(changed).toBeGreaterThan(0);
        expect(await legsOf()).not.toEqual(before);

        await notice.getByRole('button', { name : 'Undo' }).click();

        await expect(notice).toBeHidden();
        expect(await page.evaluate(() => globalThis.bryntum.query('dispatchapp').trips
            .filter(each => each.change).map(each => each.id))).toEqual([]);
        expect(await legsOf()).toEqual(before);
        // Undo brought the dependencies back with their stops
        expect(await page.evaluate(() => globalThis.bryntum.query('dispatchapp').scheduler.dependencyStore.records
            .filter(each => !String(each.id).startsWith('chain:')).map(each => each.id).sort()))
            .toEqual(['hv-t45', 'pickup-t58']);
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

        // Drawn by the Dependencies feature: two real lines with an arrowhead, each with its reason in the tooltip. The
        // isolation at the substation before work on T-45, and the pick-up of Team J a lag after the drop-off
        await expect(scheduler(page).locator('.b-sch-dependency.ow-dep:not(.b-click-area)')).toHaveCount(2);
        // No chevron any more: the line is a path with the feature's own arrowhead
        await expect(scheduler(page).locator('.b-sch-dependency-markerless')).toHaveCount(0);
        expect(await page.evaluate(() => {
            const
                { scheduler } = globalThis.bryntum.query('dispatchapp'),
                read          = id => {
                    const { fromEvent, toEvent, lag } = scheduler.dependencyStore.getById(id);

                    return [fromEvent.id, toEvent.id, toEvent.parent.id, lag, scheduler.dependencyText({ id })];
                };

            return [read('hv-t45'), read('pickup-t58')];
        })).toEqual([
            ['H2-1', 'BP-1:T-45', 'BP-1', 0, 'No work on T-45 until the HV circuit is isolated'],
            ['H1-1', 'H1-2:T-58', 'H1-2', 180, 'Pick-up after the job: T-58 takes 3 h']
        ]);
        // The footer explains the line
        await expect(page.locator('.ow-legend .ow-l-dependency')).toHaveText('Must finish first');
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

    test('the helicopter dragged later pushes the stop that waits for it, until that is too late', async({ page }) => {
        await open(page);

        const
            before = await times(page),
            heli   = trip(page, 'H2-1').locator('.ow-trip-head'),
            box    = await heli.boundingBox(),
            // H2-1 is 80 minutes long, port to port, its buffer included: the px of a minute
            perMin = (await trip(page, 'H2-1').boundingBox()).width / 80,
            line   = scheduler(page).locator('.b-sch-dependency.ow-dep[data-dep-id="hv-t45"]:not(.b-click-area)');

        // On load the isolation is done in time: done at 09:25, BP-1 reaches T-45 at 10:39
        expect(before).toMatchObject({ heliDone : 9 * 60 + 25, t45 : 10 * 60 + 39, wait : 0, bpStatus : 'on-plan' });
        await expect(line).not.toHaveClass(/\bow-dep-broken\b/);

        // Two hours later would bring BP-1 back after the SWATH window closes at 17:00: the drag is refused, with the
        // dependency's reason for the drag's tooltip
        const refused = await page.evaluate(() => {
            const
                { scheduler } = globalThis.bryntum.query('dispatchapp'),
                heli          = scheduler.eventStore.getById('H2-1');

            return scheduler.validateTripDrag({
                eventRecords : [heli],
                startDate    : new Date(heli.startDate.getTime() + 120 * 60000)
            });
        });

        expect(refused.valid).toBe(false);
        expect(refused.message).toContain('No work on T-45 until the HV circuit is isolated');
        expect(refused.message).toContain('BP-1 would be back');

        // An hour and a half later is allowed: the EventDrag feature drags H2-1
        await page.mouse.move(box.x + 10, box.y + box.height / 2);
        await page.mouse.down();

        for (let step = 1; step <= 10; step++) {
            await page.mouse.move(box.x + 10 + perMin * 90 * step / 10, box.y + box.height / 2);
        }

        await page.mouse.up();

        // The engine starts T-45 once the isolation is done, BP-1 waits on station, its legs after T-45 move on
        await expect.poll(async() => (await times(page)).heliDone).toBe(before.heliDone + 90);

        const after = await times(page);

        expect(after.t45).toBe(after.heliDone);
        expect(after.wait).toBe(after.heliDone - before.t45);
        expect(after.t55 - before.t55).toBe(after.wait);
        expect(after.bpBack - before.bpBack).toBe(after.wait);
        // Still back before the window closes
        expect(after.bpBack).toBeLessThanOrEqual(17 * 60);
        expect(after.bpStatus).toBe('on-plan');
        await expect(line).not.toHaveClass(/\bow-dep-broken\b/);
    });

    test('the drop-off dragged so late that the pick-up leaves the helicopters window is refused', async({ page }) => {
        await open(page);

        // H1-2 collects Team J 3 h after H1-1 dropped them: a drop-off three hours later pushes the pick-up, refused
        // with the dependency's reason as that is past the window
        const refused = await page.evaluate(() => {
            const
                { scheduler } = globalThis.bryntum.query('dispatchapp'),
                drop          = scheduler.eventStore.getById('H1-1');

            return scheduler.validateTripDrag({
                eventRecords : [drop],
                startDate    : new Date(drop.startDate.getTime() + 180 * 60000)
            });
        });

        expect(refused.valid).toBe(false);
        expect(refused.message).toContain('Pick-up after the job: T-58 takes 3 h');
    });
});

test.describe('Offshore Wind Dispatch, teams dragged onto vessels', () => {
    test.use({ viewport : { width : 1440, height : 1100 } });

    test('each waiting team dragged onto each vessel row: which fit, and why the others do not', async({ page }) => {
        // Twenty-one drags
        test.setTimeout(150_000);
        await open(page);

        const
            teams   = await page.evaluate(() => globalThis.bryntum.query('dispatchapp').dispatch.waitingTeams
                .map(({ team }) => team.id)),
            vessels = await page.evaluate(() => globalThis.bryntum.query('dispatchapp').dispatch.vessels
                .map(({ id, name }) => ({ id, name }))),
            results = [];

        expect(teams).toEqual(['F', 'G', 'H']);
        expect(vessels).toHaveLength(7);

        // Half past twelve: inside every weather window, on a stretch of each row that holds no trip
        const noon = await page.evaluate(() => {
            const { scheduler : s } = globalThis.bryntum.query('dispatchapp');

            return s.getCoordinateFromDate(new Date(s.startDate.getFullYear(), s.startDate.getMonth(),
                s.startDate.getDate(), 12, 30), true);
        });

        for (const teamId of teams) {
            for (const { id, name } of vessels) {
                // A point on the vessel's row in the time axis, at half past twelve
                const
                    axis   = scheduler(page).locator('.b-time-axis-sub-grid'),
                    axisBox = await axis.boundingBox(),
                    rowBox = await axis.locator(`.b-grid-row[data-id="${id}"]`).boundingBox(),
                    point  = { x : axisBox.x + noon, y : rowBox.y + rowBox.height / 2 };

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

                // The trips it would fit on are outlined for the whole drag, from the same check
                const outlined = await scheduler(page).locator('.ow-trip-fits').evaluateAll(elements =>
                    elements.map(element => element.closest('[data-event-id]').dataset.eventId));

                expect(outlined).toEqual(teamId === 'F' ? ['NT-1'] : []);

                await page.keyboard.press('Escape');
                await page.mouse.up();
                await expect(page.locator('.ow-drop-tip')).toHaveCount(0);
                // The outline goes when the drag ends
                await expect(scheduler(page).locator('.ow-trip-fits')).toHaveCount(0);
            }
        }

        // What fits where, with the data the page opens with
        const fits = results.filter(each => each.valid).map(each => `${each.team} on ${each.trip}`);

        console.log(results.map(each => `${each.team} → ${each.vessel} (${each.trip}): ${each.valid ? 'fits' : each.reason}`)
            .join('\n'));

        // F, the converter fault, 48 min, fits on the trip of Northern Tern that has not left yet, wherever on its row
        // it is dropped, or on the standby Kittiwake. G, the blade repair, 3 h, fits only on Kittiwake: a new trip from
        // port at the next sailing, back before the window closes. The other vessels' trips are under way, or back
        // after their windows
        expect(fits).toEqual(['F on NT-1', 'F on KW-1', 'G on KW-1']);
        expect(results.filter(each => each.valid).map(each => each.short))
            .toEqual(['Fits NT-1, back 13:19', 'Fits KW-1, back 11:08', 'Fits KW-1, back 13:52']);

        // H (6 h) fits on no trip and no new trip of any vessel today, and is refused saying so. It waits for a free
        // day of the week (the Week view)
        for (const each of results.filter(result => result.team === 'H' && !result.vessel.startsWith('Heli'))) {
            expect(each.reason).toBe('6 h on site does not fit before any window closes today');
        }

        // F on a trip that is back after its window: in plain words, when and which window
        expect(results.find(each => each.team === 'F' && each.vessel === 'Sea Puffin').reason)
            .toBe('Back in port 16:01, the CTV window closes 14:00 (waves over 1.5 m)');

        // A vessel with no trip left to join gets a new trip from port, numbered after its trips of the week
        expect(results.find(each => each.team === 'F' && each.vessel === 'Skarv Runner').trip).toMatch(/^SR-([2-9]|\d\d)$/);
        expect(results.find(each => each.team === 'F' && each.vessel === 'Heli 1').short).toBe('Vessels only');
    });

    test('the drag chip carries only the team and what it gives, the certificates are icons, the trip tooltip stays away', async({ page }) => {
        await open(page);

        const
            nt = await trip(page, 'NT-1').boundingBox();

        await holdAt(page, 'F', { x : nt.x + nt.width / 2, y : nt.y + nt.height / 2 });
        await expect(page.locator('.ow-drop-tip')).toBeVisible();

        // No debug text, no coordinates: the team, its certificate and the short verdict
        await expect(page.locator('.ow-drag-chip')).toHaveText('Team FHVFits NT-1, back 13:19');

        // HV held: a check icon in the work blue, no ✓ character
        const cert = page.locator('.ow-drop-tip .ow-drop-cert-held').first();

        await expect(cert).toContainText('HV');
        await expect(cert.locator('svg.ow-icon-check')).toHaveCount(1);
        await expect(page.locator('.ow-drop-tip')).not.toContainText('✓');
        expect(await cert.locator('svg').evaluate(svg => svg.getBoundingClientRect().width)).toBeCloseTo(12, 0);

        // The trip's own tooltip does not open over the drag
        await expect(page.locator('.b-sch-event-tooltip, .ow-tip')).toHaveCount(0);

        await page.keyboard.press('Escape');
        await page.mouse.up();
    });

    test('the trip tooltip: the vessel, a status pill, the trip drawn to scale and a grid of facts', async({ page }) => {
        await open(page);

        for (const [id, pill] of [['SR-1', '56 min to spare'], ['SP-1', '+17 min late']]) {
            const box = await trip(page, id).boundingBox();

            await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7, { steps : 3 });

            const tip = page.locator('.b-tooltip .ow-tip');

            await expect(tip).toBeVisible();
            await expect(tip.locator('.ow-tip-status')).toHaveText(pill);
            await expect(tip.locator('.ow-tip-block')).not.toHaveCount(0);
            await expect(tip.locator('dt', { hasText : 'Back in port' })).toBeVisible();
            // Hours and minutes, never decimals
            await expect(tip).not.toContainText(/\d\.\d+ h/);
            // The grid's own styles, not the browser's indentation
            expect(await tip.locator('dd').first().evaluate(dd => getComputedStyle(dd).marginInlineStart)).toBe('0px');
            await page.mouse.move(5, 5);
            await expect(tip).toHaveCount(0);
        }
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
