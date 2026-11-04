import { svgNs } from '../Glyphs.js';
import { elapsedFraction } from '../util/Time.js';

/**
 * The charging model of the DC fast chargers: power tapering with the state of charge, the session state at the
 * simulated now and the power curve drawn in a charging session's bar.
 */

const
    chargerMaxKw = 250,
    // "x y" pairs of an SVG path
    pathPoints   = points => points.map(([x, y]) => `${x.toFixed(1)} ${y}`).join(' L');

export const
    batteryKwh   = 75,
    // Width (px) of the battery glyph in the charging chip, .ev-battery in bars.css
    batteryWidth = 18,
    maxKw        = `${chargerMaxKw} kW`,

    /**
     * Charging power as a fraction of max power for a given state of charge: full power up to 35%, then tapering
     * @param {Number} soc State of charge, 0-100
     * @returns {Number}
     */
    chargePower = soc => {
        if (soc < 35) {
            return 1;
        }

        return soc < 80 ? 1 - (soc - 35) / 45 * 0.65 : 0.35 - (soc - 80) / 20 * 0.2;
    },

    /**
     * Charging session state at `now`
     * @param {Scheduler.model.EventModel} eventRecord A charging session
     * @param {Date} now
     * @returns {{ fraction : Number, soc : Number, kw : Number }}
     */
    chargeState = (eventRecord, now) => {
        const
            socStart = eventRecord.socStart ?? 0,
            socEnd   = eventRecord.socEnd ?? 0,
            fraction = elapsedFraction(eventRecord, now),
            soc      = Math.round(socStart + (socEnd - socStart) * fraction);

        return {
            fraction,
            soc,
            kw : Math.round(chargerMaxKw * chargePower(soc))
        };
    },

    /**
     * SVG charging power curve over the session, filled up to now
     * @param {Scheduler.model.EventModel} eventRecord A charging session
     * @param {Number} width Bar width (px)
     * @param {Number} fraction Elapsed fraction, 0-1
     * @returns {DomConfig}
     */
    chargeCurve = (eventRecord, width, fraction) => {
        const
            socStart = eventRecord.socStart ?? 0,
            socEnd   = eventRecord.socEnd ?? 0,
            // The SVG layer covers the lower band of the bar (see .ev-curve), max power at its top edge
            height   = 40,
            top      = 1,
            steps    = 28,
            yFor     = soc => (height - (height - top) * chargePower(soc)).toFixed(1),
            points   = [];

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;

            points.push([t * width, yFor(socStart + (socEnd - socStart) * t)]);
        }

        const
            cutX = width * fraction,
            cut  = points.filter(([x]) => x <= cutX);

        if (fraction > 0 && fraction < 1) {
            cut.push([cutX, yFor(socStart + (socEnd - socStart) * fraction)]);
        }

        return {
            tag                 : 'svg',
            ns                  : svgNs,
            class               : 'ev-curve',
            viewBox             : `0 0 ${Math.max(1, width)} ${height}`,
            preserveAspectRatio : 'none',
            'aria-hidden'       : 'true',
            children            : [
                cut.length > 1 && {
                    tag   : 'path',
                    ns    : svgNs,
                    class : 'ev-curve-area',
                    d     : `M0 ${height} L${pathPoints(cut)} L${cut.at(-1)[0].toFixed(1)} ${height} Z`
                },
                { tag : 'path', ns : svgNs, class : 'ev-curve-line', d : `M${pathPoints(points)}` }
            ]
        };
    };
