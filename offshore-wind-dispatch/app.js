import { DomHelper } from '@bryntum/core-enterprise';
import { createShell } from '@showcases/shared';
// Svalbard renders light and dark from one file
import '@bryntum/scheduler-enterprise/scheduler.css';
import '@bryntum/scheduler-enterprise/svalbard.css';
import './resources/app.css';
// `?url` gives the URL of the data file in the build, wherever the showcase is deployed
import farmUrl from './data/farm.json?url';
import DispatchApp from './lib/DispatchApp.js';

/**
 * Offshore Wind Dispatch: loads the farm data and starts the app. The URL options (`?state`, `?view`, `?tab`) are in
 * the README.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
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
