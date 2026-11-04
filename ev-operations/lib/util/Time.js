/**
 * Time constants and the state of a time span at the simulated "now": how far it has elapsed and its status.
 */

export const
    minuteMs = 60 * 1000,
    dayMs    = 24 * 60 * minuteMs,
    weekMs   = 7 * dayMs,

    /**
     * Status keys, in legend order. `ok`, `focus` and `late` come from the record (or are derived by the view), `sched`
     * and `done` are derived from the simulated "now".
     */
    statusKeys = ['ok', 'focus', 'late', 'sched', 'done'],

    // Clamps to a 0-1 fraction
    clamp = value => Math.max(0, Math.min(1, value)),

    /**
     * Fraction (0-1) of the time span that has elapsed at `now`.
     */
    elapsedFraction = (timeSpan, now) => {
        const
            start = timeSpan.startDate.getTime(),
            end   = timeSpan.endDate.getTime();

        if (end > start) {
            return clamp((now - start) / (end - start));
        }

        // A zero length span, a milestone
        return now >= end ? 1 : 0;
    },

    /**
     * Derives a status from the simulated time. Done if it has ended, scheduled if it has not started yet, otherwise
     * the passed live status.
     */
    deriveStatus = (timeSpan, now, liveStatus = 'ok') => {
        if (timeSpan.endDate <= now) {
            return 'done';
        }
        if (timeSpan.startDate > now) {
            return 'sched';
        }
        return liveStatus;
    },

    // In progress, neither done nor scheduled
    isLiveStatus = status => status !== 'done' && status !== 'sched',

    /**
     * The first of the passed time spans covering `now`, `undefined` when none does
     */
    spanAt = (timeSpans, now) => timeSpans.find(span => span.startDate <= now && span.endDate > now);
