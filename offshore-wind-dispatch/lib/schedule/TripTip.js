import { portMinutes } from '../plan/Farm.js';
import { icon } from '../util/Icons.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * The tooltip of a trip bar as a DomConfig, in the style of the map's turbine tooltip (the `eventTooltip` feature of
 * the DispatchScheduler is its container): a header with the trip, its vessel and a pill saying how the trip stands
 * against its weather window, a mini timeline of the trip's shape, and a two column grid of facts
 * (resources/schedule/tooltip.css)
 * @param {TripModel} trip
 * @param {DispatchState} state
 * @returns {Object[]} DomConfig
 */
export function tripTipContent(trip, state) {
    const
        close  = state.closeOf(trip.resource),
        start  = trip.startMinute,
        back   = trip.endMinute,
        late   = back - close,
        // Its vessel's icon: the SWATH has its own, the crew transfer vessels share one
        mode   = trip.mode === 'heli' ? 'heli' : trip.resource?.window === 'swath' ? 'swath' : 'ctv',
        stops  = trip.legs.filter(leg => leg.type === 'stop' && !leg.preview),
        share  = minutes => `${((minutes - start) / Math.max(1, back - start) * 100).toFixed(2)}%`,
        // A stop the vessel cannot get back from before its window closes, as the schedule draws it
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
                    { tag : 'span', class : 'ow-tip-vessel', html : icon(mode) },
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
            // The trip from its departure to its return, the work in proportion, the window's close if it is inside
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
