import { expect, test } from '@playwright/test';
import { agChartsLicenseNotice, collectErrors } from './errors.js';

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
    errors = collectErrors(page, { ignore : agChartsLicenseNotice });
});

test.afterEach(() => {
    expect(errors).toEqual([]);
});

test.describe('Offshore Wind Dispatch map selection', () => {
    test('the turbines are a store, the selection one turbine, each turbine an option with aria-selected', async({ page }) => {
        await open(page);

        expect(await page.evaluate(() => {
            const map = globalThis.bryntum.query('turbinemap');

            return [map.turbines.isStore, map.turbines.count, map.selected];
        })).toEqual([true, 60, 'T-41']);

        await expect(page.locator('.ow-side [role="listbox"] [role="option"]')).toHaveCount(60);
        await expect(page.locator('.ow-side .ow-marker[aria-selected="true"]')).toHaveCount(1);
        // The page opens on T-41, the turbine at risk
        await expect(marker(page, 'T-41')).toHaveAttribute('aria-selected', 'true');
    });

    test('a turbine clicked on the map selects its trip, a trip selected in the schedule rings its turbines', async({ page }) => {
        await open(page);

        await page.evaluate(() => {
            globalThis.mapChanges = [];
            globalThis.bryntum.query('turbinemap').on({
                turbineSelect : ({ turbine }) => globalThis.mapChanges.push(turbine)
            });
        });

        await marker(page, 'T-07').click();

        // The click asks for the turbine, the app's redraw selects it without asking again
        await expect(marker(page, 'T-07')).toHaveAttribute('aria-selected', 'true');
        expect(await page.evaluate(() => globalThis.mapChanges)).toEqual(['T-07']);
        await expect(marker(page, 'T-41')).toHaveAttribute('aria-selected', 'false');
        expect(await selectedTrip(page)).toEqual(['SR-1']);
        await expect(card(page)).toContainText('T-07');

        // The other way: a trip selected in the schedule selects its first turbine and rings all of its turbines
        await page.evaluate(() => globalThis.bryntum.query('dispatchapp').scheduler.selectEvent(
            globalThis.bryntum.query('dispatchapp').trips.find(each => each.id === 'BP-1')));

        await expect(marker(page, 'T-46')).toHaveAttribute('aria-selected', 'true');

        for (const id of ['T-45', 'T-46', 'T-55']) {
            await expect(marker(page, id)).toHaveClass(/\bow-m-ring\b/);
        }

        await expect(marker(page, 'T-07')).not.toHaveClass(/\bow-m-ring\b/);
    });
});

test.describe('Offshore Wind Dispatch map zoom', () => {
    test('a trip selected fits the map to its turbines and the port, Whole farm goes back', async({ page }) => {
        await open(page);

        const
            svg       = page.locator('.ow-side .ow-map-svg'),
            wholeFarm = page.locator('.ow-side .ow-map-whole'),
            // Whether a point of the map's coordinates is inside the current viewBox
            inView    = (box, { x, y }) => x >= box[0] && y >= box[1] && x <= box[0] + box[2] && y <= box[1] + box[3],
            viewBox   = async() => (await svg.getAttribute('viewBox')).split(' ').map(Number);

        // On load the whole farm, nothing selected by the user yet
        await expect(svg).toHaveAttribute('viewBox', '0 0 440 330');
        await expect(wholeFarm).toBeHidden();

        await trip(page, 'SR-1').click();

        // Animated to a smaller box holding SR-1's turbines and the port
        await expect(wholeFarm).toBeVisible();
        await expect.poll(async() => (await viewBox())[2]).toBeLessThan(440);
        await page.waitForTimeout(600);

        const
            box    = await viewBox(),
            points = await page.evaluate(() => {
                const map = globalThis.bryntum.query('turbinemap');

                return ['T-07', 'T-08', 'T-17'].map(id => map.turbines.getById(id)).map(({ x, y }) => ({ x, y }));
            });

        for (const point of [...points, { x : 14, y : 300 }]) {
            expect(inView(box, point)).toBe(true);
        }

        await wholeFarm.click();

        await expect(svg).toHaveAttribute('viewBox', '0 0 440 330');
        await expect(wholeFarm).toBeHidden();
    });
});

test.describe('Offshore Wind Dispatch map pan and zoom', () => {
    const
        svg      = page => page.locator('.ow-side .ow-map-svg'),
        viewBox  = async page => (await svg(page).getAttribute('viewBox')).split(' ').map(Number),
        // Fits the map to SR-1 by selecting it, so there is room to pan
        zoomIn   = async page => {
            await trip(page, 'SR-1').click();
            await page.waitForTimeout(700);
        },
        // A point of the map in the viewport, a fraction of its box
        mapPoint = async(page, fx, fy) => {
            const box = await svg(page).boundingBox();

            return { x : box.x + box.width * fx, y : box.y + box.height * fy };
        },
        // Presses at a point and moves by dx, dy in steps, the button still down
        pressAndMove = async(page, from, dx, dy) => {
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();

            for (let step = 1; step <= 8; step++) {
                await page.mouse.move(from.x + dx * step / 8, from.y + dy * step / 8);
            }
        },
        // The point of the farm under a point of the screen
        farmPointAt = (page, { x, y }) => page.evaluate(({ x, y }) => {
            const
                { viewport } = globalThis.bryntum.query('turbinemap'),
                screen       = viewport.screenOf();

            return {
                x : viewport.view.x + (x - screen.left) / screen.scale,
                y : viewport.view.y + (y - screen.top) / screen.scale
            };
        }, { x, y });

    test('a pan sticks: a refresh, a hover or the clock does not move the map back', async({ page }) => {
        await open(page);
        await zoomIn(page);

        const before = await viewBox(page);

        await pressAndMove(page, await mapPoint(page, 0.5, 0.45), -60, -30);
        await page.mouse.up();

        const panned = await viewBox(page);

        expect(panned).not.toEqual(before);

        // Everything that draws the map again, then longer than the fit's animation
        await page.evaluate(() => globalThis.bryntum.query('dispatchapp').refreshPlan(true));
        await marker(page, 'T-60').hover();
        await page.waitForTimeout(1500);

        expect(await viewBox(page)).toEqual(panned);
    });

    test('released outside the map, the pan ends', async({ page }) => {
        await open(page);
        await zoomIn(page);

        await pressAndMove(page, await mapPoint(page, 0.5, 0.45), -60, -30);
        await expect(page.locator('.ow-side .ow-map')).toHaveClass(/\bow-map-panning\b/);

        // Out of the map panel, over the schedule, and released there
        await page.mouse.move(200, 400, { steps : 4 });
        await page.mouse.up();

        const ended = await viewBox(page);

        await expect(page.locator('.ow-side .ow-map')).not.toHaveClass(/\bow-map-panning\b/);

        // Moving over the map again, no button down, pans nothing
        await page.mouse.move(...Object.values(await mapPoint(page, 0.3, 0.3)), { steps : 6 });
        expect(await viewBox(page)).toEqual(ended);
        // The SVG itself never moved, DragHelper only gave the gesture
        expect(await svg(page).evaluate(el => {
            const
                own   = el.getBoundingClientRect(),
                frame = el.parentElement.getBoundingClientRect();

            return [own.left - frame.left, own.top - frame.top];
        })).toEqual([0, 0]);
    });

    test('Escape ends a pan', async({ page }) => {
        await open(page);
        await zoomIn(page);

        await pressAndMove(page, await mapPoint(page, 0.5, 0.45), -40, -20);
        await page.keyboard.press('Escape');

        const ended = await viewBox(page);

        await expect(page.locator('.ow-side .ow-map')).not.toHaveClass(/\bow-map-panning\b/);
        await page.mouse.move(...Object.values(await mapPoint(page, 0.2, 0.2)), { steps : 6 });
        await page.mouse.up();
        expect(await viewBox(page)).toEqual(ended);
    });

    test('a drag that starts on a turbine pans, it neither selects the turbine nor fits the map to it', async({ page }) => {
        await open(page);
        await zoomIn(page);

        // SR-1 selected, with the stop clicked. The drag starts on another of its turbines
        const
            before   = await viewBox(page),
            selected = await page.evaluate(() => globalThis.bryntum.query('turbinemap').selected),
            other    = ['T-07', 'T-08', 'T-17'].find(id => id !== selected),
            from     = await marker(page, other).boundingBox();

        await pressAndMove(page, { x : from.x + from.width / 2, y : from.y + from.height / 2 }, -50, -20);
        await page.mouse.up();
        await page.waitForTimeout(700);

        const after = await viewBox(page);

        await expect(marker(page, selected)).toHaveAttribute('aria-selected', 'true');
        await expect(marker(page, other)).toHaveAttribute('aria-selected', 'false');
        expect(await selectedTrip(page)).toEqual(['SR-1']);
        // Moved by the pan only: the same size, further east
        expect(after[2]).toBeCloseTo(before[2], 1);
        expect(after[0]).toBeGreaterThan(before[0]);
    });

    test('a pinch on the trackpad zooms around the pointer, no further out than the whole farm', async({ page }) => {
        await open(page);

        const
            point = await mapPoint(page, 0.6, 0.4),
            under = await farmPointAt(page, point),
            pinch = deltaY => svg(page).dispatchEvent('wheel', { deltaY, ctrlKey : true, clientX : point.x, clientY : point.y });

        await pinch(-60);

        const zoomed = await viewBox(page);

        expect(zoomed[2]).toBeLessThan(440);

        // The farm point under the pointer is still under it
        const still = await farmPointAt(page, point);

        expect(Math.abs(still.x - under.x)).toBeLessThan(1);
        expect(Math.abs(still.y - under.y)).toBeLessThan(1);
        await expect(page.locator('.ow-side .ow-map-whole')).toBeVisible();

        // Far out: the whole farm and no further
        await pinch(4000);
        expect(await viewBox(page)).toEqual([0, 0, 440, 330]);
        await expect(page.locator('.ow-side .ow-map-whole')).toBeHidden();
    });

    test('the mouse wheel and a two finger scroll both zoom around the pointer, as on Google Maps', async({ page }) => {
        await open(page);

        const point = await mapPoint(page, 0.5, 0.5);

        await page.mouse.move(point.x, point.y);
        await page.mouse.wheel(0, -200);
        await expect.poll(async() => (await viewBox(page))[2]).toBeLessThan(440);
        await page.waitForTimeout(400);

        const zoomed = await viewBox(page);

        // A trackpad's two finger scroll towards the user: small pixel steps, zooming in further
        await svg(page).dispatchEvent('wheel', { deltaX : 0, deltaY : -40, clientX : point.x, clientY : point.y });

        expect((await viewBox(page))[2]).toBeLessThan(zoomed[2]);
    });
});

test.describe('Offshore Wind Dispatch turbines', () => {
    test('the rotor in the tooltip turns at the wind of the hour, the markers on the map stand still, the wrench marks the ones in work', async({ page }) => {
        await open(page);

        const
            glyph     = id => marker(page, id).locator('.ow-marker-glyph'),
            animation = id => glyph(id).evaluate(el => getComputedStyle(el).animationName),
            badge     = id => marker(page, id).locator('.ow-marker-wrench'),
            // Off the map first, the tooltip of the last turbine may cover the next one
            hover     = async id => {
                await page.mouse.move(5, 5);
                await expect(tooltip(page)).toBeHidden();
                await marker(page, id).hover({ force : true });
            };

        // A running turbine's marker stays still when hovered, the drawing in its tooltip turns and says how fast:
        // 10 m/s at 07:40 is 8.75 rpm, a revolution every 6.86 s
        await hover('T-60');
        expect(await tooltip(page).locator('.ow-turbine-rotor').evaluate(el => getComputedStyle(el)
            .getPropertyValue('--ow-rotor-period').trim())).toBe('6.86s');
        await expect(tooltip(page)).toContainText('8.8 rpm · wind 10 m/s');
        await expect(tooltip(page).locator('.ow-turbine-rotor')).toHaveCount(1);
        expect(await animation('T-60')).toBe('none');

        // T-34 has a fault: still on the map and in its tooltip
        await hover('T-34');
        await expect(tooltip(page)).toContainText('T-34');
        await expect(tooltip(page)).toContainText('Stopped, fault');
        expect(await animation('T-34')).toBe('none');
        await expect(tooltip(page).locator('.ow-turbine-rotor')).toHaveCount(0);

        // SR-1 has left port: T-07 is in work, stopped, with the wrench, in the tooltip's drawing too
        await expect(badge('T-07')).toBeVisible();
        await expect(badge('T-60')).toBeHidden();
        await hover('T-07');
        await expect(tooltip(page)).toContainText('Stopped, under repair');
        await expect(tooltip(page).locator('.ow-turbine-badge')).toHaveCount(1);
        expect(await animation('T-07')).toBe('none');
    });

    test('the legend fits two rows of three: In work with its wrench, Planned, Waiting, At risk, Stopped', async({ page }) => {
        // Tall enough for the legends, which give way on short screens
        await page.setViewportSize({ width : 1600, height : 960 });
        await open(page);

        const entries = page.locator('.ow-side .ow-map-legend > span');

        await expect(entries).toHaveText(['In work', 'Planned', 'Waiting', 'At risk', 'Stopped']);
        // A solid disc with a full size wrench, nothing sticking out of the marker's box, the same size as the others
        await expect(entries.first().locator('.ow-marker-wrench')).toBeVisible();
        await expect(entries.first().locator('.ow-marker-glyph')).toBeHidden();

        const marks = await entries.evaluateAll(spans => spans.map(span => {
            const
                svg  = span.querySelector('svg').getBoundingClientRect(),
                part = [...span.querySelectorAll('svg > *')].filter(el => el.getBoundingClientRect().width)
                    .map(el => el.getBoundingClientRect());

            return {
                width  : svg.width,
                inside : part.every(box => box.left >= svg.left - 0.5 && box.right <= svg.right + 0.5 &&
                    box.top >= svg.top - 0.5 && box.bottom <= svg.bottom + 0.5)
            };
        }));

        expect(marks.every(mark => mark.inside)).toBe(true);
        expect(new Set(marks.map(mark => mark.width)).size).toBe(1);

        // Three a row, the sixth place kept for Moved, which a forecast adds without changing the legend's height
        const tops = await entries.evaluateAll(spans => spans.map(span => span.getBoundingClientRect().top));

        expect(new Set(tops.slice(0, 3)).size).toBe(1);
        expect(tops[3]).toBeGreaterThan(tops[0]);
        expect(tops[4]).toBe(tops[3]);
    });

    test('of the trips serving a turbine, the card shows the selected trip\'s visit', async({ page }) => {
        await open(page);

        // T-58: dropped off by H1-1 in the morning, picked up by H1-2 in the afternoon
        await page.evaluate(() => {
            const app = globalThis.bryntum.query('dispatchapp');

            app.scheduler.selectEvent(app.trips.find(each => each.id === 'H1-2'));
        });

        await expect(card(page)).toContainText('H1-2');
        await expect(card(page)).toContainText('On station 14:55 – 15:15');
    });

    test('the tooltip keeps its padding on both sides, its note wraps inside it', async({ page }) => {
        await open(page);
        await marker(page, 'T-60').hover();
        await expect(tooltip(page)).toBeVisible();

        const gaps = await tooltip(page).evaluate(tip => {
            const
                outer = tip.getBoundingClientRect(),
                inner = tip.querySelector('.ow-card-tip').getBoundingClientRect(),
                note  = tip.querySelector('.ow-card-note').getBoundingClientRect();

            return {
                left      : inner.left - outer.left,
                right     : outer.right - inner.right,
                noteRight : outer.right - note.right
            };
        });

        expect(Math.abs(gaps.left - gaps.right)).toBeLessThan(1.5);
        expect(gaps.noteRight).toBeGreaterThan(gaps.right - 1);
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

        // SP-1, the selected trip, rings its turbines again once the pointer leaves
        await page.mouse.move(5, 5);
        await expect(marker(page, 'T-31')).toHaveClass(/\bow-m-ring\b/);
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
        await expect(focusable).toHaveAttribute('data-turbine', 'T-41');

        await focusable.focus();
        await page.keyboard.press('ArrowRight');

        // The next turbine of its row, T-42, now the tab stop and focused, with its tooltip
        await expect(marker(page, 'T-42')).toBeFocused();
        await expect(focusable).toHaveCount(1);
        await expect(focusable).toHaveAttribute('data-turbine', 'T-42');
        await expect(tooltip(page)).toContainText('T-42');

        await page.keyboard.press('ArrowLeft');
        await expect(marker(page, 'T-41')).toBeFocused();

        // A row down, then select it
        await page.keyboard.press('ArrowDown');

        const down = await page.evaluate(() => document.activeElement.dataset.turbine);

        expect(['T-51', 'T-52', 'T-53']).toContain(down);

        await page.keyboard.press('Enter');
        await expect(marker(page, down)).toHaveAttribute('aria-selected', 'true');
        await expect(marker(page, 'T-41')).toHaveAttribute('aria-selected', 'false');
        await expect(card(page)).toContainText(down);

        // Space selects too
        await page.keyboard.press('ArrowRight');

        const next = await page.evaluate(() => document.activeElement.dataset.turbine);

        await page.keyboard.press(' ');
        await expect(marker(page, next)).toHaveAttribute('aria-selected', 'true');
    });
});
