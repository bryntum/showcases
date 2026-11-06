import { DomHelper } from '@bryntum/core-enterprise';
import { createShell } from '@showcases/shared';
// Structural CSS of Scheduler and of the products it builds on (Core, Grid), then the Svalbard theme, which renders
// light and dark from one file
import '@bryntum/scheduler-enterprise/scheduler.css';
import '@bryntum/scheduler-enterprise/svalbard.css';
import './resources/app.css';
// `?url` gives the URL of the data file in the build, wherever the showcase is deployed
import networkUrl from './data/network.json?url';
// AG Grid's logo for each mode, shown next to the Bryntum logo in the header
import agGridLogoLight from './resources/ag-grid-logo-light.svg?url';
import agGridLogoDark from './resources/ag-grid-logo-dark.svg?url';
// AG Grid's licence key, modules and theme, before any grid is created
import './lib/grid/AgGridSetup.js';
import ControlTowerApp from './lib/ControlTowerApp.js';

/**
 * Logistics Control Tower: the inbound shipments of a distribution centre in AG Grid (Enterprise), the dock doors in
 * a Bryntum Scheduler (Enterprise tier, formerly Scheduler Pro), kept in sync live while a simulation moves the trucks.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://www.ag-grid.com/javascript-data-grid/
 */

const container = createShell({
    title   : 'Logistics Control Tower',
    source  : 'logistics-control-tower',
    partner : {
        name : 'AG Grid',
        href : 'https://www.ag-grid.com',
        logo : { light : agGridLogoLight, dark : agGridLogoDark }
    }
});

try {
    const response = await fetch(networkUrl);

    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }

    const app = new ControlTowerApp({ appendTo : container, network : await response.json() });

    await app.start();
}
catch(error) {
    console.error(error);
    DomHelper.createElement({
        parent    : container,
        className : 'lct-load-error',
        role      : 'alert',
        text      : 'The showcase could not be loaded. Check your connection and reload the page.'
    });
}
