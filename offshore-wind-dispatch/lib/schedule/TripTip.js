import { StringHelper } from '@bryntum/core-enterprise';
import { duration, hhmm } from '../util/Time.js';
import { hoursText } from './TripRendering.js';

/**
 * The tooltip of a trip bar: when it leaves, each stop with its time on station, the waits for other trips, and when it
 * is back against the window (the `eventTooltip` feature of the DispatchScheduler)
 * @param {TripModel} trip
 * @param {DispatchState} state
 * @returns {String} HTML
 */
export function tripTipHtml(trip, state) {
    const
        close = state.closeOf(trip.resource),
        stops = trip.legs.filter(leg => leg.type === 'stop' && !leg.preview).map(leg =>
            StringHelper.xss`<dt>${leg.turbine}</dt><dd>${hhmm(leg.from)} – ${hhmm(leg.to)} · ${hoursText(leg.minutes)}</dd>`),
        // The engine's waits on station for another trip
        waits = trip.waits.map(({ turbine, minutes, after }) =>
            StringHelper.xss`<dt>Waits</dt><dd>${duration(minutes)} at ${turbine}${after ? ` for ${after}` : ''}</dd>`),
        back  = trip.endMinute;

    return `<div class="ow-tip">
            <header><b>${StringHelper.encodeHtml(trip.id)}</b> ${StringHelper.encodeHtml(trip.resource?.name ?? '')}</header>
            <dl>
                ${trip.startMinute <= state.now ?
        `<dt>Under way</dt><dd>since ${hhmm(trip.startMinute)}</dd>` :
        `<dt>Leaves</dt><dd>${hhmm(trip.startMinute)}</dd>`}
                ${stops.join('')}
                ${waits.join('')}
                <dt>Back in port by</dt><dd>${hhmm(back)}, ${back > close ? `${duration(back - close)} after` : `${duration(close - back)} before`} the window closes at ${hhmm(close)}</dd>
            </dl>
        </div>`;
}
