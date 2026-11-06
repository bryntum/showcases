import { DateHelper } from '@bryntum/core-enterprise';

export const
    minuteMs = 60 * 1000,
    hourMs   = 60 * minuteMs;

/**
 * `HH:mm`, the time format used throughout the app
 * @param {Date|Number} date
 * @returns {String}
 */
export const formatTime = date => date == null ? '' : DateHelper.format(new Date(date), 'HH:mm');

/**
 * A duration in minutes as `2d 05h`, `1h 05m` or `25m`, signed when `signed` is set
 * @param {Number} minutes
 * @param {Boolean} [signed]
 * @returns {String}
 */
export function formatMinutes(minutes, signed = false) {
    const
        sign     = minutes < 0 ? '−' : signed ? '+' : '',
        absolute = Math.abs(Math.round(minutes)),
        days     = Math.floor(absolute / 1440),
        hours    = Math.floor(absolute / 60) % 24,
        rest     = absolute % 60,
        pad      = value => String(value).padStart(2, '0');

    if (days) {
        return `${sign}${days}d ${pad(hours)}h`;
    }

    return `${sign}${hours ? `${hours}h ${pad(rest)}m` : `${rest}m`}`;
}
