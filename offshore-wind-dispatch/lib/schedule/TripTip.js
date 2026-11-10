import { DateHelper } from '@bryntum/core-enterprise';
import { portMinutes } from '../plan/Farm.js';
import { iconConfig } from '../util/Icons.js';
import { clock, duration, hhmm } from '../util/Time.js';

/**
 * The content of a trip's tooltip (the `eventTooltip` feature's template), styled like the map's turbine tooltip in
 * resources/schedule/tooltip.css: the trip and how it stands against its window, a mini timeline, a list of facts
 * @param {TripModel} trip
 * @param {DispatchState} state
 * @returns {Object[]} DomConfig
 */
export function tripTipContent(trip, state) {
    const
        close   = state.closeOf(trip.resource),
        closeAt = trip.dateOf(close),
        start   = trip.outerStartDate,
        back    = trip.outerEndDate,
        span    = Math.max(1, back - start),
        late    = DateHelper.diff(closeAt, back, 'minute'),
        stops   = trip.stopRecords,
        share   = date => `${((date - start) / span * 100).toFixed(2)}%`,
        // As TripRendering#renderLeg marks a stop at risk
        risky   = leg => trip.status === 'at-risk' &&
            DateHelper.add(leg.endDate, portMinutes(leg.turbine, trip.mode), 'minute') > closeAt,
        fact    = (term, value) => [{ tag : 'dt', text : term }, { tag : 'dd', text : value }],
        facts   = [
            ...fact(trip.departs <= state.now ? 'Under way since' : 'Leaves', clock(start)),
            // The stop's turbine and job, which its block in the schedule has no room for
            ...stops.flatMap(leg => fact(
                [leg.turbine, state.jobAt(leg.turbine)?.type, 'on station'].filter(Boolean).join(' '),
                `${clock(leg.startDate)}–${clock(leg.endDate)} (${duration(leg.duration)})`)),
            ...trip.waits.flatMap(({ turbine, minutes, after }) =>
                fact('Waits', `${duration(minutes)} at ${turbine}${after ? ` for ${after}` : ''}`)),
            ...fact('Back in port', clock(back)),
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
                        class : `ow-pill ow-tip-status${late > 0 ? ' ow-pill-risk' : ''}`,
                        text  : late > 0 ? `+${duration(late)} late` : `${duration(-late)} to spare`
                    }
                ]
            },
            // Departure to return, the stops in proportion, and the window's close if it falls inside
            {
                class    : 'ow-tip-track',
                children : [
                    ...stops.map(leg => ({
                        class : `ow-tip-block ow-mark-${risky(leg) ? 'risk' : 'work'}`,
                        style : `inset-inline-start:${share(leg.startDate)};inline-size:${((leg.endDate - leg.startDate) /
                            span * 100).toFixed(2)}%`
                    })),
                    closeAt > start && closeAt < back ? {
                        class : 'ow-tip-close',
                        style : `inset-inline-start:${share(closeAt)}`
                    } : null
                ]
            },
            { tag : 'dl', children : facts }
        ]
    }];
}
