import { StringHelper } from '@bryntum/core-enterprise';
import { mergeFeature } from '../util/Features.js';
import { fonts, textWidth } from '../util/TextMeasure.js';

/**
 * Shows the simulated "now" on the timeline: the past shading and the now line as time ranges, and the now pill in the
 * header. Both are display state of the clock, never saved or synced.
 */

// Half width (px) of the now pill before it is rendered and measured, see nowMarkerHalfWidth
const fallbackPillHalfWidth = 26;

export default Target => class NowMarker extends Target {
    static $name = 'NowMarker';

    construct(config = {}) {
        const me = this;

        super.construct({
            ...config,
            // The now pill renders in the header
            features : mergeFeature(config.features, 'timeRanges', {
                showHeaderElements : true,
                headerRenderer     : args => me.renderNowHeader(args)
            })
        });

        me.ensureSimRanges();
    }

    /**
     * Adds the clock to the project's time range store: the past shading from the view start up to now (`ev-past`)
     * and the now line (`ev-now`). Called again once data is loaded, a `timeRanges` section replaces the store's
     * records. A remaining one is removed first, so the ids stay unique
     */
    ensureSimRanges() {
        const
            me                 = this,
            { timeRangeStore } = me.project,
            survivors          = [me.pastRange, me.nowRange].filter(range => range && timeRangeStore.includes(range));

        if (survivors.length < 2) {
            me.editSimRanges(() => {
                timeRangeStore.remove(survivors);

                [me.pastRange, me.nowRange] = timeRangeStore.add([
                    { id : 'ev-past', startDate : me.startDate, endDate : me.simNow, cls : 'ev-past', readOnly : true },
                    { id : 'ev-now', startDate : me.simNow, cls : 'ev-now', readOnly : true }
                ]);
            });
        }
    }

    // The simulated clock is display state: no `hasChanges` events, no autoSync and not in `project.changes`. The
    // store batch renders the time ranges once
    editSimRanges(fn) {
        const
            { project }        = this,
            { timeRangeStore } = project;

        project.suspendChangeTracking();
        timeRangeStore.beginBatch();

        try {
            fn();
            this.pastRange.clearChanges();
            this.nowRange.clearChanges();
        }
        finally {
            timeRangeStore.endBatch();
            project.resumeChangeTracking(true);
        }
    }

    updateSimNow(now, old) {
        const me = this;

        super.updateSimNow?.(now, old);

        if (me.nowRange) {
            me.editSimRanges(() => {
                me.pastRange.endDate  = now;
                me.nowRange.startDate = now;
            });
        }
    }

    // The now pill in the header. Its halo in the header colour hides the time axis label below it, see timeline.css
    renderNowHeader({ timeRange }) {
        return timeRange === this.nowRange ? StringHelper.xss`<span class="ev-now-pill">${this.formatNow(this.simNow)}</span>` : '';
    }

    // Half the width of the now pill, which is centered on the now line. Fixed width, measured once when shown
    get nowMarkerHalfWidth() {
        const me = this;

        if (!me.measuredPillHalfWidth) {
            const width = me.element.querySelector('.ev-now-pill')?.offsetWidth;

            // Not rendered yet, a typical half width until it is
            if (!width) {
                return fallbackPillHalfWidth;
            }

            me.measuredPillHalfWidth = width / 2 + 1;
        }

        return me.measuredPillHalfWidth;
    }

    /**
     * The now pill gets the width of its widest label within the view (`--ev-now-pill-text`), so it does not change
     * width as time moves. Called once the font has loaded
     */
    resetNowPillWidth() {
        const
            me                     = this,
            { startDate, endDate } = me;

        let widest = 0;

        for (let time = startDate.getTime(); time <= endDate; time += me.scenario.step) {
            widest = Math.max(widest, textWidth(me.formatNow(new Date(time)), fonts.pill));
        }

        me.element.style.setProperty('--ev-now-pill-text', `${widest}px`);
        me.measuredPillHalfWidth = null;
    }
};
