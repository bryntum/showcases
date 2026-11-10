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
   the CTV window. In the schedule that is the orange stop and return tag; in the time axis, the CTV window closing at
   14:00, the first hour the forecast is over its 1.5 m limit
2. **Drag Team F onto a trip**, from the crews waiting in the header onto Northern Tern's trip. While it is held, an
   outline on the trip's row shows where its stop would go,
   a tooltip says when the trip would be back and checks the seats and certificates, and the map rings every turbine
   the trip could still reach before the window closes. Drop it to book it
3. **Apply the forecast** with **Forecast 08:00 is in · Re-plan**. The CTV window closes at 12:00 instead of 14:00:
   trips not yet gone are brought forward, trimmed or taken off the day. The stops cut go to tomorrow as a trip of the
   same vessel if they fit its window and the vessel's other trips, else their teams wait at the port again, a chip
   per stop. Sea Puffin's trip moves to tomorrow 06:30, in the morning window before the waves rise again. The notice
   lists each change, on today only
4. **Undo** in the notice puts every trip back and takes tomorrow's trips and any waiting chips away, in one step
5. **Open Week**: the week as a day board, a cell per vessel per day. A free cell takes a team too, as a new trip on
   that day; a click on a day opens it in the Day view

`?state=drag` opens with Team F held over Northern Tern's trip, `?state=forecast` with the 08:00 forecast applied,
`?view=week` on the Week view, `?tab=map` on the map tab at phone widths.

## What it demonstrates

The Bryntum and AG Charts features it shows, each with the class that shows it, are listed at the top of
[`app.js`](app.js). The scheduling engine places every trip: the app supplies the stops and their durations, the
engine the dates (`TripModel#layout`). A team held over a trip is checked by plain synchronous functions instead
(`lib/plan/Planner.js`), fast enough for every pointer move, and nothing is written to the project until it is
dropped.

## Glossary

| Term | Meaning |
|------|---------|
| Hs | Significant wave height, in metres: what decides whether a vessel may transfer people onto a turbine |
| CTV | Crew transfer vessel, a small fast catamaran, limit 1.5 m Hs |
| SWATH | Small waterplane area twin hull vessel, steadier in a swell, limit 2.0 m Hs |
| Window | The time until the forecast Hs crosses a vessel's limit. After it, the vessel's row is a hatched no-go area |
| Trip | One run of a vessel or a helicopter from the port and back. A parent event in the Scheduler |
| Leg | A child event of a trip, drawn inside it by the NestedEvents feature: a stop or a hop |
| Stop | A turbine a team works at on a trip, a leg with its `turbine`, `team` and `duration`, the solid blue work block |
| Transit | Time at sea between two places. The sail out from the port and back to it are the trip's buffer time, its `preamble` and `postamble` (the EventBuffer feature) |
| Hop | A transit between two turbines, a leg of the trip |
| Held team | A team dragged from the tray over a trip or a vessel's row: an outline shows where its stop would go, nothing is in the plan until it is dropped |
| Ring | The map's circle round a turbine: the turbines of the trip hovered or selected, and while a team is held the turbines its trip can still reach |
| Ghost | The faint outline a trip brought forward by the forecast leaves at its old place |
| Pulled, trimmed, moved | What a new forecast did to a trip: brought forward, its last stops cut, or all of them cut (the trip leaves the day) |
| Carried over | A trip a forecast made on the next day of the stops it cut, on the same vessel. Dashed, "carried over" in its label |

## Files

* `app.js` loads the farm data and creates the `DispatchApp`. It imports `scheduler.css` (the structural CSS of
  Scheduler and the products it builds on), the Svalbard theme, then `resources/app.css`
* `data/farm.json` the site, the limits, the forecasts, the vessels, the teams and their jobs, the trips and the
  dependency of today, and under `week` the forecast, trips and jobs of the six days after it
* `lib/` the classes and modules, one per file:
  * `DispatchApp.js` the app, a `Panel` (with the `Responsive` mixin) holding the header (a Container of
    the site and the day, the team tray and the day's four counts), the schedule panel and the map panel (`panel/`),
    and the phone tabs. It wires the plan, the dispatch state and its own view state to the views.
    `DropController.js` checks and books a dropped team (TeamDrag's handler), `PhoneLayout.js` moves the schedule and
    the map into the phone tabs and back, `TeamTray.js` is the team tray in the header (a Container with a `List` of
    the waiting teams' store, a card per team, the drag sources)
  * `panel/` the panels of the app: `SchedulePanel` (a Panel whose header holds the title, the next forecast's
    button and a `ButtonGroup` for the Day / Week views as `tools`; it holds the forecast notice, the scheduler, the
    Week view and the legend), `MapPanel` (the site's card, a Panel with the map and its legend, and the turbine
    card, drawn by `draw()`, which also fits the map to the selection when it changed) and `PhoneTabs` (a `TabPanel`
    with the arrow keys)
  * `drag/` dragging a team onto a trip: `TeamDrag` (with `DragHelper`) and `DropTooltip` (the tooltip of the trip
    under the team). The chip that follows the pointer is `createChip` in `TeamDrag.js`
  * `plan/` the dispatch rules as plain functions on plain values: the farm (`Farm`), the trips (`Planner`), the state
    apart from the trips (`DispatchState`: the day shown and its Dates, the forecasts and the weather windows they
    give, the day's counts, the waiting teams' store) and the re-planning on a new forecast (`ForecastPlanner`)
  * `week/` the Week view: `WeekBoard` (a Scheduler with a day-tick view preset, `fillTicks`, the PercentBar,
    ResourceTimeRanges and Summary features, redrawn from the Day view's project while it shows) and `WeekCells` (one
    derived cell per vessel per day)
  * `feature/` the showcase's own Scheduler features, enabled in `DispatchScheduler`'s `features`: the time axis rows
    with the wave height chart (`ForecastHeader`), the outline of a held team's stop and the trips it fits on
    (`DropTarget`), and the hover linked between the map and the schedule (`MapLink`)
  * `schedule/` the `DispatchScheduler` (which also keeps the no-go ranges and the now line in the project's stores),
    the wave height chart (`WaveChart`), the trip tooltip (`TripTip`), the checks of a trip moved to a new time (`TripValidator`), and the rendering of the trips and their
    legs, the vessels, groups, ranges and the dependency (`TripRendering`)
  * `model/` `TripModel` (an `EventModelEnterprise`, a trip or one of its legs), `TripData` (a trip, its legs and the
    links between them as Scheduler data), `VesselModel` and `WaitingTeamModel` (a team waiting at the port)
  * `map/` the map (`TurbineMap`, a Widget with its turbines in a Store, `TurbineModel`, drawn from `MapModel` and
    `MapDrawing`), its viewport (`MapViewport` and the view arithmetic in `MapView`: zoom, pan and pinch), the
    `TurbineTooltip`, the selected turbine (`TurbineCard`) and the turbine
    drawing (`Turbine`)
  * `util/` formatting the planner's times of day, and the icons
* `resources/` the CSS: `app.css` imports the tokens, then one file per part of the app: the frame, the KPI header,
  the schedule (`schedule/`), the Week view, the drag, the map (`map/`) and the phone layout

| To change | Look in |
|-----------|---------|
| The farm, vessels, teams, jobs, trips, the two forecasts and the limits | `data/farm.json` |
| Transit times, the layout of the farm and the map | `lib/plan/Farm.js` |
| When a window closes | `lib/plan/DispatchState.js` |
| Whether a team fits on a trip, what a new forecast does to a trip, what a trip can still reach | `lib/plan/Planner.js` |
| Whether a trip may be dragged or edited to a new time | `lib/schedule/TripValidator.js` |
| How a trip bar, the vessel column and the no-go areas look | `lib/schedule/TripRendering.js`, `resources/schedule/` |
| The rows of the time axis, the wave height chart | `lib/feature/ForecastHeader.js`, `lib/schedule/WaveChart.js` |
| The turbine illustration and the map markers | `lib/map/Turbine.js` |
| Colours, light and dark | `resources/tokens.css` |

## Credits

The generic icons are [Phosphor Icons](https://phosphoricons.com) (MIT), Light weight, from `@phosphor-icons/core`.
The vessels, the helicopter and the crews are [Tabler Icons](https://tabler.io/icons) (MIT), outline;
`lib/util/Icons.js` draws the turbine in Phosphor's grid and line weight, and the map draws the substation from
Phosphor's lightning. The wave height chart is AG Charts Enterprise (`ag-charts-enterprise`), commercially licensed: see the licence keys in
the [getting started guide](../CONTRIBUTING.md#licence-keys).
