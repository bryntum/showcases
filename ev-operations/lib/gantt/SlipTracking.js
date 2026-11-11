import { DateHelper } from '@bryntum/core-enterprise';
import { dayMs, weekMs } from '../util/Time.js';

/**
 * Schedule slip of the program phases against their baseline: the variance, the six week slip history shown by the
 * Slip column and its shared chart scale. Follows a drag or resize live, from the proposed end date.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Gantt/model/TaskModel#field-baselines
 * https://bryntum.com/docs/api/Gantt/model/TaskModel#field-totalSlack
 */

// Leaf phases and milestones below a parent, what its slip rolls up from
const leavesOf = task => task.allChildren.filter(child => child.isLeaf);

export const
    // Week of a date, counted from the snapshot point of the data (the scenario's initialNow), see getSlipWeeks()
    weekIndex = (date, initialNow) => Math.max(0, Math.floor((date - initialNow) / weekMs)),

    // A leaf phase, not a group or the milestone
    isPhase   = task => task.isLeaf && !task.milestone;

export default Target => class SlipTracking extends Target {
    static $name = 'SlipTracking';

    construct(config) {
        const me = this;

        // Slip window per phase, `{ key, weeks }`, rebuilt only when its key changes, see getSlipWeeks()
        me.slipWeeksCache = new WeakMap();

        super.construct(config);

        me.on({
            // The variance column follows a drag or resize live, from the proposed dates
            taskDrag          : ({ taskRecords, endDate }) => me.previewEnd(taskRecords[0], endDate),
            taskPartialResize : ({ taskRecord, endDate }) => me.previewEnd(taskRecord, endDate),
            taskDragReset     : () => me.previewEnd(null),
            afterTaskDrop     : () => me.previewEnd(null),
            taskResizeEnd     : () => me.previewEnd(null),
            thisObj           : me
        });
    }

    onOpsDataReady() {
        this.slipScale = null;
        super.onOpsDataReady();
    }

    /**
     * Signed difference between the (dragged) end date and the baseline end, whole days only, `null` without a
     * baseline. Parents compare to the latest baseline end of their phases
     * @param {Gantt.model.TaskModel} taskRecord
     * @returns {Number|null}
     */
    getVariance(taskRecord) {
        const
            { baselineEndDate } = taskRecord,
            endDate             = this.getPreviewEndDate(taskRecord);

        if (!baselineEndDate || !endDate) {
            return null;
        }

        const variance = endDate - baselineEndDate;

        // Ignore sub-day differences (DST shifts between baseline and scheduled dates)
        return Math.abs(variance) >= dayMs ? variance : 0;
    }

    // The proposed end while dragging or resizing, so the live cells follow the drag
    getPreviewEndDate(taskRecord) {
        const { dragPreview } = this;

        return dragPreview?.taskRecord === taskRecord ? dragPreview.endDate : taskRecord.endDate;
    }

    getSlip(taskRecord) {
        return Math.max(0, this.getVariance(taskRecord) ?? 0);
    }

    previewEnd(taskRecord, endDate) {
        this.dragPreview = taskRecord ? { taskRecord, endDate } : null;
        this.slipScale   = null;

        // The dragged phase and its group follow, and the chart scale shared by all rows may change
        this.refreshColumn(this.columns.getById('slip'), false);
    }

    // Same test as the `finished` of getSlipInfo()
    isPhaseFinished(taskRecord, now = this.simNow) {
        return this.getPreviewEndDate(taskRecord) <= now;
    }

    /**
     * Index of the week the simulated now is in, counted from the scenario's `initialNow`, the data's snapshot point
     * @property {Number}
     */
    get slipWeek() {
        return weekIndex(this.simNow, this.initialNow);
    }

    /**
     * Slip in days at the last six weeks up to the simulated now, oldest first: `slipHistory` before `initialNow`,
     * the live slip from then on. A finished phase keeps the six weeks up to the week it finished in. Cached per phase,
     * the same array while the week and the end dates are unchanged
     * @param {Gantt.model.TaskModel} taskRecord A leaf phase with a baseline
     * @param {Number} slip Its slip in days now
     * @returns {Number[]}
     */
    getSlipWeeks(taskRecord, slip) {
        const
            me                  = this,
            { baselineEndDate } = taskRecord,
            endDate             = me.getPreviewEndDate(taskRecord),
            // Frozen at its end once finished
            slipWeek            = Math.min(me.slipWeek, weekIndex(endDate, me.initialNow)),
            key                 = `${slipWeek}|${endDate.getTime()}|${baselineEndDate.getTime()}`,
            cached              = me.slipWeeksCache.get(taskRecord);

        if (cached?.key === key) {
            return cached.weeks;
        }

        const
            { slipHistory } = taskRecord,
            weeks           = [];

        for (let week = slipWeek - 5; week <= slipWeek; week++) {
            // Weeks are counted from the snapshot point, the last snapshot (index 5) is week 0
            weeks.push(week < 0 ? slipHistory[week + 5] ?? 0 : slip);
        }

        me.slipWeeksCache.set(taskRecord, { key, weeks });

        return weeks;
    }

    /**
     * Slip of a phase now and over six weeks (see #function-getSlipWeeks) against its float. A group shows the worst
     * slip of its leaves, finished when all of them are
     * @param {Gantt.model.TaskModel} taskRecord
     * @returns {Object|null} `{ slip, weeks, slack, pastFloat, finished, recovered, worst }`, days and booleans
     */
    getSlipInfo(taskRecord) {
        const me = this;

        if (taskRecord.isParent) {
            const
                infos = leavesOf(taskRecord).map(leaf => me.getSlipInfo(leaf)).filter(Boolean),
                slip  = Math.max(...infos.map(info => info.slip));

            return infos.length ? {
                slip,
                // Red when the worst one is past float now
                pastFloat : infos.some(info => info.slip === slip && info.pastFloat && !info.finished),
                finished  : infos.every(info => info.finished)
            } : null;
        }

        const variance = me.getVariance(taskRecord);

        if (variance === null) {
            return null;
        }

        const
            slip  = Math.round(variance / dayMs),
            weeks = me.getSlipWeeks(taskRecord, slip),
            slack = Math.round(DateHelper.as('day', taskRecord.totalSlack ?? 0, taskRecord.slackUnit || 'day'));

        return {
            slip,
            weeks,
            slack,
            pastFloat : slip > slack,
            finished  : me.isPhaseFinished(taskRecord),
            recovered : slip <= 0 && weeks.some(week => week > 0),
            worst     : Math.max(...weeks)
        };
    }

    /**
     * Height scale of the slip charts in days, shared by the live rows (a finished phase uses its own, see
     * ProgramColumns): the largest slip of the unfinished phases in whole weeks, at least one. Computed once per
     * render pass, reset on data and drag preview changes, when the week changes and when a phase finishes
     * @returns {Number}
     */
    getSlipScale() {
        const me = this;

        if (me.slipScale == null) {
            let max = 7;

            me.taskStore.allRecords.forEach(task => {
                const variance = isPhase(task) && !me.isPhaseFinished(task) ? me.getVariance(task) : null;

                if (variance !== null) {
                    max = Math.max(max, ...task.slipHistory.slice(0, 5), Math.round(variance / dayMs));
                }
            });

            me.slipScale = Math.ceil(max / 7) * 7;
        }

        return me.slipScale;
    }

    /**
     * Refreshes the slip cells after a tick: all of them when the shared scale changed, else the ones whose six week
     * window moved with a new week. Phases in `changed` were refreshed with the tick already
     * @param {Number|null} oldScale The scale before the tick
     * @param {Boolean} weekChanged
     * @param {Set<Gantt.model.TaskModel>} changed
     */
    refreshSlipCells(oldScale, weekChanged, changed) {
        const
            me         = this,
            slipColumn = me.columns.getById('slip');

        if (oldScale != null && me.getSlipScale() !== oldScale) {
            me.refreshColumn(slipColumn, false);
        }
        else if (weekChanged) {
            me.taskStore.forEach(taskRecord => {
                const before = isPhase(taskRecord) && !changed.has(taskRecord) &&
                    me.slipWeeksCache.get(taskRecord)?.weeks;

                if (before && me.getSlipInfo(taskRecord)?.weeks !== before) {
                    slipColumn.refreshCell(taskRecord);
                }
            });
        }
    }
};
