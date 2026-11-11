import { DomHelper } from '@bryntum/core-enterprise';
import { createShell } from '@showcases/shared';
// Structural CSS of Gantt and of the products it builds on (Core, Grid, Scheduler), then the Svalbard theme, which
// renders light and dark from one file
import '@bryntum/gantt-enterprise/gantt.css';
import '@bryntum/gantt-enterprise/svalbard.css';
import './resources/app.css';
import './resources/production.css';
import './resources/service.css';
import './resources/program.css';
// `?url` gives the URL of the data file in the build, wherever the showcase is deployed
import productionUrl from './data/production.json?url';
import serviceUrl from './data/service.json?url';
import programUrl from './data/program.json?url';
import OperationsApp from './lib/OperationsApp.js';
// Registers the view types used by the configs below
import './lib/OperationsScheduler.js';
import './lib/ProgramGantt.js';
import { stationColumns } from './lib/scheduler/StationColumns.js';
import { renderServiceGroup, serviceColumns } from './lib/scheduler/ServiceColumns.js';
import { programColumns } from './lib/gantt/ProgramColumns.js';
import { dayMs, minuteMs } from './lib/util/Time.js';

/**
 * EV Operations, three views of one operation:
 *
 * 1. Production line - Scheduler (Enterprise tier, formerly Scheduler Pro), work centers and production batches
 * 2. Service & charging - Scheduler, service bays and DC fast chargers, service jobs and charging sessions
 * 3. Vehicle program - Gantt, program phases with dependencies, critical path and a milestone
 *
 * Learn more:
 * https://bryntum.com/docs/api/Scheduler/view/Scheduler
 * https://bryntum.com/docs/api/Gantt/view/Gantt
 * https://bryntum.com/docs/api/Core/layout/Card
 * https://bryntum.com/docs/api/Grid/feature/Group
 */

const
    // The shift shown by the Production line view
    productionShift = { name : 'Shift A', start : '2026-10-21T06:00', end : '2026-10-21T14:00' },
    viewConfigs     = {
        production : {
            type      : 'operationsscheduler',
            startDate : '2026-10-21T06:00',
            endDate   : '2026-10-21T13:30',
            tickSize  : 114,
            project   : { loadUrl : productionUrl },
            features  : { group : false },
            columns   : stationColumns('Work center', productionShift),
            scenario  : {
                tab         : 'Production line',
                shortTab    : 'Production',
                title       : 'Plant 3 · Body & assembly',
                summary     : 'Wed 21 Oct · Shift A',
                legend      : { ok : 'Running', focus : 'Expedite', late : 'Behind', sched : 'Planned', done : 'Done' },
                initialNow  : '2026-10-21T09:40',
                // Gaps shorter than this are flagged red
                tightGap    : 15,
                step        : minuteMs,
                // The shift strip runs from its start to its end
                shift       : productionShift,
                // Locked columns refreshed on every tick, for every row (OEE and the strip change with time everywhere)
                liveColumns : ['shift'],
                liveAllRows : true,
                // Key for the blocked time hatches in the legend bar
                blockedKey  : [{ text : 'Blocked' }, { text : 'Down', down : true }]
            }
        },
        service : {
            type      : 'operationsscheduler',
            startDate : '2026-10-21T08:00',
            endDate   : '2026-10-21T15:00',
            tickSize  : 117,
            project   : { loadUrl : serviceUrl },
            features  : {
                // Bays and chargers in collapsible groups, with a live occupancy summary in the header
                group : {
                    field        : 'kind',
                    headerHeight : 44,
                    indent       : false,
                    showCount    : false,
                    renderer     : renderServiceGroup
                }
            },
            columns  : serviceColumns('Bay / charger'),
            scenario : {
                tab         : 'Service & charging',
                shortTab    : 'Service',
                title       : 'Service Center North · Bays & fast chargers',
                summary     : 'Wed 21 Oct · 4 bays · 4 chargers',
                legend      : { ok : 'In service', focus : 'Charging', late : 'Overrun', sched : 'Booked', done : 'Finished' },
                initialNow  : '2026-10-21T11:20',
                tightGap    : 15,
                step        : minuteMs,
                liveColumns : ['primary', 'vehicle'],
                // Its group headers show a live summary
                groupColumn : 'primary',
                blockedKey  : [{ text : 'Blocked' }]
            }
        },
        program : {
            type      : 'programgantt',
            startDate : '2026-01-01',
            endDate   : '2027-07-01',
            project   : { loadUrl : programUrl, startDate : '2026-01-01' },
            columns   : programColumns('Phase'),
            scenario  : {
                tab         : 'Vehicle program',
                shortTab    : 'Program',
                title       : 'Program NV9 · Design to production',
                summary     : 'Jan 2026 – Jun 2027',
                legend      : { ok : 'On track', focus : 'Critical path', late : 'At risk', sched : 'Not started', done : 'Completed' },
                initialNow  : '2026-10-21T00:00',
                step        : 0.6 * dayMs,
                liveColumns : ['primary', 'slip']
            }
        }
    };

// The page header, above the container the app renders into
const
    container = createShell({ title : 'EV Operations', source : 'ev-operations' }),
    app       = new OperationsApp({ appendTo : container, viewConfigs });

// Load all three datasets. The time axes are configured, the active view is already scrolled to now as it painted
try {
    await app.loadViews();
}
catch(error) {
    console.error(error);
    app.destroy();
    DomHelper.createElement({
        parent    : container,
        className : 'ev-load-error',
        role      : 'alert',
        text      : 'The showcase data could not be loaded. Check your connection and reload the page.'
    });
}
