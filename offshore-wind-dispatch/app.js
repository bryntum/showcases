/**
 * Offshore Wind Dispatch: a marine coordinator's day at an offshore wind farm, its trips planned against the weather.
 * Loads the farm data and starts the app; the URL options (`?state`, `?view`, `?tab`) are in the README.
 *
 * ## What this demonstrates
 *
 * - **Nested events on the Enterprise tier** — a trip is a parent event, its turbine stops and the hops between them
 *   are child events in a tree event store, drawn inside it by the NestedEvents feature. See {@link TripModel}.
 * - **EventBuffer for the sail out and back** — the trip's `preamble` and `postamble`, its departure and return the
 *   outer dates, with the clock times drawn by the buffer renderer. See {@link DispatchScheduler#renderTransits}.
 * - **The scheduling engine places every trip** — the app supplies the stops and their durations, `chain`
 *   dependencies between the legs and a `startnoearlierthan` constraint; the engine works out each leg's dates, the
 *   waits on station and the trip's roll-up. See {@link TripModel#layout}.
 * - **Dependencies with a lag into a nested event** — a trip waits for another trip's work, drawn as a line into one
 *   stop. See {@link PlanDependencyModel}.
 * - **ResourceTimeRanges** — each vessel's weather no-go, the ghost of a trip brought forward, and the outline of
 *   where a held team's stop would go. See {@link DispatchScheduler#syncRanges} and {@link DropTarget}.
 * - **Custom Scheduler features** — the showcase's own add-ons are SchedulerFeature subclasses enabled in the
 *   Scheduler's `features`. See {@link ForecastHeader}, {@link DropTarget} and {@link MapLink}.
 * - **View preset header rows with renderers, an AG Charts Enterprise chart in a header cell** — the wave height
 *   and the wind in the time axis, hour for hour over the trips; the wave one series in two segments, the forecast's
 *   spread a range area. See {@link ForecastHeader} and {@link WaveChart}.
 * - **EventDrag `validatorFn` and a cut-down TaskEdit** — a trip dragged or edited to a time that breaks its window,
 *   its vessel's other trip or a dependency is refused with the reason. See {@link DispatchScheduler#validateTripDrag}
 *   and {@link DispatchScheduler#checkTripTime}.
 * - **DragHelper from outside the Scheduler, with a Tooltip** — waiting teams dragged from a store-backed List onto a
 *   trip or a vessel's row, checked by a synchronous planner on every move. See {@link TeamDrag}, {@link TeamTray}
 *   and {@link DropController}.
 * - **StateTrackingManager** — a new forecast re-plans the day in one transaction, its Undo is the STM's. See
 *   {@link ForecastPlanner}.
 * - **A second Scheduler as a week board** — `fillTicks`, the PercentBar and Summary features, derived records kept
 *   by `syncDataOnLoad`. See {@link WeekBoard}.
 * - **Event highlighting linked to a custom SVG map** — `highlightEvents()` and the Scheduler's hover events. See
 *   {@link MapLink} and {@link TurbineMap}.
 * - **Panels, tools, ButtonGroup, TabPanel and the Responsive mixin** — the screen, its Day / Week switch and the
 *   phone tabs below 760px. See {@link DispatchApp}, {@link SchedulePanel} and {@link PhoneLayout}.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 */
import { DomHelper } from '@bryntum/core-enterprise';
import { createShell } from '@showcases/shared';
// Svalbard renders light and dark from one file
import '@bryntum/scheduler-enterprise/scheduler.css';
import '@bryntum/scheduler-enterprise/svalbard.css';
import './resources/app.css';
// `?url` gives the URL of the data file in the build, wherever the showcase is deployed
import farmUrl from './data/farm.json?url';
import DispatchApp from './lib/DispatchApp.js';

const
    params    = new URLSearchParams(location.search),
    container = createShell({ title : 'Offshore Wind Dispatch', source : 'offshore-wind-dispatch' });

try {
    const response = await fetch(farmUrl);

    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }

    const app = new DispatchApp({
        appendTo : container,
        data     : await response.json(),
        tab      : params.get('tab') === 'map' ? 'map' : 'schedule'
    });

    await app.start({ state : params.get('state'), view : params.get('view') });

    // For the screenshots and the tests: fonts loaded, chart drawn
    await document.fonts.ready;
    document.documentElement.dataset.ready = 'true';
}
catch(error) {
    console.error(error);
    DomHelper.createElement({
        parent    : container,
        className : 'ow-load-error',
        role      : 'alert',
        text      : 'The showcase could not be loaded. Check your connection and reload the page.'
    });
}
