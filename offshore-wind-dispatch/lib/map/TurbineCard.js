import { StringHelper, Widget } from '@bryntum/core-enterprise';
import { rowName, substation } from '../plan/Farm.js';
import { icon } from '../util/Icons.js';
import { duration, hhmm, nextDay } from '../util/Time.js';
import { turbineSvg } from './Turbine.js';

/**
 * The selected turbine under the map: the illustration with the sea at the forecast wave height against the vessel's
 * limit, then the job, the team, the trip, when, and one line on how it stands against the weather window.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */

const firstSailing = 6 * 60 + 30;

/**
 * What the card says about a turbine
 * @param {Object} options
 * @param {DispatchState} options.state
 * @param {TripModel[]} options.trips
 * @param {String} options.turbine
 * @param {Object} [options.drop] A team held over a trip, see DispatchApp#previewDrop
 * @returns {Object} `{ name, sub, job, team, trip, when, hs, limit, note, tone }`
 */
export function cardInfo({ state, trips, turbine, drop }) {
    const
        held    = drop?.job.turbine === turbine,
        trip    = held ? drop.trip : trips.find(each => each.turbines.includes(turbine)),
        trimmed = trips.find(each => each.status === 'trimmed' && each.removed?.includes(turbine)),
        // Where it stands: held over a trip, moved to tomorrow, on a trip, or neither
        stand   = standOf(held, trip, trimmed),
        stop    = trip?.legs.find(leg => leg.turbine === turbine),
        planned = trip ?? trimmed,
        vessel  = planned?.resource;

    return {
        ...describe(state, turbine),
        trip  : vessel ? `${planned.id} · ${vessel.name}` : 'Not assigned',
        when  : whenOf(stand, stop),
        hs    : state.hsAt(stop?.from ?? state.now),
        limit : state.limits[vessel?.window === 'swath' ? 'swath' : 'ctv'].hs,
        ...noteOf({ state, turbine, trip : planned, drop, stand })
    };
}

// Held over a trip, moved to tomorrow, the status of its trip, or none
function standOf(held, trip, trimmed) {
    if (held) {
        return 'held';
    }

    if (trip?.status === 'moved' || trimmed) {
        return 'moved';
    }

    return trip?.status ?? 'none';
}

function whenOf(stand, stop) {
    if (stand === 'moved') {
        return `Moved to ${nextDay} ${hhmm(firstSailing)}`;
    }

    return stop ? `On station ${hhmm(stop.from)} – ${hhmm(stop.to)}` : '–';
}

// The turbine, its job and the team for it
function describe(state, turbine) {
    const
        job  = state.jobAt(turbine),
        team = job && state.teams.get(job.team);

    if (turbine === substation) {
        return { name : 'Substation', sub : 'Offshore HV substation', job : job?.job, team : team?.name ?? '–' };
    }

    return {
        name : turbine,
        sub  : `${rowName(turbine)} · ${state.site.turbineMw.toFixed(1)} MW${state.faults.has(turbine) ? ' · stopped' : ''}`,
        job  : job?.job ?? 'No work due today',
        team : team ? `${team.name} · ${team.certs.join(', ')}` : '–'
    };
}

// The line on the weather window, and its tone
function noteOf({ state, turbine, trip, drop, stand }) {
    const
        close = trip && state.closeOf(trip.resource),
        notes = {
            held : () => drop.result.valid ?
                {
                    note : `Back at port ${hhmm(drop.result.back)}, ${duration(drop.result.margin)} before ` +
                        state.limits[trip.resource.window].noGo,
                    tone : 'reach'
                } :
                { note : drop.result.reason, tone : 'cancel' },
            moved : () => ({
                note : `Its return leg would meet Hs ${state.hsAt(trip.endMinute).toFixed(1)} m`,
                tone : 'cancel'
            }),
            'at-risk' : () => ({
                note : `Back at port ${hhmm(trip.endMinute)}, ${duration(trip.endMinute - close)} after the window closes`,
                tone : 'risk'
            }),
            none : () => state.waiting.includes(turbine) ?
                { note : `${state.teams.get(state.jobAt(turbine).team)?.name} waits at the port, drag it onto a trip`, tone : 'risk' } :
                { note : `CTV window open until ${hhmm(state.windows.ctv)}`, tone : 'ok' }
        };

    return notes[stand]?.() ?? { note : `Window open until ${hhmm(close)}`, tone : 'ok' };
}

export default class TurbineCard extends Widget {
    static $name = 'TurbineCard';

    static type = 'turbinecard';

    static configurable = {
        cls : 'ow-card'
    };

    /**
     * Shows a turbine
     * @param {Object} info See cardInfo
     */
    draw(info) {
        const text = StringHelper.encodeHtml;

        this.element.dataset.tone = info.tone;
        this.html = `
            <div class="ow-card-art">${turbineSvg({ hs : info.hs, limit : info.limit })}</div>
            <div class="ow-card-body">
                <div class="ow-card-title"><b>${text(info.name)}</b><small>${text(info.sub)}</small></div>
                <div class="ow-card-job">${text(info.job)}</div>
                <dl>
                    <dt>Team</dt><dd>${text(info.team)}</dd>
                    <dt>Trip</dt><dd>${text(info.trip)}</dd>
                    <dt>When</dt><dd>${text(info.when)}</dd>
                </dl>
                <div class="ow-card-note">${icon('waves')}<span>${text(info.note)}</span></div>
            </div>`;
    }
}

TurbineCard.initClass();
