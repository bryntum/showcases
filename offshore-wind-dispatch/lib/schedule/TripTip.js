import { duration, hhmm } from '../util/Time.js';
import { hoursText } from './TripRendering.js';

/**
 * The tooltip of a trip bar as a DomConfig: when it leaves, each stop with its time on station, the waits for other
 * trips, and when it is back against the window (the `eventTooltip` feature of the DispatchScheduler)
 * @param {TripModel} trip
 * @param {DispatchState} state
 * @returns {Object} DomConfig
 */
export function tripTipContent(trip, state) {
    const
        close = state.closeOf(trip.resource),
        back  = trip.endMinute,
        row   = (term, value) => [{ tag : 'dt', text : term }, { tag : 'dd', text : value }],
        stops = trip.legs.filter(leg => leg.type === 'stop' && !leg.preview)
            .flatMap(leg => row(leg.turbine, `${hhmm(leg.from)} – ${hhmm(leg.to)} · ${hoursText(leg.minutes)}`)),
        // The engine's waits on station for another trip
        waits = trip.waits.flatMap(({ turbine, minutes, after }) =>
            row('Waits', `${duration(minutes)} at ${turbine}${after ? ` for ${after}` : ''}`));

    return {
        class    : 'ow-tip',
        children : [
            {
                tag      : 'header',
                children : [{ tag : 'b', text : trip.id }, ` ${trip.resource?.name ?? ''}`]
            },
            {
                tag      : 'dl',
                children : [
                    ...trip.startMinute <= state.now ?
                        row('Under way', `since ${hhmm(trip.startMinute)}`) :
                        row('Leaves', hhmm(trip.startMinute)),
                    ...stops,
                    ...waits,
                    ...row('Back in port by', `${hhmm(back)}, ${back > close ?
                        `${duration(back - close)} after` : `${duration(close - back)} before`} the window closes at ${hhmm(close)}`)
                ]
            }
        ]
    };
}
