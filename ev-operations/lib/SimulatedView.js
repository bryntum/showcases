import SimulationClock from './simulation/SimulationClock.js';
import NowMarker from './simulation/NowMarker.js';
import ClippedBars from './bar/ClippedBars.js';
import { isLiveStatus } from './util/Time.js';
import { loadFonts } from './util/TextMeasure.js';

// How long an element keeps the `ev-flip` class after its status changed live, longer than the CSS transition
const flipMs = 700;

/**
 * Mixin shared by the three views. Combines the simulated clock, the now marker and the clipped bar handling, and keeps
 * what the renderers share in sync with the clock and the data: statuses for the legend, live locked cells, people and
 * status flips.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/Base
 * https://bryntum.com/docs/api/Scheduler/feature/TimeRanges
 */
export default Target => class SimulatedView extends ClippedBars(NowMarker(SimulationClock(Target))) {
    static $name = 'SimulatedView';

    static configurable = {
        /**
         * Set of legend statuses to show, `null` shows all. Set by the StatusLegend
         * @prp {Set<String>}
         */
        visibleStatuses : null,

        // Phone widths get the `small` level, the columns narrow or hide, see util/Responsive.js
        responsiveLevels : {
            small : 700,
            large : '*'
        }
    };

    construct(config = {}) {
        const me = this;

        // Keys (event, task or `r:resourceId`) whose status changed live, with the time the flip expires
        me.flips          = new Map();
        // People shown by the avatars, `{ name, role }` by name, picked from the `people` section of the response
        me.people         = new Map();
        // Legend status per record, see syncLegendStatuses()
        me.legendStatuses = new Map();

        // Set up before the project is created, so inline or auto-loaded data finds them in place
        super.construct({
            ...config,
            project : {
                ...config.project,
                listeners : {
                    ...config.project?.listeners,
                    beforeLoadApply : ({ response }) => {
                        me.people = new Map((response.people || []).map(person => [person.name, person]));
                    },
                    // Deferred: dataReady fires mid-commit, the store edits below would nest a commit.
                    // See bryntum/bryntum#14129
                    dataReady : () => queueMicrotask(() => {
                        if (!me.isDestroyed) {
                            me.onOpsDataReady();
                        }
                    })
                }
            }
        });

        // Text widths are measured in the app's font, again once its faces have loaded
        me.measureFonts();
    }

    // Keeps the clock, the live locked columns and the legend in sync with the data
    onOpsDataReady() {
        this.ensureSimRanges();
        this.refreshLiveCells();
        this.syncLegendStatuses();
    }

    // Re-render the bars and the live cells with the text widths of the app's font, once its faces have loaded
    measureFonts() {
        loadFonts().then(() => {
            if (!this.isDestroyed) {
                this.resetNowPillWidth();
                this.refreshRows();
            }
        });
    }

    updateSimNow(now, old) {
        const me = this;

        super.updateSimNow(now, old);

        // No `old` while constructing
        if (old) {
            // Painted before the legend sync, so a re-filter (which renders all rows) shows the status flips
            me.paintSimTick(now, old);
            me.syncLegendStatuses();
            me.scheduleLayoutPass();

            /**
             * Fired after each change of the simulated time
             * @event simTick
             */
            me.trigger('simTick');
        }
    }

    // Called on every simulation tick, the views repaint only the affected bars. Not named onSimTick, which the
    // simTick event would call too
    paintSimTick() {}

    //region Rendering

    /**
     * The person with the passed full name, `{ name, role }`
     * @param {String} name
     * @returns {{ name : String, role : String }}
     */
    getPerson(name) {
        return this.people.get(name) || { name, role : '' };
    }

    getStatusLabel(status) {
        return this.scenario.legend[status];
    }

    /**
     * Flags an event / task / resource whose status changed live during playback. Its renderers add the `ev-flip`
     * class for a moment, which enables the CSS colour transitions on that element only
     * @param {String|Number} key
     */
    markFlip(key) {
        this.flips.set(key, performance.now() + flipMs);
    }

    isFlipping(key) {
        return this.simulating && this.flips.get(key) > performance.now();
    }

    /**
     * Applies the classes shared by the event and task bars to their `renderData.cls`
     * @param {Object} cls The renderer's `renderData.cls`
     * @param {Core.data.Model} timeSpan The event or task
     * @param {String} status The derived status
     * @param {String} type The bar type, `ev-type-${type}`
     */
    applyBarCls(cls, timeSpan, status, type) {
        Object.assign(cls, {
            'ev-bar'                : 1,
            [`ev-status-${status}`] : 1,
            [`ev-type-${type}`]     : 1,
            'ev-live'               : isLiveStatus(status),
            'ev-flip'               : this.isFlipping(timeSpan.id)
        });
    }

    /**
     * Re-renders the live locked cells (the scenario's `liveColumns`) of the passed records, or of all rendered rows,
     * plus the group headers in the scenario's `groupColumn`. The timeline and the other cells are not touched
     * @param {Core.data.Model[]} [records]
     */
    refreshLiveCells(records = null) {
        const me = this;

        if (me.isDestroyed) {
            return;
        }

        const
            { columns, store, scenario } = me,
            liveColumns                  = (scenario.liveColumns || []).map(id => columns.getById(id))
                .filter(column => column && !column.hidden),
            groupColumn                  = store.isGrouped && columns.getById(scenario.groupColumn);

        if (records) {
            records.forEach(record => {
                if (!record.isGroupHeader && !record.isGroupFooter) {
                    liveColumns.forEach(column => column.refreshCell(record));
                }
            });
        }
        // Only the rendered rows, so the cost follows the viewport and not the store size
        else if (liveColumns.length) {
            me.refreshColumn(liveColumns, false);
        }

        if (groupColumn && !groupColumn.hidden) {
            store.groupHeaderRecords.forEach(header => groupColumn.refreshCell(header));
        }
    }

    //endregion

    //region Legend statuses

    updateVisibleStatuses() {
        if (!this.isConstructing) {
            this.applyStatusFilter();
        }
    }

    /**
     * Number of events (tasks) per legend status, including the ones hidden by the legend filter
     * @returns {Object<String,Number>}
     */
    getStatusCounts() {
        const counts = {};

        this.legendStatuses.forEach((status, record) => {
            if (this.countsInLegend(record)) {
                counts[status] = (counts[status] || 0) + 1;
            }
        });

        return counts;
    }

    /**
     * The only writer of the legend status cache, all records including filtered out ones. Re-applies the legend
     * filter only when a status changed or records were added or removed, then fires `legendStatusesSync`
     */
    syncLegendStatuses() {
        const
            me                 = this,
            { legendStatuses } = me,
            seen               = new Set();

        let changed = false;

        me.statusFilterStore.forEach(record => {
            const status = me.getStatus(record);

            seen.add(record);

            if (legendStatuses.get(record) !== status) {
                legendStatuses.set(record, status);
                changed = true;
            }
        }, null, { includeFilteredOutRecords : true });

        // Removed records
        if (seen.size !== legendStatuses.size) {
            legendStatuses.forEach((status, record) => !seen.has(record) && legendStatuses.delete(record));
            changed = true;
        }

        if (changed && me.visibleStatuses) {
            me.applyStatusFilter();
        }

        /**
         * Fired once the legend statuses are synced with the simulated time or the data, the legend counts on it
         * @event legendStatusesSync
         */
        me.trigger('legendStatusesSync');
    }

    // Records counted by the legend, the Gantt skips parents and milestones
    countsInLegend() {
        return true;
    }

    applyStatusFilter() {
        const
            me                  = this,
            { visibleStatuses } = me,
            store               = me.statusFilterStore;

        if (visibleStatuses) {
            store.filter({
                id       : 'statusFilter',
                filterBy : record => visibleStatuses.has(me.legendStatuses.get(record) ?? me.getStatus(record))
            });
        }
        else if (store.filters.get('statusFilter')) {
            store.removeFilter('statusFilter');
        }
    }

    //endregion
};
