/**
 * The weather windows. A forecast holds one value per hour of the day from `dayStart`: the significant wave height
 * (Hs, metres) and the wind at hub height (m/s). Each kind of transport has its limit, a crew transfer vessel can push
 * on to a boat landing up to Hs 1.5 m, a SWATH up to 2.0 m, a helicopter hoists up to 20 m/s wind. Its window closes
 * at the start of the first hour over the limit.
 */

/**
 * The hourly value at a time, the last one past the end of the forecast
 * @param {Number[]} series Hourly values from `dayStart`
 * @param {Number} minutes Minutes since midnight
 * @param {Number} dayStart Hour of the first value
 * @returns {Number}
 */
export function valueAt(series, minutes, dayStart) {
    const index = Math.floor(minutes / 60) - dayStart;

    return series[Math.min(Math.max(index, 0), series.length - 1)];
}

/**
 * Whether a forecast value is over a limit
 * @param {Object} limit A limit of the data, `{ hs }` or `{ wind }`
 * @param {Number} hs
 * @param {Number} wind
 * @returns {Boolean}
 */
export function isOver(limit, hs, wind) {
    return limit.hs ? hs > limit.hs : wind > limit.wind;
}

/**
 * When each window closes, in minutes since midnight. A window that stays open closes at the end of the day
 * @param {Object} forecast `{ hs, wind }`
 * @param {Object} limits By window: `ctv`, `swath`, `heli`
 * @param {Object} day `{ dayStart, dayEnd }`, hours
 * @returns {Object} By window, minutes
 */
export function closingTimes(forecast, limits, { dayStart, dayEnd }) {
    return Object.fromEntries(Object.entries(limits).map(([key, limit]) => {
        const index = forecast.hs.findIndex((hs, i) => isOver(limit, hs, forecast.wind[i]));

        return [key, (index < 0 || dayStart + index > dayEnd ? dayEnd : dayStart + index) * 60];
    }));
}
