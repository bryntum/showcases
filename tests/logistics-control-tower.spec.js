import { expect, test } from '@playwright/test';
import { agGridLicenseNotice, collectErrors } from './errors.js';

const
    url      = './logistics-control-tower/',
    // A shipment with a dock slot booked at load, the same in every run (seeded data)
    bookedId = 'SHP-10069',
    otherId  = 'SHP-10066',
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

let errors;

// Every test fails on a console or page error. AG Grid runs without a licence key in the tests and logs its licence
// notice, nothing else is tolerated
test.beforeEach(({ page }) => {
    errors = collectErrors(page, { ignore : agGridLicenseNotice });
});

test.afterEach(() => {
    expect(errors).toEqual([]);
});

test.describe('Logistics Control Tower', () => {
    test('loads without console or page errors', async({ page }) => {
        await page.goto(url);
        await expect(grid(page).locator('.ag-row').first()).toBeVisible();
        await page.waitForLoadState('load');
    });

    test('renders the shipment grid and the dock schedule', async({ page }) => {
        await openPaused(page);

        await expect(grid(page)).toBeVisible();
        await expect(page.locator('.lct-grid-panel .lct-carrier-group').first()).toBeVisible();
        await expect(page.locator('.lct-grid-panel .ag-status-bar')).toContainText(/of 2,000 shown/);
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

    test('unbooking from the context menu removes the slot and puts the shipment on hold', async({ page }) => {
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

test.describe('Logistics Control Tower dock tools', () => {
    test('the utilization strip renders a bar per hour under the doors', async({ page }) => {
        await openPaused(page);

        const footer = schedule(page).locator('.b-grid-footer-container');

        await expect(footer).toContainText('Utilization');
        expect(await footer.locator('.b-sch-summary-bar .lct-util-bar').count()).toBeGreaterThan(24);
    });

    test('door downtime renders striped and refuses slots', async({ page }) => {
        await openPaused(page);

        await expect(schedule(page).locator('.lct-downtime').first()).toBeAttached();

        // A slot dragged or dropped onto the downtime of a door it could take is refused, by the drag validator and by
        // the grid's drop zone alike
        const refusals = await page.evaluate(() => {
            const
                { schedule, shipmentStore, dropZone } = globalThis.bryntum.query('controltowerapp'),
                range                                 = schedule.resourceTimeRangeStore.find(downtime =>
                    downtime.startDate > schedule.now && downtime.resource.capability === 'dry'),
                door                                  = range.resource,
                slot                                  = schedule.eventStore.find(event => event.loadType === 'dry' &&
                    !event.isStarted),
                shipment                              = shipmentStore.getById(slot.id);

            return [
                schedule.validateSlotDrop({
                    eventRecords : [slot],
                    newResource  : door,
                    startDate    : range.startDate,
                    endDate      : range.endDate
                }).message,
                dropZone.invalidReason(shipment, door, range.startDate, 30)
            ];
        });

        expect(refusals).toEqual([expect.stringMatching(/unavailable/), expect.stringMatching(/unavailable/)]);
    });

    test('Simulate delay makes a truck late and selects its slot', async({ page }) => {
        await openPaused(page);

        await page.locator('.lct-delay').click();

        const selected = schedule(page).locator('.b-sch-event-wrap.b-selected');

        await expect(selected).toHaveCount(1);

        const delay = await page.evaluate(id => globalThis.bryntum.query('controltowerapp').shipmentStore.getById(id)
            .delayMinutes, await selected.getAttribute('data-event-id'));

        expect(delay).toBeGreaterThanOrEqual(30);
    });
});

test.describe('Logistics Control Tower downtime', () => {
    test('a late truck pushing a slot into downtime moves it to after the window', async({ page }) => {
        await openPaused(page);

        const result = await page.evaluate(async() => {
            const
                { schedule, shipmentStore, simulator } = globalThis.bryntum.query('controltowerapp'),
                minute                                 = 60000,
                // The delay making a truck arrive ten minutes into a window, at most the simulation's 240 minutes
                delayInto                              = (range, shipment) =>
                    (range.startDate - shipment.plannedEta) / minute + 10,
                // A defrost window ahead, on a door with a booked slot before it whose truck is still on its way
                { range, slot, shipment }              = schedule.resourceTimeRangeStore.records
                    .filter(downtime => downtime.name === 'Defrost' && downtime.startDate > schedule.now)
                    .flatMap(downtime => downtime.resource.events.map(event =>
                        ({ range : downtime, slot : event, shipment : shipmentStore.getById(event.id) })))
                    .find(pick => !pick.slot.isStarted && pick.shipment.isInTransit &&
                        pick.slot.startDate < pick.range.startDate &&
                        delayInto(pick.range, pick.shipment) >= 0 && delayInto(pick.range, pick.shipment) <= 240),
                door                                   = range.resource;

            // The tick moves the slot to the truck's ETA, into the window
            simulator.delay(shipment, delayInto(range, shipment));
            await simulator.tick();

            return {
                start      : slot.startDate.getTime(),
                windowEnd  : range.endDate.getTime(),
                inDowntime : door.events.filter(event => !event.isStarted && door.timeRanges.some(downtime =>
                    event.startDate < downtime.endDate && event.endDate > downtime.startDate)).map(event => event.id)
            };
        });

        expect(result.start).toBeGreaterThanOrEqual(result.windowEnd);
        expect(result.inDowntime).toEqual([]);
    });
});

test.describe('Logistics Control Tower drag and drop', () => {
    test('dragging a shipment row onto a dock door books a slot there, the clock holds meanwhile', async({ page }) => {
        await openPaused(page);

        // An unbooked dry load, any door takes it, arriving after the hours the simulation books by itself
        const id = await page.evaluate(() => {
            const { schedule, shipmentStore, simulator } = globalThis.bryntum.query('controltowerapp');

            return shipmentStore.find(shipment => shipment.loadType === 'dry' && shipment.isInTransit &&
                !shipment.onHold && !schedule.eventStore.getById(shipment.id) &&
                shipment.eta - simulator.now > (simulator.autoBookHours + 1) * 3_600_000).id;
        });

        await page.getByPlaceholder('Search shipments').fill(id);

        const row = grid(page).locator(`.ag-row[row-id="${id}"]`);

        await row.hover();

        const
            handle = await row.locator('.ag-row-drag').boundingBox(),
            // The middle of the visible timeline on Door 06, the first ambient door, in view at the default viewport
            target = await page.evaluate(() => {
                const
                    { schedule } = globalThis.bryntum.query('controltowerapp'),
                    door         = schedule.getRowFor(schedule.resourceStore.getById('D06')).elements.normal
                        .getBoundingClientRect(),
                    timeline     = schedule.timeAxisSubGridElement.getBoundingClientRect();

                return { x : timeline.x + timeline.width / 2, y : door.y + door.height / 2 };
            }),
            from   = { x : handle.x + handle.width / 2, y : handle.y + handle.height / 2 },
            now    = () => page.evaluate(() => globalThis.bryntum.query('controltowerapp').simulator.now.getTime());

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();

        // AG Grid starts the drag after a few pixels, the drop zone follows the pointer
        for (let step = 1; step <= 10; step++) {
            await page.mouse.move(from.x + (target.x - from.x) * step / 10, from.y + (target.y - from.y) * step / 10);
        }

        await expect(page.locator('.lct-drop-preview')).toHaveText(`Drop ${id.replace(/^\D+-/, '')}`);

        // Playing while the shipment is held over the door, the clock does not move
        await page.evaluate(() => globalThis.bryntum.query('controltowerapp').simulator.play());

        const held = await now();

        // A fixed wait, nothing is meant to happen: three ticks of 300 ms would have moved the clock
        await page.waitForTimeout(1000);
        expect(await now(), 'the clock holds during the drag').toBe(held);

        await page.mouse.up();

        // Booked at the door, the simulation keeps it there (moved to the truck's ETA if it is later)
        await expect.poll(() => page.evaluate(id => globalThis.bryntum.query('controltowerapp').schedule.eventStore
            .getById(id)?.resource?.id, id), { message : 'The slot is booked at Door 06' }).toBe('D06');
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
