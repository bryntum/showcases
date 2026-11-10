# Offshore Wind Dispatch

A marine coordinator's day at Skarv Bank, an offshore wind farm of 60 turbines. Eight craft take maintenance teams out
to the turbines and back: four crew transfer vessels (Kittiwake on standby), a SWATH and three helicopters (Heli 3 on
standby). The plan runs against the weather: a vessel may only put people onto a turbine while the significant wave
height (Hs) stays under its limit, and a trip has to be back at port before that window closes. This morning Sea
Puffin is due back 17 minutes after the CTV window closes, T-34 has stopped with a fault and Team F waits at the port to
repair it, and at 08:00 a new forecast brings the window two hours forward. The schedule is Bryntum Scheduler
Enterprise, its scheduling engine calculates every trip, and the wave height chart in its time axis is AG Charts.

To run it locally, see the [getting started guide](../CONTRIBUTING.md).

## Try it in 60 seconds

1. **Inspect T-41.** The page opens on it: its card under the map says Sea Puffin is back at 14:17, 17 minutes after
   the CTV window. In the schedule that is the orange stop and return tag; in the time axis, the wave height crossing
   the 1.5 m limit at 14:00
2. **Drag Team F onto a trip**, from the crews waiting in the header onto Northern Tern's trip (or Tab to its card and
   press Enter, the arrow keys pick the trip, Enter books it). While it is held, the trip shows the stop it would get,
   a tooltip says when the trip would be back and checks the seats and certificates, and the map rings every turbine
   the trip could still reach before the window closes. Drop it to book it
3. **Apply the forecast** with **Forecast 08:00 is in · Re-plan**. The CTV window closes at 12:00 instead of 14:00:
   trips not yet gone are brought forward, trimmed (their last stops wait for tomorrow) or moved to tomorrow. The
   notice lists each change
4. **Undo** in the notice puts every trip back, in one step
5. **Open Week**: the week as a day board, a cell per vessel per day. A free cell takes a team too, as a new trip on
   that day; a click on a day opens it in the Day view

`?state=drag` opens with Team F held over Northern Tern's trip, `?state=forecast` with the 08:00 forecast applied,
`?view=week` on the Week view, `?tab=map` on the map tab at phone widths.

## Where each feature is

| What you see | Built with | Look in |
|--------------|------------|---------|
| Trips with their stops nested inside | Scheduler `NestedEvents`, an event store that is a tree | `lib/model/TripModel.js`, `lib/model/TripData.js`, `lib/schedule/TripRendering.js` |
| The sail out and back, with their times | `EventBuffer` (`preamble`, `postamble`) | `lib/schedule/TripRendering.js`, `resources/schedule/transit.css` |
| Trip times | The scheduling engine: dependencies between the legs, a constraint on the departure | `lib/model/TripModel.js#layout` |
| "Must finish first" lines into a stop | `Dependencies`, dependencies with a lag | `lib/model/TripData.js`, `lib/schedule/DispatchSync.js` |
| Weather no-go hatch, ghost of a moved trip | `ResourceTimeRanges` | `lib/schedule/DispatchSync.js` |
| Wave height and wind in the time axis | View preset header rows with renderers, AG Charts | `lib/schedule/ForecastHeader.js`, `lib/schedule/WaveChart.js` |
| Dragging a trip, refused when it breaks the window | `EventDrag` with a `validatorFn` | `lib/schedule/TripValidator.js` |
| Dragging a team from the header onto a trip | `DragHelper`, a `Tooltip` | `lib/drag/` |
| The drop preview: back when, does it fit, what it can reach | Plain synchronous functions | `lib/plan/Planner.js` |
| A forecast's re-plan, and its Undo | `StateTrackingManager` (`project.stm`) | `lib/plan/ForecastPlanner.js` |
| The Week view | A second Scheduler: `fillTicks`, `PercentBar`, `Summary` | `lib/week/` |
| Header, panels, notice, tabs | `Panel`, `Container`, `Toolbar`, `ButtonGroup`, `TabPanel` | `lib/KpiBar.js`, `lib/panel/` |
| The map of the farm | Custom SVG in a `Widget`, its turbines in a `Store` | `lib/map/` |

## What is on the screen

* **Schedule**: one row per vessel or helicopter. A trip is a parent event over its time on station, its turbine stops
  are nested events inside it, solid blue work blocks with the turbine and the hours. The sail out and back are the
  trip's buffer time (the EventBuffer feature): a thin line with the departure and return times at its ends. From the
  time the forecast crosses a vessel's limit, a hatched weather no-go area covers its row; hatching means only that. A
  trip back after the window closes has its last stop and the late part of its sail back in orange, ending in the time
  and how late it is
* **Weather in the time axis**: under the hours, the hourly Hs forecast is drawn as an AG Charts area chart against the
  1.5 m CTV and 2.0 m SWATH limits, blue up to where it crosses the CTV limit and orange after, then the wind at hub
  height for the helicopters (limit 20 m/s, bold above it)
* **Header**: over the schedule, the site and the day shown, and at its right end the crews waiting at the port; over
  the map, the day's counts: due, assigned, at risk in orange (or, once a forecast moved some, moved to tomorrow in
  blue) and stopped in red. The weather window is told by the schedule itself: the wave chart's crossing, the no-go hatch and a
  late trip's tag
* **Vessel column**: the vessel, its type, its limit, and the most people on board of its trips against its seats
* **Dependency**: the HV isolation flown out to the offshore substation must be done before the team on T-45 starts
  its cable work, and Team J is picked up from T-58 three hours after the drop-off. The Dependencies feature draws both
  as thin lines with an arrowhead, each with its reason in the tooltip
* **Crews waiting**: in the header, a card per team waiting at the port, its certificates and job in its tooltip. Drop
  one on a trip, or on an empty part of a vessel's row, which books it on the vessel's best trip or a new trip from
  port. Should the plan or the forecast change while a team is held, it is checked again
* **Map** (custom SVG): the farm with every turbine's status (blue in work or planned, orange at risk, red stopped,
  dashed slate a team waiting for a trip, dashed blue work a forecast moved to tomorrow), the substation, the port and
  the routes of the trips. The selected
  turbine is drawn below it, on its transition piece, with the sea at the forecast wave height against the vessel's
  limit on the boat landing. The map and the schedule follow each other: select a turbine and its trip is selected,
  select a trip and its turbines are ringed; hover a turbine and its trips light up (the Scheduler's event
  highlighting), hover a trip and its turbines are ringed. A Bryntum Tooltip on each turbine shows it at the forecast
  wave height with its job, its team and when a trip reaches it. The map is one tab stop: the arrow keys move to the
  nearest turbine in that direction, Enter or Space selects it

### Glossary

| Term | Meaning |
|------|---------|
| Hs | Significant wave height, in metres: what decides whether a vessel may transfer people onto a turbine |
| CTV | Crew transfer vessel, a small fast catamaran, limit 1.5 m Hs |
| SWATH | Small waterplane area twin hull vessel, steadier in a swell, limit 2.0 m Hs |
| Window | The time until the forecast Hs crosses a vessel's limit. After it, the vessel's row is a hatched no-go area |
| Trip | One run of a vessel or a helicopter from the port and back. A parent event in the Scheduler |
| Leg | A child event of a trip, drawn inside it by the NestedEvents feature: a stop or a hop |
| Stop | A turbine a team works at on a trip, `{ turbine, minutes, team }`, the solid blue work block |
| Transit | Time at sea between two places. The sail out from the port and back to it are the trip's buffer time, its `preamble` and `postamble` (the EventBuffer feature) |
| Hop | A transit between two turbines, a leg of the trip |
| Held team | A team dragged from the tray (or held from the keyboard) over a trip or a vessel's row: the trip previews its stop until it is dropped or moves on |
| Ring | The map's circle round a turbine: the turbines of the trip hovered or selected, and while a team is held the turbines its trip can still reach |
| Ghost | The faint outline a trip brought forward by the forecast leaves at its old place |
| Pulled, moved, trimmed | What a new forecast did to a trip: brought forward, moved to tomorrow, or its last stops moved to tomorrow |
| Draft | A new trip from port, shown while a team is held over a vessel with no trip it could join, removed unless the team is booked on it |

## How it works

```
data/farm.json ──► DispatchState (site, forecasts, windows, the day shown, clock; waitingStore of teams)
                     │  change                         ▲ applyForecast()
                     ▼                                 │
     Scheduler project (ProjectModelEnterprise) ◄── ForecastPlanner ──► Planner#replanTrip (per trip)
     event store: TripModel trips and their legs,       (one STM transaction, Undo = stm.undo())
     dependencies; the engine places them
                     │  dataReady
     ┌───────────────┼────────────────┬───────────────┬──────────────────┐
  Trip bars      No-go ranges     KPI bar       Week view          Map + turbine card
 (renderers)    (DispatchSync)    (KpiBar)     (WeekBoard,         (MapPanel: MapModel,
                                                its own listener)   TurbineMap, TurbineCard)
                                                                         ▲ change
AppState (selected turbine, map follows, team lifted / held) ────────────┘
TeamTray ◄── waitingStore        TeamDrag (DragHelper) ──► DropController ──► Planner#previewDrop, #reachable
```

The trips are the source of truth, in the Scheduler's project, a tree: each trip is a parent event and its legs at
sea (stops and the hops between them) are its children, the sail out and back its buffer. A change of the plan (a team
booked, a trip dragged or edited, a new forecast, its Undo) goes through `TripModel#layout`, the engine calculates it
(`await project.commitAsync()`), and the project's `dataReady` redraws the views.

The app holds three observable sources and wires them to the views, it pushes no redraws by hand:

* the project (the plan), its `dataReady`
* `DispatchState` (the day shown, the forecast and its windows, the clock), its `change`; the teams waiting are its
  `waitingStore`, which the team tray shows a chip per record of
* `AppState` (the turbine selected, whether the map follows it, the team lifted and the team held with its check),
  its `change`; the trip selected is the Scheduler's own selection

Several changes made together redraw once (the listeners' `buffer`).

### Who works out the times

The app decides **what** a trip does, the scheduling engine **when**:

| The app supplies (`TripModel#layout`) | The engine calculates |
|---------------------------------------|-----------------------|
| The stops in order, each with its duration (the job's minutes) | Each leg's start and end: a leg starts when the one before it ends (a finish-to-start dependency per pair, kind `chain`) |
| The hops between the stops and the sail out and back, with their durations from the farm's geography (`Planner#buildLegs`) | The wait on station: a stop that must wait for another trip (a dependency with a lag) starts later, the legs after it move with it |
| The earliest departure, as a `startnoearlierthan` constraint on the trip | The trip's start and end, rolled up from its legs; its departure and return are `outerStartDate` and `outerEndDate` |

Nothing sets a committed leg's dates directly. Booking Team F on Northern Tern's trip, for example, is
`trip.layout({ stops : [...trip.stops, stopOf(team, job)] })`: the T-34 stop and the hop to it are added as legs with
their durations and chained after T-23, and after `commitAsync()` the engine has placed them, moved the sail back after
them and rolled the trip's end out to the new return. The app then reads the times back.

The **drop preview** is the exception, a what-if. A team held over a trip asks: does it fit, when would the trip be
back, which turbines could it still reach. `lib/plan/Planner.js` answers that with plain synchronous functions on the
trip's plan (`TripModel#plan`: its departure, stops and wait on station, read from the records as the engine placed
them), in minutes since the trip's midnight: about 2 ms a hover, the 60 turbines of the reach included. The engine is
not asked: a trial change placed by the engine and taken back takes about 90 ms a check, the reach would take seconds,
and the drag checks on every move. Once the team is dropped, its stop is laid out like any other and the engine places
it. The forecast's re-plan works the same way: the planner proposes each trip's new departure and stops, and the
engine places each changed trip before the next one on the vessel is planned.

| To change | Look in |
|-----------|---------|
| The farm, vessels, teams, jobs, trips, the two forecasts and the limits | `data/farm.json` |
| Transit times, the layout of the farm and the map | `lib/plan/Farm.js` |
| When a window closes | `lib/plan/Weather.js` |
| Whether a team fits on a trip, what a new forecast does to a trip, what a trip can still reach | `lib/plan/Planner.js` |
| Whether a trip may be dragged or edited to a new time | `lib/schedule/TripValidator.js` |
| How a trip bar, the vessel column and the no-go areas look | `lib/schedule/TripRendering.js`, `resources/schedule/` |
| The rows of the time axis, the wave height chart | `lib/schedule/ForecastHeader.js`, `lib/schedule/WaveChart.js` |
| The turbine illustration and the map markers | `lib/map/Turbine.js` |
| Colours, light and dark | `resources/tokens.css` |

## Files

* `app.js` loads the farm data and creates the `DispatchApp`. It imports `scheduler.css` (the structural CSS of
  Scheduler and the products it builds on), the Svalbard theme, then `resources/app.css`
* `data/farm.json` the site, the limits, the forecasts, the vessels, the teams and their jobs, the trips and the
  dependency
* `lib/` the classes and modules, one per file:
  * `DispatchApp.js` the app, a `Panel` (with the `Responsive` mixin) holding the header (`KpiBar.js`, a Container of
    the site and the day, the team tray and four `Kpi` widgets), the schedule panel and the map panel (`panel/`), and the phone
    tabs. It wires the plan, the dispatch state and the app state (`AppState.js`, `Base` with the `Events` mixin) to
    the views. `DropController.js` previews and books a dropped team (TeamDrag's handler), `MapLink.js` links the hover
    of the map and the schedule, `TeamTray.js` is the team tray in the header (a Container of `TeamChip` widgets, the
    drag sources, one per record of the waiting teams' store), `ForecastNotice.js` the forecast notice (a Container
    with two Buttons) and `Legend.js` the schedule's footer
  * `panel/` the panels of the app: `SchedulePanel` (a Panel whose `tbar` is the title bar, with the next forecast's
    button and a `ButtonGroup` for the Day / Week views; it holds the notice, the scheduler, the Week view and the
    footer), `MapPanel` (the map with its title bar and legend, and the turbine card, drawn by `draw()`, which also
    fits the map to the selection when it changed) and `PhoneTabs` (a `TabPanel` with the arrow keys)
  * `drag/` dragging a team onto a trip: `TeamDrag` (the mouse, with `DragHelper`), `KeyboardDrag` (holding a team
    over a trip from the keyboard), `DropTooltip` (the tooltip of the trip under the team) and `DragChip` (the chip
    that follows the pointer)
  * `plan/` the dispatch rules as plain functions on plain values: the farm (`Farm`), the weather windows (`Weather`),
    the trips (`Planner`), the state apart from the trips (`DispatchState`: the day shown and its Dates, the forecasts,
    the waiting teams' store), the re-planning on a new forecast (`ForecastPlanner`) and the seeded generator of the
    week's forecasts and trips (`WeekPlan`)
  * `week/` the Week view: `WeekBoard` (a Scheduler with a day-tick view preset, `fillTicks`, the PercentBar,
    ResourceTimeRanges and Summary features, redrawn from the Day view's project while it shows) and `WeekCells` (one
    derived cell per vessel per day)
  * `schedule/` the `DispatchScheduler`, `DispatchSync` (the no-go ranges, the now line and the dependencies in the
    project's stores), its time axis rows (`ForecastHeader`), the wave height chart (`WaveChart`), the trip tooltip
    (`TripTip`), the checks of a trip moved to a new time (`TripValidator`), and the rendering of the trips and their
    legs, the vessels, groups, ranges and the dependency (`TripRendering`)
  * `model/` `TripModel` (an `EventModelEnterprise`, a trip or one of its legs), `TripData` (a trip, its legs and the
    links between them as Scheduler data), `VesselModel` and `WaitingTeamModel` (a team waiting at the port)
  * `map/` the map (`TurbineMap`, a Widget with its turbines in a Store, `TurbineModel`, drawn from `MapModel` and
    `MapDrawing`), its viewport (`MapViewport` and the view arithmetic in `MapView`: zoom, pan and pinch), the
    `TurbineTooltip`, the `MapLegend`, the selected turbine (`TurbineCard`) and the turbine
    drawing (`Turbine`)
  * `util/` formatting the planner's times of day, and the icons
* `resources/` the CSS: `app.css` imports the tokens and one file per component, in folders that mirror `lib/`
  (`layout/`, `schedule/`, `drag/`, `map/`), then the header and the phone layout

## Code tour

### Weather windows as resource time ranges: `lib/schedule/DispatchSync.js`

Each vessel's window closes at the start of the first hour its limit is crossed (`Weather#closingTimes`). `syncRanges()`
turns that into one resource time range per vessel, from the close to the end of the day, drawn hatched by
`renderRange`. They are rebuilt when the forecast changes, so the no-go area of each row moves with the forecast. A trip
brought forward by the forecast leaves a faint ghost at its old place, a resource time range too. The shaded past and
the now line are time ranges (the TimeRanges feature).

### Trips with their legs nested inside: `lib/model/TripModel.js`, `lib/model/TripData.js`, `lib/schedule/TripRendering.js`

The Scheduler runs on the Enterprise tier with the NestedEvents feature, and its event store is a tree. A trip is a
parent event from its first stop to its last, its legs are its children: the turbine stops (`kind : 'stop'`,
`{ turbine, minutes, team }`) with the hops between them. The sail out and back are the trip's `preamble` and
`postamble`, drawn by the EventBuffer feature (`renderBuffers`); `TripModel#departs` is the trip's start less the sail
out, and `TripModel#legs` still lists both as transits, so the planner reads the whole run. Each trip and each leg is
assigned to the vessel, a nested event shows only where it and its parent are both assigned (`projectData` in
`TripData.js`).

The trip's stops are read from its stop children. Changing them, or the departure, goes through `TripModel#layout`:
`Planner#buildLegs` puts the transits between the stops, the first and last become the buffer, and each leg gets its
duration; the engine then places them in order from the departure (see [Who works out the times](#who-works-out-the-times)).
Legs that stay keep their record (a stop's ID is `<trip>:<turbine>`), new ones are added and assigned, gone ones
removed. The stop of a team being dragged over a trip is a leg too (`preview`), shown dashed in teal.

The event renderer draws the trip's label above its line (the feature's `headerHeight`), and each stop at its own
time on it, solid with the turbine and the hours as far as its width has room. NestedEvents places nested events from
the start of the parent's wrapper, which with a buffer is the departure, so the legs' container is shifted back by the
buffer's width (`--ow-pre`). The legs let the pointer through to their trip, so a trip is dragged, hovered and selected
as one, and a click on a stop is found by time. Trips are dragged along their own row only, and not into the past or
once gone (the EventDrag feature's `validatorFn`). A dropped trip's legs are placed again from its new departure,
snapped to 5 minutes (`DispatchScheduler#departsAt`).

### Dependencies into a stop: `lib/model/TripData.js`, `lib/schedule/DispatchSync.js`

The Dependencies feature draws the lines from a trip into a stop, a nested event, of another trip: the HV isolation
(H2-1) into the T-45 stop of the SWATH's trip, and the helicopter's drop-off (H1-1) into the pick-up stop of H1-2 with a
lag (`data/farm.json`, `dependencies`). The scheduling engine starts the dependent stop once the trip before it is done
and the lag has passed, and the rest of its trip moves with it. A trip drag that would push a
dependent stop so late that its trip is back after its window is refused, with the dependency's reason
(`TripValidator#dependencyBreak`, from the EventDrag feature's `validatorFn`), and the forecast re-plan does not
bring a trip ahead of what its stops wait for (`TripModel#earliestDeparture`). The renderer (`renderDependency`) turns a
line orange when the plan breaks it, and hides it while the stop's trip is moved to tomorrow. `syncDependencies()` adds
it again whenever both ends are in the plan, so it comes back when Undo brings back a stop a forecast had cut.

### Weather in the time axis: `lib/schedule/ForecastHeader.js`, `lib/schedule/WaveChart.js`

The view preset has three header rows: the hours, the wave height and the wind (the day shown is in the page's
header). A header row is drawn by its
`renderer`. The wave height row is one cell over the whole day, holding an AG Charts Community area chart. Its x axis
is the schedule's own day without padding, so each hour of the chart sits over the same hour of the trips. The chart
element is moved into the cell each time the header is drawn, not recreated. Its colours are read from the CSS custom
properties, and it is drawn again when the page switches between light and dark.

### The drag: `lib/drag/TeamDrag.js`, `lib/drag/KeyboardDrag.js`, `lib/plan/Planner.js`

The team chips are dragged with Bryntum's `DragHelper` (the same helper as the Scheduler "drag from grid" demo), which
handles the threshold, the proxy chip, mouse, pen and touch, Escape and the animated return of a refused drop. The
whole time axis is its drop target: the Scheduler resolves the trip and the vessel under the pointer
(`resolveEventRecord`, `resolveResourceRecord`), and the dispatch check below is its validation: a team that does not
fit marks the drag invalid. The keyboard (Enter on a chip, the arrows, Enter again) holds a team over a
trip without DragHelper, which has no keyboard drag. Over a trip, `Planner#previewDrop` places the team's stop after the last
one and tells when the trip would be back, whether the seats and the certificates allow it, and by how much it misses
the window, shown in a Bryntum `Tooltip` aligned to the point the team is held at. `Planner#reachable` tries the same stop at each of the 60 turbines to find the ones the trip could still
reach, which the map rings.

A trip or turbine the user selects animates the map's viewBox to fit the trip's turbines and the port
(`TurbineMap#fitTo`, which `MapViewport` runs). Zoomed in, a drag on the map pans it within the farm (`MapViewport#onPanStart`); a drag that starts
on a turbine still selects it. A "Show all" button, shown only while zoomed, goes back. While a team is held the map shows the whole farm, since what the trip can still reach is spread across it.

### A new forecast: `lib/plan/ForecastPlanner.js`

`apply()` takes the next forecast and goes through each vessel's trips in start order, inside one transaction of the
project's StateTrackingManager (`project.stm`, recording only then). A trip back after the new close is brought forward
if it fits after the trip before it, else its last stops are cut and wait for tomorrow, else it moves to tomorrow
(`Planner#replanTrip`); the engine places each changed trip before the next is planned. The changes are listed for the
notice, lost work first. `undo()` is the STM's `undo()`: the trips, their legs and dependencies go back, the new
forecast stays.

## Styling

Every colour is a token in `resources/tokens.css`, light and dark through `light-dark()`. In the schedule, the header
and the tray, neutrals and blue carry the plan, orange marks only what is at risk (past the window), red only what is
stopped; work a forecast moved to tomorrow is blue and dashed, a team waiting for a trip slate and dashed, never an
alarm colour. Purple is the helicopters' wind, teal what a dragged team can reach.
Below 760px wide the schedule and the map become tabs and the hours scroll sideways at 44px per hour.

The generic icons are [Phosphor Icons](https://phosphoricons.com) (MIT), Light weight, from `@phosphor-icons/core`.
The vessels, the helicopter and the crews are [Tabler Icons](https://tabler.io/icons) (MIT), outline;
`lib/util/Icons.js` draws the turbine in Phosphor's grid and line weight, and the map draws the substation from
Phosphor's lightning. The wave height chart is
AG Charts Community (`ag-charts-community`), MIT licensed.
