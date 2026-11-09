# Offshore Wind Dispatch

The marine coordinator's day at Skarv Bank, an offshore wind farm of 60 turbines: four vessels (three crew transfer
vessels and a SWATH) and two helicopters take maintenance teams out to the turbines and back, in a Bryntum Scheduler.
The plan does not run against fixed sites but against the weather. Each vessel may only transfer people while the
significant wave height (Hs) stays under its limit, and a trip has to be back at port before that window closes.

* **Schedule**: one row per vessel or helicopter, one bar per trip. A trip is a parent event, its legs are nested
  events inside it: the transits (hatched, with the vessel's icon) and the turbine stops, with the turbine and the
  hours. From the hour the forecast
  crosses a vessel's limit, a hatched weather no-go area covers its row. A trip back after the window closes turns
  orange
* **Weather in the time axis**: under the hours, the hourly Hs forecast is drawn as an AG Charts area chart against the
  1.5 m CTV and 2.0 m SWATH limits, then the wind at hub height for the helicopters (limit 20 m/s)
* **Vessel column**: the vessel, its limit, how much of the window left today it is booked for, and the most people on
  board of its trips against its seats
* **Dependency**: the HV isolation flown out to the offshore substation must be done before the team on T-45 starts
  its cable work. The Dependencies feature draws it from the helicopter trip into that one nested stop of the SWATH's
  trip, red if the plan breaks it
* **Map**: the farm with every turbine's status, the substation, the port and the routes of the trips. The selected
  turbine is drawn below it, on its transition piece, with the sea at the forecast wave height against the vessel's
  limit on the boat landing. The map and the schedule follow each other: select a turbine and its trip is selected,
  select a trip and its turbines are ringed; hover a turbine and its trips light up (the Scheduler's event
  highlighting), hover a trip and its turbines are ringed. A Bryntum Tooltip on each turbine shows it at the forecast
  wave height with its job, its team and when a trip reaches it. The map is one tab stop: the arrow keys move to the
  nearest turbine in that direction, Enter or Space selects it

**Drag a team waiting at the port onto a trip.** The trip shows the stop it would get, a tooltip says when the trip
would be back against the window, and checks the seats and the certificates (GWO, HV, rope access). The map rings
every turbine the trip could still reach before the window closes and dims the rest. Drop it to book it. Should the
plan or the forecast change while a team is held, the team is checked again against it. Then press
**Forecast 08:00 is in**: the new forecast brings the CTV window forward from 14:00 to 12:00, and the plan follows. Trips
not yet gone are brought forward, trimmed (their last stops go to tomorrow) or moved to tomorrow. A notice offers Undo
and a review of each change.

`?state=drag` opens with Team F held over Northern Tern's trip, `?state=forecast` with the 08:00 forecast applied,
`?tab=map` on the map tab at phone widths.

## How it works

```
data/farm.json ──► DispatchState (site, forecasts, windows, teams, clock)
                     │                 ▲
                     ▼                 │ applyForecast()
               Scheduler event store ◄─┴─ ForecastPlanner ──► Planner#replanTrip (per trip)
               (tree: TripModel trips, their legs as children, TripModel#layout)
                     │
     ┌───────────────┼───────────────┬──────────────────┐
  Trip bars      No-go ranges    KPI bar        Map + turbine card
 (TripRendering) (resource time   (KpiBar)      (MapModel, TurbineMap,
                  ranges)                        TurbineCard)

TeamTray ──► TeamDrag (DragHelper) ──► DropPreview#previewDrop / dropTeam ──► Planner#previewDrop, #reachable
TurbineMap (turbines Store, selected Collection) ◄──► MapLink, DispatchApp ◄──► Scheduler selection and highlighting
```

The trips are the source of truth, in the Scheduler's event store, a tree: each trip is a parent event and its legs
(transits and stops) are its children. Everything else is worked out from them and from `DispatchState`: a trip's
length follows from its stops and the farm's geography (`lib/plan/Farm.js`), so a dropped team, a dragged trip or a
new forecast changes the stops or the departure, `TripModel#layout` places the legs again, and every view is drawn
again from that.

| To change | Look in |
|-----------|---------|
| The farm, vessels, teams, jobs, trips, the two forecasts and the limits | `data/farm.json` |
| Transit times, the layout of the farm and the map | `lib/plan/Farm.js` |
| When a window closes | `lib/plan/Weather.js` |
| Whether a team fits on a trip, what a new forecast does to a trip, what a trip can still reach | `lib/plan/Planner.js` |
| How a trip bar, the vessel column and the no-go areas look | `lib/schedule/TripRendering.js`, `resources/schedule.css` |
| The rows of the time axis, the wave height chart | `lib/schedule/ForecastHeader.js`, `lib/schedule/WaveChart.js` |
| The turbine illustration and the map markers | `lib/map/Turbine.js` |
| Colours, light and dark | `resources/tokens.css` |

To run it locally, see the [getting started guide](../CONTRIBUTING.md).

## Files

* `app.js` loads the farm data and creates the `DispatchApp`. It imports `scheduler.css` (the structural CSS of
  Scheduler and the products it builds on), the Svalbard theme, then `resources/app.css`
* `data/farm.json` the site, the limits, the forecasts, the vessels, the teams and their jobs, the trips and the
  dependency
* `lib/` the classes and modules, one per file:
  * `DispatchApp.js` the app, a `Panel` (with the `Responsive` mixin) holding the KPI bar (`KpiBar.js`), the team tray
    (`TeamTray.js`), the forecast notice (`ForecastNotice.js`), the schedule and the map. `TitleBars.js` draws the
    panel bars, the phone tabs and the legend, `TeamDrag.js` drags a team onto a trip, `DropPreview.js` (a mixin of
    the app) previews and books it, `MapLink.js` links the hover of the map and the schedule
  * `plan/` the dispatch rules as plain functions on plain values: the farm (`Farm`), the weather windows (`Weather`),
    the trips (`Planner`), the state apart from the trips (`DispatchState`) and the re-planning on a new forecast
    (`ForecastPlanner`)
  * `schedule/` the `DispatchScheduler`, its time axis rows (`ForecastHeader`), the wave height chart (`WaveChart`),
    and the rendering of the trips and their legs, the vessels, groups, ranges and the dependency (`TripRendering`)
  * `model/` `TripModel` (an `EventModelEnterprise`, a trip or one of its legs) and `VesselModel`
  * `map/` the map (`TurbineMap`, a Widget with its turbines in a Store, drawn from `MapModel`), the selected turbine
    and the map's tooltip (`TurbineCard`) and the turbine drawing (`Turbine`)
  * `util/` the times of the day and the icons
* `resources/` the CSS: `app.css` imports the tokens and one file per part (the header, the layout, the schedule, the
  map, the drag, the phone layout)

## Code tour

### Weather windows as resource time ranges: `lib/schedule/DispatchScheduler.js`

Each vessel's window closes at the start of the first hour its limit is crossed (`Weather#closingTimes`). `syncRanges()`
turns that into one resource time range per vessel, from the close to the end of the day, drawn hatched by
`renderRange`. They are rebuilt when the forecast changes, so the no-go area of each row moves with the forecast. A trip
brought forward by the forecast leaves a faint ghost at its old place, a resource time range too. The shaded past and
the now line are time ranges (the TimeRanges feature).

### Trips with their legs nested inside: `lib/model/TripModel.js`, `lib/schedule/TripRendering.js`

The Scheduler runs on the Enterprise tier with the NestedEvents feature, and its event store is a tree. A trip is a
parent event, its legs are its children: the transit out, the turbine stops (`kind : 'stop'`, `{ turbine, minutes,
team }`) with the hops between them, and the transit back. Each trip and each leg is assigned to the vessel, a nested
event shows only where it and its parent are both assigned (`TripModel.projectData`).

The trip's stops are read from its stop children. Changing them, or the departure, goes through `TripModel#layout`:
`Planner#buildLegs` puts the transits between the stops, and every leg gets its start and duration from the departure.
Legs that stay keep their record (a stop's ID is `<trip>:<turbine>`), new ones are added and assigned, gone ones
removed. The trip and its legs are `manuallyScheduled`, so the scheduling engine keeps the times the planner gives
them. The stop of a team being dragged over a trip is a leg too (`preview`), shown dashed in teal.

The event renderer draws the trip's head line (the feature's `headerHeight`), and each leg at its own time below it:
hatched with the vessel's icon, or solid with the turbine and the hours. The legs let the pointer through to their
trip, so a trip is dragged, hovered and selected as one, and a click on a stop is found by time. Trips are dragged
along their own row only, and not into the past or once gone (the EventDrag feature's `validatorFn`). A dropped trip's
legs are placed again from its new departure.

### A dependency into a stop: `lib/model/TripModel.js`, `lib/schedule/DispatchScheduler.js`

The Dependencies feature draws the line from the helicopter's trip into the T-45 stop, a nested event of the SWATH's
trip (`toEvent : 'BP-1:T-45'`). It is active, as the feature has it by default: a trip drag that would start the stop
before the helicopter is back, or bring the helicopter back after it, is refused (`validateDependencies()`, from the
EventDrag feature's `validatorFn`). Its renderer (`renderDependency`) turns it red when a forecast pushes the predecessor
back after the stop starts, and hides
it while the stop's trip is moved to tomorrow. `syncDependencies()` adds it again whenever both ends are in the plan,
so it comes back when Undo brings back a stop a forecast had cut.

### Weather in the time axis: `lib/schedule/ForecastHeader.js`, `lib/schedule/WaveChart.js`

The view preset has four header rows: the day, the hours, the wave height and the wind. A header row is drawn by its
`renderer`. The wave height row is one cell over the whole day, holding an AG Charts Community area chart. Its x axis
is the schedule's own day without padding, so each hour of the chart sits over the same hour of the trips. The chart
element is moved into the cell each time the header is drawn, not recreated. Its colours are read from the CSS custom
properties, and it is drawn again when the page switches between light and dark.

### The drag: `lib/TeamDrag.js`, `lib/plan/Planner.js`

The team chips are dragged with Bryntum's `DragHelper` (the same helper as the Scheduler "drag from grid" demo), which
handles the threshold, the proxy chip, mouse, pen and touch, Escape and the animated return of a refused drop. The
trips' `.b-sch-event-wrap[data-event-id]` are its drop targets, and the dispatch check below is its validation: a team
that does not fit marks the drag invalid. The keyboard (Enter on a chip, the arrows, Enter again) holds a team over a
trip without DragHelper, which has no keyboard drag. Over a trip, `Planner#previewDrop` places the team's stop after the last
one and tells when the trip would be back, whether the seats and the certificates allow it, and by how much it misses
the window, shown in a Bryntum `Tooltip` aligned to the point the team is held at. `Planner#reachable` tries the same stop at each of the 60 turbines to find the ones the trip could still
reach, which the map rings.

A trip or turbine the user selects animates the map's viewBox to fit the trip's turbines and the port
(`TurbineMap#fitTo`). Zoomed in, a drag on the map pans it within the farm (`TurbineMap#onPanStart`); a drag that starts
on a turbine still selects it. A "Show all" button, shown only while zoomed, goes back. While a team is held the map shows the whole farm, since what the trip can still reach is spread across it.

### A new forecast: `lib/plan/ForecastPlanner.js`

`apply()` keeps a snapshot of the trips, takes the next forecast and goes through each vessel's trips in start order.
A trip back after the new close is brought forward if it fits after the trip before it, else its last stops are cut
and wait for tomorrow, else it moves to tomorrow (`Planner#replanTrip`). The changes are listed for the notice, lost
work first. `undo()` puts the snapshot back, the new forecast stays.

## Styling

Every colour comes from the Svalbard theme's palette through `light-dark()`, in `resources/tokens.css`. One hue per
meaning: blue is on plan, orange past the window, red moved, purple the helicopters, teal reachable while dragging.
Below 760px wide the schedule and the map become tabs and the hours scroll sideways at 44px per hour.

The generic icons are [Phosphor Icons](https://phosphoricons.com) (MIT), Light weight, from `@phosphor-icons/core`.
Phosphor has no vessels or helicopters, so `lib/util/Icons.js` draws five more in the same grid and line weight: the
crew transfer vessel, the SWATH, the helicopter, the offshore substation and the turbine. The wave height chart is
AG Charts Community (`ag-charts-community`), MIT licensed.
