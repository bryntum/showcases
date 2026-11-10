/**
 * Formatting and parsing of the planner's times of day: minutes since midnight of the day a trip is on. The records
 * hold Dates; DispatchState#midnight is the zero these minutes count from.
 */

/**
 * "07:40" as minutes since midnight
 */
export function parseTime(text) {
    const [hours, minutes] = text.split(':').map(Number);

    return hours * 60 + minutes;
}

/**
 * Minutes since midnight as "07:40", past midnight as "01:28 tomorrow"
 */
export function hhmm(minutes) {
    const
        rounded = Math.round(minutes),
        day     = 24 * 60,
        time    = rounded % day;

    return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}` +
        (rounded >= day ? ' tomorrow' : '');
}

/**
 * A duration as "6 h 20 min", "2 h" or "48 min"
 */
export function duration(minutes) {
    const
        rounded = Math.max(0, Math.round(minutes)),
        hours   = Math.floor(rounded / 60),
        rest    = rounded % 60;

    if (!hours) {
        return `${rest} min`;
    }

    return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
