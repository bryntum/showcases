import { EventHelper, Panel, Responsive, Store } from '@bryntum/core-enterprise';
import logoUrl from '@showcases/shared/logo-round.svg?url';
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
 * Below 1200px wide the app is `compact` (the Responsive mixin): the grid and the schedule stack. Below 1280px the
 * header makes room for the counters, Simulate delay shows its icon only.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/widget/Panel
 * https://bryntum.com/docs/api/Core/widget/mixin/Responsive
 * https://bryntum.com/docs/api/Core/widget/Splitter
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

        /**
         * `true` while there is room in the header for the Simulate delay label, set by the `responsive` states
         * @prp {Boolean}
         */
        delayLabel : null,

        // Both of the default narrow states (small, medium) are compact, below 1200px (phones, tablets, narrow
        // windows), where the schedule beside the grid would be too narrow. Below 1280px the counters need the room
        // of the Simulate delay label
        responsive : {
            small  : { when : 400, compact : true, delayLabel : false },
            medium : { when : 1200, compact : true, delayLabel : false },
            large  : { when : 1280, compact : false, delayLabel : false },
            '*'    : { compact : false, delayLabel : true }
        },

        cls     : 'lct-app',
        bodyCls : 'lct-app-body',
        layout  : 'vbox'
    };

    construct(config) {
        const
            me        = this,
            { site }  = config.network,
            data      = ShipmentData.generate(config.network),
            startDate = new Date(site.startDate),
            endDate   = new Date(startDate.getTime() + site.days * 24 * hourMs);

        me.shipmentStore = new Store({ modelClass : ShipmentModel, data : data.shipments });

        super.construct({
            ...config,
            tbar : {
                cls   : 'lct-toolbar',
                items : {
                    // The Bryntum mark, linking to the gallery, where the page header is hidden (phones, short screens)
                    logo : {
                        type : 'widget',
                        cls  : 'lct-toolbar-logo',
                        html : `<a href="../" title="All showcases" aria-label="Bryntum showcases"><img src="${logoUrl}" alt=""></a>`
                    },
                    kpis     : { type : 'kpibar', flex : '1 1 auto', site : site.name, now : site.now },
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
                                resources          : data.docks,
                                events             : data.slots,
                                assignments        : data.assignments,
                                dependencies       : data.dependencies,
                                resourceTimeRanges : data.downtime
                            }
                        }
                    }
                }
            },
            bbar : { cls : 'lct-legend-bar', items : { legend : { type : 'statuslegend' } } }
        });

        me.createSimulator(site, endDate);

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
        me.simulator.on({ tick : 'requestKpiRefresh', shipmentDelay : 'onSimulatedDelay', thisObj : me });
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
            me                                     = this,
            { schedule, simulator, shipmentStore } = me;

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
                    unbook   : id => me.unbookShipment(id),
                    expedite : id => me.expediteShipment(id)
                }
            });

        Object.assign(me, { gridApi, gridContext : context });

        me.gridSync = new GridSync({ gridApi, shipmentStore, schedule, onFlush : () => me.requestKpiRefresh() });
        me.dropZone = simulator.dropZone = new GridDropZone({ gridApi, schedule, shipmentStore });

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
        const me = this;

        // The simulator first, it ticks against the stores and the views
        me.simulator?.destroy();
        me.gridSync?.destroy();
        me.dropZone?.destroy();
        super.doDestroy();
        me.shipmentStore.destroy();
    }

    bookShipment(id) {
        return this.revealBooked(this.schedule.book(this.shipmentStore.getById(id)));
    }

    // Unbooking lets the slots after it move up, the engine schedules them
    unbookShipment(id) {
        this.schedule.unbook(id);

        return this.schedule.reschedule();
    }

    expediteShipment(id) {
        return this.revealBooked(this.schedule.expedite(id));
    }

    // A slot booked or moved: scrolled to once the engine has scheduled it, the slots before it may push it later
    async revealBooked(slot) {
        const { schedule } = this;

        if (slot) {
            await schedule.reschedule();
            schedule.revealSlot(slot);
        }
    }

    // The truck made late by Simulate delay: its slot, moved by the engine, selected and scrolled into view
    onSimulatedDelay({ shipment }) {
        this.refreshKpis();
        this.schedule.revealSlot(this.schedule.eventStore.getById(shipment.id));
    }

    // A tick sends several batches to the grid. The KPIs are counted once for them all, in a timeout after them
    // (Delayable, cancelled on destroy). Not an idle callback, Safari has none
    requestKpiRefresh() {
        this.kpiIdle ??= this.setTimeout(this.refreshKpis, 0);
    }

    /**
     * The KPI header, the footer's late and conflict counts and the live countdowns
     */
    refreshKpis() {
        const
            me                                  = this,
            { simulator, gridApi, gridContext } = me;

        me.kpiIdle = null;

        if (!gridApi || gridApi.isDestroyed()) {
            return;
        }

        const counts = countKpis(me.shipmentStore, me.schedule.eventStore);

        me.widgetMap.kpis.setValues(simulator.now, counts);
        gridApi.getStatusPanel('lateCount')?.setCounts(counts);

        if (gridContext.now !== simulator.now) {
            gridContext.now = simulator.now;
            // The countdowns of the rendered rows, relative to the new now: forced, as the ETAs did not change, and not
            // flashed. EtaCellRenderer#refresh updates them in place
            gridApi.refreshCells({ columns : ['eta'], force : true, suppressFlash : true });
        }
    }

    // The grid and the schedule stack on narrow screens, half the height each. Wide, they share the width 12 to 9.
    // Flipping the box layout sets the main container's flex-direction, which the splitter (orientation 'auto')
    // follows. Setting the flex also drops the sizes of an earlier splitter drag
    updateCompact(compact) {
        const { main, grid, schedule } = this.widgetMap;

        this.toggleCls('lct-compact', compact);
        main.layout.horizontal = !compact;
        grid.flex              = compact ? '1 1 50%' : 12;
        schedule.flex          = compact ? '1 1 50%' : 9;
    }

    // Without its label Simulate delay is its icon, the tooltip tells what it does
    updateDelayLabel(delayLabel) {
        this.widgetMap.delay.text = delayLabel ? 'Simulate delay' : null;
    }
}

ControlTowerApp.initClass();
