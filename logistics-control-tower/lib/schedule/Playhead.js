import { formatTime } from '../util/Time.js';

// The playhead is kept this far into the visible timeline
const nowAnchor = 0.25;

/**
 * Mixin of the dock schedule drawing the simulated now: two time ranges, the shaded past and the now line with its time
 * in the header. The simulation sets `now` once a tick and the timeline follows it by delta scrolling: it scrolls by
 * the distance the clock moved, so wherever the user scrolled it to, it stays there relative to now.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/TimelineBase#property-visibleDate
 */
export default Target => class Playhead extends Target {
    static $name = 'Playhead';

    static configurable = {
        /**
         * The simulated current time, drawn as the playhead
         * @prp {Date}
         */
        now : null
    };

    changeNow(now) {
        return new Date(now);
    }

    updateNow(now, oldNow) {
        const me = this;

        // The fraction of a pixel left over is carried to the next tick, so the view keeps exact pace with the clock
        if (oldNow && me.isPainted) {
            const
                distance = (me.scrollRemainder ?? 0) + me.timeAxisViewModel.getDistanceForDuration(now - oldNow),
                whole    = Math.trunc(distance);

            me.scrollRemainder = distance - whole;

            if (whole) {
                me.timeAxisSubGrid.scrollable.x += whole;
            }
        }

        me.syncPlayhead(now);
    }

    /**
     * The shaded past and the now line, two time ranges, rendered at once (a store batch). Display state:
     * `clearChanges()` keeps the records out of the store's added and modified records, suspending the change tracking
     * keeps the CrudManager's `hasChanges` from flagging them
     * @param {Date} now The time shown
     */
    syncPlayhead(now) {
        const
            me                 = this,
            { project }        = me,
            // Not there yet when the `now` config is first applied, during construction
            { timeRangeStore } = project;

        if (!timeRangeStore) {
            return;
        }

        project.suspendChangeTracking();
        timeRangeStore.beginBatch();

        if (!me.nowRange || !timeRangeStore.includes(me.nowRange)) {
            [me.pastRange, me.nowRange] = timeRangeStore.add([
                { id : 'past', startDate : me.startDate, endDate : now, cls : 'lct-past', readOnly : true },
                { id : 'now', startDate : now, name : formatTime(now), cls : 'lct-now', readOnly : true }
            ]);
        }
        else {
            me.pastRange.endDate = now;
            me.nowRange.set({ startDate : now, name : formatTime(now) });
        }

        me.pastRange.clearChanges();
        me.nowRange.clearChanges();
        timeRangeStore.endBatch();
        project.resumeChangeTracking(true);
    }

    // The playhead a quarter into the visible timeline
    scrollToNow() {
        const me = this;

        if (me.now) {
            me.visibleDate = {
                date       : me.now,
                block      : 'start',
                edgeOffset : Math.round(me.timeAxisSubGrid.width * nowAnchor)
            };
        }
    }
};
