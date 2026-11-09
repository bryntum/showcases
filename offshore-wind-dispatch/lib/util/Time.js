/**
 * Times of the dispatch day. The planner works in minutes since midnight of today, the Scheduler in dates: these
 * helpers convert between the two and format both. The page opens on the real current date, the times of day come
 * from the data, so the story reads the same on every day.
 */

const
    minuteMs = 60_000,
    today    = new Date(),
    midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
    format   = (date, options) => date.toLocaleDateString('en-GB', options).replace(',', '');

export const
    /**
     * Today written out, "Sunday 8 November 2026", for the time axis
     */
    dayLong  = format(midnight, { weekday : 'long', day : 'numeric', month : 'long', year : 'numeric' }),

    /**
     * Today short, "Sun 8 Nov", for the KPI bar
     */
    dayShort = format(midnight, { weekday : 'short', day : 'numeric', month : 'short' }),

    /**
     * Where work the weather pushes out goes: "Mon" and "Monday"
     */
    nextDay  = format(tomorrow, { weekday : 'short' }),
    nextLong = format(tomorrow, { weekday : 'long' });

/**
 * A time of today as a date
 * @param {Number} minutes Minutes since midnight
 * @returns {Date}
 */
export function toDate(minutes) {
    return new Date(midnight.getTime() + minutes * minuteMs);
}

/**
 * A date of today as minutes since midnight
 * @param {Date} date
 * @returns {Number}
 */
export function toMinutes(date) {
    return Math.round((date.getTime() - midnight.getTime()) / minuteMs);
}

/**
 * "07:40" as minutes since midnight
 * @param {String} text
 * @returns {Number}
 */
export function parseTime(text) {
    const [hours, minutes] = text.split(':').map(Number);

    return hours * 60 + minutes;
}

/**
 * Minutes since midnight as "07:40", past midnight as "01:28 tomorrow"
 * @param {Number} minutes
 * @returns {String}
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
 * @param {Number} minutes
 * @returns {String}
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
