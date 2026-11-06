import { EventHelper, Panel, Responsive, Store } from '@bryntum/core-enterprise';
import ShipmentModel from './model/ShipmentModel.js';
import ShipmentData from './simulation/ShipmentData.js';
import Simulator from './simulation/Simulator.js';
import GridSync from './sync/GridSync.js';
import GridDropZone from './sync/GridDropZone.js';
import { countKpis } from './util/Kpis.js';
import { statusText } from './util/Status.js';
import { hourMs } from './util/Time.js';
// Registers the widget types used below
import './KpiBar.js';
import './SimulationControls.js';
import './StatusLegend.js';
import './ShipmentGridPanel.js';
import './schedule/DockSchedule.js';

/**
 * The control tower: the KPI header with the simulated clock and the simulation controls, the AG Grid of inbound
 * shipments on the left, the dock door schedule on the right, a status legend below.
 *
 * The data is generated from the network (data/network.json) and a seed. The shipment store holds the shipments, the
 * Scheduler's project the dock doors and the booked slots. GridSync mirrors both into AG Grid, GridDropZone lets
 * shipments be dragged from the grid onto a door.
 *
 * Below 900px wide the app is `compact` (the Responsive mixin): the grid and the schedule stack.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/mixin/Responsive
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Splitter
 */
export default class ControlTowerApp extends Panel.mixin(Responsive) {
    static $name = 'ControlTowerApp';

    static type = 'controltowerapp';

    static configurable = {
        /**
         * The parsed data/network.json: the site, carriers, origins and dock doors
         * @config {Object}
         */
        network : null,

        /**
         * `true` at narrow widths, set by the `responsive` states
         * @prp {Boolean}
         */
        compact : null,

        // Both of the default narrow states (small, medium) are compact, below 900px
        responsive : {
            small  : { when : 400, compact : true },
            medium : { when : 900, compact : true },
            '*'    : { compact : false }
        },

        cls     : 'lct-app',
        bodyCls : 'lct-app-body',
        layout  : 'vbox'
    };

    construct(config) {
        const
            me                       = this,
            { site }                 = config.network,
            data                     = ShipmentData.generate(config.network),
            startDate                = new Date(site.startDate),
            endDate                  = new Date(startDate.getTime() + site.days * 24 * hourMs);

        me.shipmentStore = new Store({ modelClass : ShipmentModel, data : data.shipments });

        super.construct({
            ...config,
            tbar : {
                cls   : 'lct-toolbar',
                items : {
                    kpis     : { type : 'kpibar', flex : '1 1 auto', site : site.name },
                    controls : { type : 'simulationcontrols', flex : 'none' }
                }
            },
            items : {
                main : {
                    type   : 'container',
                    cls    : 'lct-main',
                    flex   : 1,
                    layout : 'hbox',
                    items  : {
                        grid     : { type : 'shipmentgridpanel', flex : 12 },
                        splitter : { type : 'splitter', cls : 'lct-splitter' },
                        schedule : {
                            type          : 'dockschedule',
                            flex          : 9,
                            startDate,
                            endDate,
                            now           : site.now,
                            shipmentStore : me.shipmentStore,
                            project       : {
                                resources    : data.docks,
                                events       : data.slots,
                                assignments  : data.assignments,
                                dependencies : data.dependencies
                            }
                        }
                    }
                }
            },
            bbar : { cls : 'lct-legend-bar', items : { legend : { type : 'statuslegend' } } }
        });

        me.createSimulator(site, endDate);
        me.schedule.on({ conflictsResolve : 'refreshKpis', thisObj : me });

        // A hidden tab pauses the simulation, it does not play on in the background
        EventHelper.on({
            element          : document,
            visibilitychange : () => document.hidden && me.simulator.pause(),
            thisObj          : me
        });
    }

    // The simulation, driven by the header's controls, refreshing the KPIs as it goes
    createSimulator(site, endDate) {
        const me = this;

        me.simulator = new Simulator({
            now           : site.now,
            endDate,
            seed          : site.seed,
            shipmentStore : me.shipmentStore,
            schedule      : me.schedule
        });

        me.widgetMap.controls.simulator = me.simulator;
        me.simulator.on({ tick : 'refreshKpis', shipmentDelay : 'onSimulatedDelay', thisObj : me });
    }

    get schedule() {
        return this.widgetMap.schedule;
    }

    /**
     * Schedules the initial slots, derives the statuses, then creates the grid, wires it to the schedule and starts the
     * simulation
     * @param {Object} [options]
     * @param {Boolean} [options.play] Start playing
     * @returns {Promise}
     */
    async start({ play = true } = {}) {
        const
            me                                      = this,
            { schedule, simulator, shipmentStore }  = me;

        await schedule.project.commitAsync();

        if (me.isDestroyed) {
            return;
        }

        simulator.refreshStatuses();

        const
            context = { now : simulator.now },
            gridApi = me.widgetMap.grid.createGrid({
                context,
                rowData : shipmentStore.map(shipment => shipment.toRow(schedule.eventStore.getById(shipment.id))),
                actions : {
                    book     : id => me.bookShipment(id),
                    unbook   : id => schedule.unbook(id),
                    expedite : id => me.expediteShipment(id)
                }
            });

        Object.assign(me, { gridApi, gridContext : context });

        me.gridSync = new GridSync({ gridApi, shipmentStore, schedule, onFlush : () => me.refreshKpis() });
        me.dropZone = new GridDropZone({ gridApi, schedule, shipmentStore });

        // The status bar panel is created with the grid
        gridApi.addEventListener('firstDataRendered', () => me.refreshKpis());

        // Unloaded shipments are filtered out to start with, the status filter brings them back
        gridApi.setFilterModel({
            status : { filterType : 'set', values : Object.keys(statusText).filter(status => status !== 'done') }
        });

        if (play) {
            simulator.play();
        }
    }

    doDestroy() {
        this.simulator?.destroy();
        super.doDestroy();
    }

    bookShipment(id) {
        this.showSlot(this.schedule.book(this.shipmentStore.getById(id)));
    }

    expediteShipment(id) {
        this.showSlot(this.schedule.expedite(id));
    }

    // The truck made late by Simulate delay: its slot, moved by the engine, selected and scrolled into view
    onSimulatedDelay({ shipment }) {
        this.refreshKpis();
        this.showSlot(this.schedule.eventStore.getById(shipment.id));
    }

    // Selects a slot, which selects its row, and scrolls it into view
    showSlot(slot) {
        const { schedule } = this;

        if (slot) {
            schedule.selectEvent(slot);
            schedule.scrollEventIntoView(slot, { animate : true, highlight : true, block : 'center' });
        }
    }

    /**
     * The KPI header, the footer's late count, the conflicts to resolve and the live countdowns, after each tick or
     * batch of changes
     */
    refreshKpis() {
        const
            me                                      = this,
            { simulator, gridApi, gridContext }     = me;

        if (!gridApi || gridApi.isDestroyed()) {
            return;
        }

        const counts = countKpis(me.shipmentStore, me.schedule.eventStore);

        me.widgetMap.kpis.setValues(simulator.now, counts);
        gridApi.getStatusPanel('lateCount')?.setCounts(counts);
        me.schedule.conflictCount = counts.conflicts;

        if (gridContext.now !== simulator.now) {
            gridContext.now = simulator.now;
            // The countdowns of the rendered rows, relative to the new now. Not flashed, the ETA did not change
            gridApi.refreshCells({ columns : ['eta'], force : true, suppressFlash : true });
        }
    }

    // The grid and the schedule stack on narrow screens, see app.css. Simulate delay is its icon, the counters keep
    // the room
    updateCompact(compact) {
        this.element.classList.toggle('lct-compact', compact);
        this.widgetMap.delay.text = compact ? null : 'Simulate delay';
    }
}

ControlTowerApp.initClass();
