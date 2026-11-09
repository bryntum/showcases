/**
 * Times of the dispatch day. The planner works in minutes since midnight of the day shown, the Scheduler in dates:
 * these helpers convert between the two and format both. The page opens on the real current date, today, the first of
 * the seven days of the week (lib/plan/WeekPlan.js); the Day view shows one of them at a time (`showDay`). The times of
 * day come from the data, so the story reads the same on every day.
 */

const
    minuteMs = 60_000,
    now      = new Date(),
    format   = (date, options) => date.toLocaleDateString('en-GB', options).replace(',', '');

/**
 * Midnight of a day of the week, 0 is today
 * @param {Number} index
 * @returns {Date}
 */
export function dayDate(index) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
}

// The day shown, its midnight is minute 0
let
    shown    = 0,
    midnight = dayDate(0);

export let
    /**
     * The day shown on the time axis, "Nov 9", beside its Today pill on today
     */
    dayAxis  = '',

    /**
     * The day shown, short, "Mon 9 Nov", for the KPI bar
     */
    dayShort = '',

    /**
     * Where work the weather pushes out goes, the day after the one shown: "Tue" and "Tuesday"
     */
    nextDay  = '',
    nextLong = '';

/**
 * Shows a day of the week: its midnight is minute 0 from now on, the labels name it
 * @param {Number} index 0 is today
 */
export function showDay(index) {
    const tomorrow = dayDate(index + 1);

    shown    = index;
    midnight = dayDate(index);
    dayAxis  = midnight.toLocaleDateString('en-US', { month : 'short', day : 'numeric' });
    dayShort = format(midnight, { weekday : 'short', day : 'numeric', month : 'short' });
    nextDay  = format(tomorrow, { weekday : 'short' });
    nextLong = format(tomorrow, { weekday : 'long' });
}

showDay(0);

/**
 * The day shown, 0 is today
 * @returns {Number}
 */
export function shownDay() {
    return shown;
}

/**
 * A date as minutes since midnight of a day of the week
 * @param {Date} date
 * @param {Number} index 0 is today
 * @returns {Number}
 */
export function minutesOn(date, index) {
    return Math.round((date.getTime() - dayDate(index).getTime()) / minuteMs);
}

/**
 * A time of the day shown as a date
 * @param {Number} minutes Minutes since midnight
 * @returns {Date}
 */
export function toDate(minutes) {
    return new Date(midnight.getTime() + minutes * minuteMs);
}

/**
 * A date of the day shown as minutes since midnight
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
