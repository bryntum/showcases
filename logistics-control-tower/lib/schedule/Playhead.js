import { formatTime } from '../util/Time.js';

// The playhead is kept this far into the visible timeline
const nowAnchor = 0.25;

/**
 * Mixin of the dock schedule drawing the simulated now: two time ranges, the shaded past and the now line with its time
 * in the header. The simulation sets `now` once a tick, the playhead glides there frame by frame, and the timeline
 * follows it by delta scrolling: it scrolls by the distance the clock moved, so wherever the user scrolled it to, it
 * stays there relative to now.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Core/mixin/Delayable#function-requestAnimationFrame
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/TimelineBase#property-visibleDate
 */
export default Target => class Playhead extends Target {
    static $name = 'Playhead';

    static configurable = {
        /**
         * The simulated current time, drawn as the playhead
         * @prp {Date}
         */
        now : null,

        /**
         * The playhead glides from one simulated time to the next over this many milliseconds, the simulation's tick
         * interval, so it moves at a steady pace instead of hopping a tick at a time
         * @config {Number}
         */
        glideDuration : 300
    };

    changeNow(now) {
        return new Date(now);
    }

    updateNow(now, oldNow) {
        const me = this;

        if (!oldNow || !me.isPainted || !me.shownNow) {
            me.showNow(now);

            return;
        }

        me.glide = { from : me.shownNow.getTime(), to : now.getTime(), start : performance.now() };

        // The widget's own animation frames (Delayable), cancelled when it is destroyed
        me.glideFrame ??= me.requestAnimationFrame(me.glideStep);
    }

    glideStep() {
        const
            me                  = this,
            { from, to, start } = me.glide,
            progress            = Math.min(1, (performance.now() - start) / me.glideDuration);

        me.glideFrame = null;
        me.showNow(new Date(from + (to - from) * progress));

        if (progress < 1) {
            me.glideFrame = me.requestAnimationFrame(me.glideStep);
        }
    }

    /**
     * Draws the playhead at a time and delta scrolls the timeline by the distance it moved, without animation, so the
     * playhead stays put on screen
     * @param {Date} time
     */
    showNow(time) {
        const
            me       = this,
            previous = me.shownNow;

        me.shownNow = time;

        // Scrolled before the time ranges change: reading the scroll position after a DOM write would force a layout
        // in every frame of the glide
        if (previous && me.isPainted) {
            const
                distance = (me.scrollRemainder ?? 0) + me.timeAxisViewModel.getDistanceForDuration(time - previous),
                whole    = Math.trunc(distance);

            me.scrollRemainder = distance - whole;

            if (whole) {
                me.timeAxisSubGrid.scrollable.x += whole;
            }
        }

        me.syncPlayhead(time);
    }

    /**
     * The shaded past and the now line, two time ranges, rendered once per frame (a store batch). Display state:
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
