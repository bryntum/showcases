import { portMinutes } from '../plan/Farm.js';
import { iconConfig } from '../util/Icons.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * The content of a trip's tooltip (the `eventTooltip` feature's template), styled like the map's turbine tooltip in
 * resources/schedule/tooltip.css: the trip and how it stands against its window, a mini timeline, a list of facts
 * @param {TripModel} trip
 * @param {DispatchState} state
 * @returns {Object[]} DomConfig
 */
export function tripTipContent(trip, state) {
    const
        close  = state.closeOf(trip.resource),
        start  = trip.departs,
        back   = trip.endMinute,
        late   = back - close,
        stops  = trip.legs.filter(leg => leg.type === 'stop' && !leg.preview),
        share  = minutes => `${((minutes - start) / Math.max(1, back - start) * 100).toFixed(2)}%`,
        // As TripRendering#renderLeg marks a stop at risk
        risky  = leg => trip.status === 'at-risk' && leg.to + portMinutes(leg.turbine, trip.mode) > close,
        fact   = (term, value) => [{ tag : 'dt', text : term }, { tag : 'dd', text : value }],
        facts  = [
            ...start <= state.now ? fact('Under way since', hhmm(start)) : fact('Leaves', hhmm(start)),
            ...stops.flatMap(leg => fact(`${leg.turbine} on station`,
                `${hhmm(leg.from)}–${hhmm(leg.to)} (${duration(leg.minutes)})`)),
            ...trip.waits.flatMap(({ turbine, minutes, after }) =>
                fact('Waits', `${duration(minutes)} at ${turbine}${after ? ` for ${after}` : ''}`)),
            ...fact('Back in port', hhmm(back)),
            ...fact('Window closes', hhmm(close))
        ];

    // In a list, or the config would be the tooltip's own element
    return [{
        class    : 'ow-tip',
        children : [
            {
                tag      : 'header',
                children : [
                    { tag : 'span', class : 'ow-tip-vessel', children : [iconConfig(trip.resource?.glyph ?? 'ctv')] },
                    {
                        tag      : 'span',
                        class    : 'ow-tip-title',
                        children : [{ tag : 'b', text : trip.id }, ` ${trip.resource?.name ?? ''}`]
                    },
                    {
                        tag   : 'span',
                        class : `ow-tip-status${late > 0 ? ' ow-tip-late' : ''}`,
                        text  : late > 0 ? `+${duration(late)} late` : `${duration(-late)} to spare`
                    }
                ]
            },
            // Departure to return, the stops in proportion, and the window's close if it falls inside
            {
                class    : 'ow-tip-track',
                children : [
                    ...stops.map(leg => ({
                        class : `ow-tip-block${risky(leg) ? ' ow-tip-risk' : ''}`,
                        style : `inset-inline-start:${share(leg.from)};inline-size:${((leg.to - leg.from) /
                            Math.max(1, back - start) * 100).toFixed(2)}%`
                    })),
                    close > start && close < back ? {
                        class : 'ow-tip-close',
                        style : `inset-inline-start:${share(close)}`
                    } : null
                ]
            },
            { tag : 'dl', children : facts }
        ]
    }];
}
