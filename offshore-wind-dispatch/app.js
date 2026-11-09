import { DomHelper } from '@bryntum/core-enterprise';
import { createShell } from '@showcases/shared';
// Structural CSS of Scheduler and of the products it builds on (Core, Grid), then the Svalbard theme, which renders
// light and dark from one file
import '@bryntum/scheduler-enterprise/scheduler.css';
import '@bryntum/scheduler-enterprise/svalbard.css';
import './resources/app.css';
// `?url` gives the URL of the data file in the build, wherever the showcase is deployed
import farmUrl from './data/farm.json?url';
import DispatchApp from './lib/DispatchApp.js';

/**
 * Offshore Wind Dispatch: the crew transfer vessels and helicopters of an offshore wind farm in a Bryntum Scheduler,
 * planned against the weather window. Drag a team onto a trip to see which turbines the trip can still reach before
 * the wave height closes the window, and bring in the next forecast to watch the plan change with it.
 *
 * `?state=forecast` opens with the 08:00 forecast applied, `?state=drag` with Team F held over Northern Tern's trip,
 * `?tab=map` with the map tab at phone widths.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://www.ag-grid.com/charts/javascript/area-series/
 */

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

    await app.start({ state : params.get('state') });

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
