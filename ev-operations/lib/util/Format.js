import { DateHelper, LocaleManager } from '@bryntum/core-enterprise';

/**
 * Number, time and date formatting in the current locale, shared by the bars, the locked columns and the detail panel.
 */

const numberFormats = new Map();

export const
    /**
     * A number in the current locale, with a fixed number of decimals
     * @param {Number} value
     * @param {Number} [digits]
     * @returns {String}
     */
    formatNumber = (value, digits = 0) => {
        const key = `${LocaleManager.locale.localeCode}|${digits}`;

        if (!numberFormats.has(key)) {
            numberFormats.set(key, new Intl.NumberFormat(LocaleManager.locale.localeCode || undefined, {
                minimumFractionDigits : digits,
                maximumFractionDigits : digits
            }));
        }

        return numberFormats.get(key).format(value ?? 0);
    },

    // 42%, from a 0-1 fraction
    formatPercent = fraction => `${formatNumber(Math.round(fraction * 100))}%`,

    // Times and dates are formatted by DateHelper, in the current locale
    formatTime  = date => DateHelper.format(date, 'HH:mm'),

    // +15m
    formatDelay = minutes => `+${minutes}m`,

    // Oct 21
    formatDay   = date => DateHelper.format(date, 'MMM D');
