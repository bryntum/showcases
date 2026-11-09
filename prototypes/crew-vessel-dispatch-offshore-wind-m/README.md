# Offshore Wind Dispatch: design mockup

The look of the proposed showcase, to judge before it is built. Static HTML and SVG inside the real showcase shell
and Svalbard theme. It has no Bryntum widgets, no engine and no interaction. It is not the production code.

## See it

```shell
npm run dev
# then open /prototypes/crew-vessel-dispatch-offshore-wind-m/?state=plan   (or drag, forecast; add &tab=map at phone width)
node prototypes/crew-vessel-dispatch-offshore-wind-m/render.mjs   # writes renders/*.png, needs Node 22.22.2+
```

## Revision 3 (owner's note: no simulation, too busy, no current date)

* **No simulation.** The "Play the day" button and the "Next forecast 08:00" ticker are gone from the KPI bar. The
  `forecast` state stays as a key state because it is the idea's point (weather changes the plan). In the build it
  happens when the forecast data changes, not on a clock the visitor watches
* **Less on screen.** The KPI bar has three counts instead of five ("Waiting" repeats the team tray; "Offshore 14 techs"
  doesn't help any decision). "Transit" is gone from the legend because the hatched leg with the vessel icon explains
  itself
* **The current date is visible.** The page opens on the real date (`new Date()`). The time axis has a day row
  over the hours ("Sunday 8 November 2026 · Today"), the KPI clock leads with the date ("Sun 8 Nov  07:40"), and the
  now line is labelled "Now 07:40". Work the forecast pushes out goes to the real next day (e.g. "→ Mon") instead
  of a hard-coded "Tue". The times of day (07:40, window 14:00) stay fixed so every state still makes sense

## Revision 2 (owner's note: iconry, AG Charts for wave height)

* **Icons** (`icons.js`): every Font Awesome glyph is gone. Generic icons are Phosphor Light (`@phosphor-icons/core`,
  the set Logistics Control Tower already ships). Phosphor has no vessels or helicopter, so five are drawn here in
  the same 256 grid and 12 unit line: crew transfer vessel, SWATH, helicopter, offshore substation, turbine. The
  resource tiles, trip transit legs, map substation and port, KPI bar, toast and drag chip use them
* **Wave height** (`wave-chart.js`): an AG Charts Community area chart (`ag-charts-community` 14.3.0, already in
  the repo), x axis pinned to 06:00–18:00 with no padding so each hour sits over the same hour of the trips.
  Points are coloured by limit, the CTV 1.5 m and SWATH 2.0 m limits are cross lines with tinted bands above them,
  and a vertical cross line marks when the CTV window closes (plus a dashed "was 14:00" in the forecast state).
  Hover shows Hs and which vessels can still transfer. Colours are read from the look's CSS variables and the
  chart is re-themed when light/dark changes

| State | What it shows |
|-------|---------------|
| `plan` | 07:40. Six vessels and helicopters with their trips; turbine stops sit inside each trip. The hourly wave height is drawn against the 1.5 m CTV and 2.0 m SWATH limits. A hatched weather no-go area runs from the time each limit is crossed. Sea Puffin's trip is 18 min past the window. Northern Tern's trip is selected and its route shows on the map |
| `drag` | **The wow moment.** Team F (HV) is dragged onto Northern Tern's trip. A preview stop for T-34 appears, and the tooltip shows "back at port 13:54, the window closes 14:00". The map dims every turbine the trip can't reach and rings the 9 it still can |
| `forecast` | 08:02. The 08:00 forecast brings the 1.5 m crossing forward to 12:00 (it was 14:00). Three trips are trimmed (their stops move to the next day), Sea Puffin's trip moves to the next day, and Heli 1's pickup is brought forward. A banner offers Undo and "Review 5 changes" |

Renders: `desktop-{plan,drag,forecast}-{light,dark}.png` at 1440 × 900; `phone-plan-{light,dark}.png`,
`phone-forecast-light.png` and `phone-drag-map-dark.png` at 390 × 844; `turbine-{light,dark}.png` for the turbine
close-up.

## Design decisions

* **The window is the headline.** The KPI bar leads with "CTV weather window, closes 14:00, 6 h 20 min left". The
  forecast state turns it red and strikes through the old time. Everything else on screen explains that one number
* **The weather lives in the time axis.** The hourly Hs chart (AG Charts) sits under the hours, with the limit lines across it, so
  you read each trip against the sea state above it. Helicopters get their own row: wind at hub height, with values
  over 20 m/s in the helicopter purple
* **One hue per meaning.** Blue is on plan, orange is past the window, red is moved or cancelled, purple is
  helicopters, teal is reachable while dragging, and hatched orange is weather no-go. Every colour comes from the
  Svalbard palette through `light-dark()`, the same way as the other showcases
* **Nested trips.** A trip is one bar: transit legs are hatched with the vessel icon, turbine stops are solid with the
  turbine ID and the hours. This is the vessel-to-turbine hierarchy the build would use nested events for
* **The turbine illustration** (`turbine.js`) shows the selected turbine on its transition piece. The sea at its foot is
  drawn at the forecast wave height, with the vessel's limit marked on the boat landing. The blades turn (the
  renders turn the animation off). The 60 map markers reuse its three-blade glyph
* **Phone:** the KPI bar keeps the date and time, the window and the alert. The date in the axis stays pinned beside the label column as the hours scroll. Schedule and map become tabs. The schedule
  scrolls sideways at 44 px per hour and opens at 07:00, so the window line is in view

## Mapping to the build (for the Builder, not built here)

| Mockup | Bryntum |
|--------|---------|
| Weather no-go hatch per vessel | `ResourceTimeRanges`, recomputed from the forecast per resource limit |
| Hs and wind rows in the axis | A custom time axis header row with a renderer (Builder to confirm the API) |
| Trip with turbine stops | Nested events (parent trip, child stops) |
| HV isolation → T-45 arrow | `Dependencies` |
| "PAX" bar in the resource column | A resource utilization column / `ResourceUtilization` |
| Team chips → trip | Drag from an external grid or list, with a drop validator that checks the window |
| Map panel | A custom widget next to the Scheduler, driven by the same stores |
