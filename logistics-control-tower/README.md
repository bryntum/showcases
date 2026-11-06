# Logistics Control Tower

The inbound control tower of a distribution centre: 2,000 shipments on their way, in an AG Grid on the left, and the
12 dock doors of the site (5 cold store, 7 ambient), in a Bryntum Scheduler (Enterprise tier) on the right. A
simulation streams live updates into both: ETAs drift, GPS signals drop, reefer temperatures wander, trucks arrive,
unload and leave.

* **Shipments**: AG Grid Enterprise, grouped by carrier (shipments, pallets and late trucks per carrier), with set
  filters, a quick search, sparklines of the ETA drift coloured by status, cells that flash when they change, and a
  footer of custom status bar panels (shipments shown, their pallets and average delay, late trucks and conflicts).
  GPS, load, pallets, origin and the planned ETA are hidden columns
* **Dock doors**: a Scheduler on the Enterprise tier, formerly Scheduler Pro, whose engine schedules the unloading
  slots. The slots of a door are chained, so when a truck runs late its slot moves and the slots after it are pushed.
  A slot ending after its due time is a conflict, outlined dashed in red, one for a truck still more than three hours
  out is tentative, dashed grey. Striped blocks are door downtime (defrost, maintenance, cleaning), where nothing can be
  booked. Below the doors a utilization strip (the Summary feature) shows per hour the share of door time taken,
  orange above 90%. Zoom around the playhead
* **Header**: the site, the simulated clock and live counters (on time with its trend over the last hour), the speed
  (1, 5 or 15 simulated minutes per tick), Simulate delay, which makes a truck with a booked slot run 30 to 75 minutes
  late, and play / pause

Drag a shipment by its handle onto a door to book a slot there (a door without the right equipment refuses it), drag
a slot to move it, right-click a row or a slot to book, unbook or expedite. Selecting a row selects its slot and the
other way round, both scroll into view.

**[Live demo](https://showcase.bryntum.com/logistics-control-tower/)**

## How it works

```
Simulator (a tick every 300 ms)
  ├─ shipment changes ──► shipment Store (Bryntum) ─┐
  └─ slot moves, bookings ─► Scheduler project ─────┤  GridSync: changed ids, one
       (the engine pushes the chained slots)        ├─ applyTransactionAsync per batch ─► AG Grid
                                                    │
  AG Grid row dragged onto a door ◄── GridDropZone ─┘  (books through DockBooking)
```

The Bryntum stores are the sources of truth: the shipment store for the transport state, the Scheduler's project for
the doors, their downtime and the booked slots. AG Grid only shows flat rows built from both, sent as transactions.

| To change | Look in |
|-----------|---------|
| The site, doors, carriers, load mix, downtime windows | `data/network.json` |
| How the data is generated, how much is booked up front | `lib/simulation/ShipmentData.js` |
| Unloading times, turnaround, which door takes which load | `lib/simulation/DockPlanner.js` |
| What happens per tick, the statuses, when a slot is tentative | `lib/simulation/Simulator.js` |
| Booking, unbooking, expediting | `lib/schedule/DockBooking.js` |
| How a slot bar looks at each width, the utilization strip | `lib/schedule/SlotRendering.js`, `resources/schedule.css` |
| The grid's columns and cells | `lib/grid/ShipmentColumns.js`, `lib/grid/*CellRenderer.js` |
| Colours, light and dark | `resources/tokens.css` |

To run it locally, see the [root README](../README.md#running-locally).

## AG Grid Enterprise

AG Grid Enterprise is a separately licensed third-party library, not part of Bryntum. If you use it in your own app,
review [its licensing terms](https://www.ag-grid.com/license-pricing/). The showcase reads the key at build time from
the `VITE_AG_LICENSE_KEY` environment variable, for example from a `.env.local` file at the repository root, which git
ignores:

```shell
VITE_AG_LICENSE_KEY=<your AG Grid licence key>
```

Without a key AG Grid runs unlicensed: it shows its watermark and logs a licence notice in the console. The Playwright
tests always run without it, and tolerate that notice only. Vite inlines the key into the build, so a build made with
it holds the key: do not publish one.

The sparklines are drawn by AG Charts Community (`ag-charts-community`), MIT licensed.

## Files

* `app.js` loads the network data, then creates the `ControlTowerApp`. It imports the CSS (`scheduler.css`, the
  structural CSS of Scheduler and the products it builds on, the Svalbard theme, then `resources/app.css`) and
  `lib/grid/AgGridSetup.js` before any grid is created
* `data/network.json` the site, the load mix, the carriers, the origins and the dock doors, plus the seed of the
  generated data
* `lib/` the classes, one per file:
  * `ControlTowerApp.js` the app, a `Panel` with the KPI header (`KpiBar.js`), the simulation controls
    (`SimulationControls.js`), the grid panel (`ShipmentGridPanel.js`), the dock schedule and the legend
    (`StatusLegend.js`)
  * `simulation/` the seeded random generator, the data generator (`ShipmentData`), the slot finding rules
    (`DockPlanner`) and the `Simulator`
  * `schedule/` the dock schedule (`DockSchedule`), its mixins for booking (`DockBooking`) and the playhead
    (`Playhead`), the door downtime (`Downtime`) and the rendering of the cells, slots and utilization
  * `grid/` AG Grid: the licence key, modules and theme (`AgGridSetup`), the columns, the cell renderers (component
    renderers for the cells that change often, functions for the others), the sparkline colours, the grid options and
    the status bar panels
  * `sync/` the bridges between the two: `GridSync` (store changes to grid transactions, selection both ways) and
    `GridDropZone` (rows dropped onto the schedule)
  * `model/` `ShipmentModel`, `DockModel` and `SlotModel`
  * `util/` time formatting, the status labels, the icons and the KPI counts
* `resources/` the CSS: `app.css` imports the tokens and one file per part of the app (the header, the panel bars,
  the grid, the schedule, the downtime, the playhead, the utilization strip, the legend)

## Code tour

### Two sources of truth: `lib/sync/GridSync.js`

The shipment store (a Bryntum `Store` of `ShipmentModel`) owns the transport state, the Scheduler's event store owns
the dock slots, with the shipment id as the slot id. AG Grid owns nothing: its rows are flat objects built by
`ShipmentModel#toRow(slot)`. `GridSync` listens to both stores (and to the assignment store, for slots moved between
doors), collects the changed ids and sends them to AG Grid as one `applyTransactionAsync({ update })` per microtask.
`queueMicrotask` and not `requestAnimationFrame`, which pauses in a hidden tab. Dates go to the grid as timestamps, so
AG Grid sees which values changed and flashes those cells only (`enableCellChangeFlash`).

Selecting a row selects its slot (`selectEvent`, `scrollEventIntoView`), selecting a slot selects its row, expands its
carrier group and scrolls it into view (`ensureNodeVisible`). A flag stops the two from echoing each other.

### Engine scheduling: `lib/schedule/DockBooking.js`

The Scheduler runs on the Enterprise tier (`tier : 'enterprise'`), with the scheduling engine. The slots of a door are
chained by finish-to-start dependencies with the turnaround time as lag, and each slot has a start-no-earlier-than
constraint at its booked time. Moving a slot to a later ETA is all the simulation does, the engine pushes the slots
after it. `chainDoor()` rebuilds a door's chain in start order after a booking, a drop or a resize, touching only the
dependencies that differ. The Dependencies feature is off: the chains schedule, but are not drawn.

A slot that ends after its shipment's due time is a conflict, outlined dashed on the schedule, red in the grid's dock
slot badge, and counted in the header and the grid's footer. The dispatcher fixes it by dragging the slot to another
door or time, or with Expedite in the context menu.

Door downtime is a resource time range per window (`lib/schedule/Downtime.js`, the ResourceTimeRanges feature). The
booking (`getBusy()`), expedite, the drag and resize validators and the grid's drop zone treat it as taken. The engine
does not know about it, so after each commit `Simulator#moveOutOfDowntime()` moves a slot the chain pushed into a
window to right after it, and the engine pushes the slots behind it again. Not with resource calendars: those would
stretch a slot over the window rather than move it.

### The utilization strip: the Summary feature

The Scheduler's `Summary` feature paints a footer row under the timeline, one cell per tick of the time axis, so it
scrolls and zooms with the slots for free. Its `renderer` returns a bar per hour: the slots with their turnaround and
the downtime in the tick, as a share of the doors' time. Downtime counts as taken rather than as capacity removed, so
the bar tells how much door time is left for trucks. The door column's `summaryRenderer` labels it. The feature refreshes on the
project's `dataReady`, and the schedule refreshes it, buffered, when slots change. The gliding playhead only edits time
ranges, so it does not redraw the strip.

### Drag from the grid: `lib/sync/GridDropZone.js`

The rows have a drag handle (`rowDrag`), shown on the row under the pointer. `gridApi.addRowDropZone()` makes the
Scheduler's timeline a drop zone. While dragging, the door under the pointer is found by position (the event's target
is AG Grid's drag layer), the time by `getDateFromCoordinate()`, and a dashed preview box shows where the slot goes, or
why the door refuses the load. A drop books the slot with `bookAt()`, or moves the slot if the shipment was booked
already. The simulation holds its clock while a row is dragged.

### The clock: `lib/simulation/Simulator.js` and `lib/schedule/Playhead.js`

A tick every 300 ms advances the simulated now by the speed, drifts ETAs, temperatures and GPS states, moves the slots
of late trucks, books the trucks arriving within six hours, then waits for the engine (`project.commitAsync()`) and
moves slots out of downtime before it derives the statuses. The clock holds while a slot is dragged or resized. The playhead is two time ranges, the
shaded past and the now line, edited without change tracking. The timeline follows it by delta scrolling: it scrolls
by the distance the clock moved, so wherever the user scrolled to, the view keeps its place relative to now.

### AG Grid in a Bryntum app: `lib/ShipmentGridPanel.js` and `lib/grid/AgGridSetup.js`

The grid lives in the body of a Bryntum `Panel`, whose toolbar holds the quick search and the grouping switch, so it
takes part in the app's layout like any other widget. Its theme is AG Grid's Quartz with its colour parameters set to
the Bryntum theme's CSS variables (`var(--b-neutral-100)`, `var(--b-text-1)`, `var(--b-primary)`...). Those follow
light and dark mode, so the grid follows the shell's light / dark switch without any code. Only the modules the grid
uses are registered.

The grid follows AG Grid's own patterns: the cells that change on every tick (status, ETA, dock slot, temperature)
are component renderers whose `refresh()` updates the cell in place, the footer's panels are status bar components
that listen to the grid (`modelUpdated`), and the rows are updated by id with transactions. When the clock moves, only
the ETA column is refreshed, forced, as its values did not change, and without flashing.

## Styling

Neutral colours come from the theme (`--b-neutral-*`, `--b-text-*`, `--b-border-*`), in dark mode tinted a little cool
by `resources/tokens.css`, the status colours are mixed from its palette (`--b-color-*`), darker in light mode and
lighter in dark mode for contrast. Every colour in the CSS is a token. The sparklines are drawn on a canvas, which can
not read CSS variables: `lib/grid/SparklineColors.js` resolves the status tokens and redraws when the mode changes. The
counters and times use tabular figures and fixed widths, so they do not shift as they change. Below 900px the grid and
the schedule stack.

The icons are [Phosphor Icons](https://phosphoricons.com) (MIT), Light weight, from `@phosphor-icons/core`.
`lib/util/Icons.js` imports only the SVGs it uses and gives each a `lct-icon-{name}` class, drawn as a CSS mask over
the text colour (`resources/icons.css`), so the same class works in Bryntum `icon` configs, DomConfigs and AG Grid's
menu HTML.
