# EV Operations

One app, three views of an EV operation, switched by the buttons in the toolbar:

* **Production line**: a Scheduler (Enterprise tier) with work centers and production batches
* **Service & charging**: a grouped Scheduler with service bays and DC fast chargers
* **Vehicle program**: a Gantt with program phases, dependencies, baselines and a milestone

**Simulate** advances a simulated "now". Bars, locked columns, the status legend and the detail panel follow it live,
without changing any record data. Click a bar for its details, double-click it to edit it in a drawer.

**[Live demo](https://bryntum.github.io/showcases/ev-operations/)**

To run it locally, see the [root README](../README.md#running-locally).

## Bryntum packages

Each Bryntum 8 package exports its own classes only, so `Scheduler` comes from `@bryntum/scheduler-enterprise`,
`Gantt` from `@bryntum/gantt-enterprise` and the helpers and widgets from `@bryntum/core-enterprise`. Importing a
package also registers its features, which is why `OperationsScheduler` imports the Grid package (for the Group
feature) and `ProgramGantt` the Scheduler package (for the TimeRanges feature).

## Files

* `app.js` the scenario and view configs. It imports the CSS (`gantt.css`, the structural CSS of Gantt and the products
  it builds on, the Svalbard theme, then `resources/app.css`) and the data files
* `lib/` the classes, one per file, and the modules they are split into:
  * `OperationsApp.js`, `DetailPanel.js`, `SimulationControls.js`, `StatusLegend.js`, `StatusKey.js` the app's widgets
  * `OperationsScheduler.js`, `ProgramGantt.js` the views, `SimulatedView.js` and `TimeSpanEditing.js` the mixins
    they share (the editor drawer and the Shift + arrow key nudge)
  * `simulation/` the parts of `SimulatedView`: the clock (`SimulationClock`) and the now line and pill (`NowMarker`)
  * `scheduler/` the parts of `OperationsScheduler`: the locked columns per view (`StationColumns`,
    `ServiceColumns`), bar content per event type, the charging model, gap indicators, blocked time, the editor and the
    detail panel content
  * `gantt/` the parts of `ProgramGantt`: the locked columns (`ProgramColumns`), slip tracking (a mixin), bar
    content, dependency routing and the detail panel content
  * `bar/` the bar anatomy shared by all views, and `ClippedBars`, the bars clipped by the view edge
  * `model/` the models: `OpsEvent`, `OpsResource`, `GapDependency` and `ProgramTask`
  * `util/` time, formatting, text measuring, feature config and responsive column helpers, `Glyphs.js` inline SVG
    icons
* `resources/` the demo CSS: `app.css` imports one file per part of the app, one file per view adds its cells
* `data/` the three datasets, loaded by each view's project (`loadUrl`)

Mixins own stateful lifecycle; plain functions taking `view` do pure rendering.

## Code tour

### App shell: `lib/OperationsApp.js` and `lib/SimulationControls.js`

`app.js` only holds the scenario and view configs and creates an `OperationsApp`, a `Panel` with the view switch, the
views in a card layout, the detail panel and one status legend per view. It owns the detail panel's open state: a click
opens it after a short delay (a double-click into the editor cancels it), a keyboard selection opens it at once, a drag
or resize selects without opening it, and clearing the selection or the panel's close button closes it.
`SimulationControls` is a `Container` with the Reset and Simulate buttons, bound to the active view through its `view`
config. It follows the view's `simulatingChange` and `simTick` events. Reset comes first and Simulate has a fixed
minimum width, so the buttons do not shift as the labels change. If the data fails to load, `app.js` shows a message
in place of the app.

### Phones: the `responsive` configs

Below 700px the app switches to its small layout, with the public responsive configs only, the way Bryntum's own
responsive demos do:

* Each view has `responsiveLevels` (`small` below 700px, `large` above, in `SimulatedView`). The columns'
  `responsiveLevels` narrow the primary column and hide the secondary ones (Shift, Vehicle, Slip) at `small`, see
  `util/Responsive.js`, so the timeline stays visible. CSS container queries drop the cell parts a narrow column has no
  room for (the glyph tile, the live value, the owners)
* `OperationsApp` mixes in `Responsive`, its `small` state sets `compact`: short view tabs, icon-only Reset and
  Simulate (the labels become tooltips) and no heading. The toolbar keeps its default overflow menu as a fallback.
  The detail panel overlays the bottom of the timeline, and the legend wraps

### Gap pills: `lib/model/GapDependency.js` and `lib/scheduler/GapIndicators.js`

The pills between consecutive events are dependencies. `syncGapDependencies()` keeps one inactive `GapDependency`
(`active : false`, so they never affect scheduling) between each pair of neighbours on a resource, and commits them so
they stay out of `project.changes`. The Dependencies feature's `renderer` (`renderGap`) then replaces the line with a
dashed segment across the gap and a centered label, sized from the rendered boxes, so it follows a drag or a resize
live. Gaps shorter than the scenario's `tightGap` are flagged red.

### Time-driven rendering: `lib/SimulatedView.js` and `lib/simulation/`

A mixin shared by both scheduler views and the Gantt, composed of `SimulationClock`, `NowMarker` and `ClippedBars`.
The clock is the `simNow` config: setting it moves the past shading and the now line (two records in the project's
time range store, edited without change tracking), then calls the view's `paintSimTick(now, old)`. Statuses (done,
live, not started) are derived from `simNow` in the renderers, so no event or task is modified. `paintSimTick` in
`OperationsScheduler` and `ProgramGantt` repaints only what crossed a boundary: `refreshEvents()` re-runs the event
renderer for the visible bars in one pass, rows are not re-rendered. `ClippedBars#syncClippedBars` then hides parts of
bars clipped by the view edge. The now pill in the header has a halo in the header colour (a `box-shadow` spread),
which hides the time axis label below it.

### Live locked columns: `scheduler/StationColumns.js`, `scheduler/ServiceColumns.js`, `gantt/ProgramColumns.js`

Plain column configs with renderers that read `grid.simNow`: the shift strip and OEE, bay and charger progress rings
with the car in the bay, and the schedule slip over six weeks (frozen at its end for a finished phase, which is drawn
on its own scale). The columns listed in the scenario's `liveColumns` are refreshed on each tick by
`SimulatedView#refreshLiveCells`: cell by cell (`column.refreshCell(record)`) for the resources that changed, or with
`refreshColumn()` for all rendered rows with `liveAllRows`. The group headers in the scenario's `groupColumn` follow.

### Status filter: `lib/StatusLegend.js` and `lib/StatusKey.js`

A horizontal multi-select `List` with a swatch and a live count per status, finished items included under Done. Its
selection sets the view's `visibleStatuses`, which filters the event store (or the Gantt's task store). The counts
update on the view's `legendStatusesSync` event, fired after each tick. After a divider, the `StatusKey` widget's
`keyItems` config shows a key for the blocked time hatches, outside the list's store, so the key does not select or
filter.

## Styling

`resources/app.css` imports the demo's tokens (`tokens.css`), the bar anatomy (`bars.css`, `bar-details.css`) and one
file per part of the app, in cascade order. One file per view adds its cells. Neutral colours and the radii come from
the theme (`--b-neutral-*`, `--b-text-*`, `--b-border-*`, `--b-widget-border-radius`), so the demo follows light /
dark mode, the font from the shared tokens. The status and avatar colours are mixed from the theme palette
(`--b-color-*`), only the car paints are colours of their own. The demo adds its status palette, the bar layers, the
gap pills and the now pill.

Bryntum components are restyled through their CSS variables and public configs where they offer one: the app panel's
body through `bodyCls`, the locked column headers through the columns' `cls` and `--b-grid-header-*`, the time axis
labels through the header rows' `align` and `--b-horizontal-time-axis-*`, blocked time through
`--b-resource-time-range-*`, the compact view tabs through `--b-button-padding-inline`.

## Workarounds

These spots work around open Bryntum issues or gaps in the public API and are marked in the code:

* `bryntum/support#13982`: no public hook for header overlay content, the now dot opens up the internal header markup
  (`.b-grid-header-scroller-normal`, `.b-grid-headers-normal`, timeline.css)
* `.b-sch-time-axis-column { overflow : visible }` lets the now pill overhang the time axis column (timeline.css), part
  of the same gap
* `--b-grid-header-applied-background`, the header's resolved background, gives the now pill's halo the header colour
  (timeline.css), it is not a documented variable
* `.b-group-row` and `.b-group-state-icon`: the Group feature has no variables for its rows, the service view's group
  headers style its internal classes (service.css)
* `.b-tree-cell-inner` and `.b-tree-cell-value`: the tree cell has no variable to let its content fill the width
  left by the indent (program.css)
* `.b-gantt-task-content::before` and the milestone restyle: the default milestone shape has no variable or config to
  replace it, the milestone diamond overrides the internal markup (program.css)
* `.b-sch-dependency-arrow path` and `:not(.b-click-area)`: the arrow head is styled through the internal marker
  path, and the invisible click area shares `.b-sch-dependency` (program.css)
* Gantt has no per-row bar size: getRowHeight sizes rows only, bars use one canvas-wide `--b-event-size`. The slimmer
  group and milestone rows set it on their bars (program.css)
* The status legend hides the List's `.b-selected-icon`: it toggles statuses through List multiSelect, but wants no
  checkmark (legend.css)
* `queueMicrotask` in `SimulatedView`: the project's `dataReady` fires mid-commit, the store edits that follow it are
  deferred, a nested commit would start otherwise
* `bryntum/support#14015`: the default dependency marker is shared by all views, the Gantt uses its own `markerDef`
* `bryntum/support#14016`: `clickWidth : 1` on the gap dependencies, a wider click area would render the gap twice
* `bryntum/support#14017`: the Gantt dependency renderer receives the boxes swapped. `renderDependency` detects which
  box is the predecessor's from its row, so the route stays right once the issue is fixed
* `bryntum/support#14018`: the EventResize `validatorFn` receives `eventRecord`, not the documented `record`
