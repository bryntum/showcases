import { StringHelper, Widget } from '@bryntum/core-enterprise';
import { rowName, substation } from '../plan/Farm.js';
import { buildLegs, timeLegs } from '../plan/Planner.js';
import { icon } from '../util/Icons.js';
import { duration, hhmm, nextDay } from '../util/Time.js';
import { turbineSvg } from './Turbine.js';

/**
 * The selected turbine under the map: the illustration with the sea at the forecast wave height against the vessel's
 * limit, then the job, the team, the trip, when, and one line on how it stands against the weather window. The map's
 * tooltip on a turbine shows the same card (cardHtml, tipInfo).
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
 * @returns {Object} `{ name, sub, stand, job, team, trip, when, hs, limit, note, tone }`
 */
export function cardInfo({ state, trips, turbine, drop }) {
    const
        held    = drop?.job.turbine === turbine,
        trip    = held ? drop.trip : trips.find(each => each.turbines.includes(turbine)),
        // Its trip's status may be `at-risk` since, the turbine still waits for tomorrow
        trimmed = trips.find(each => each.change === 'trimmed' && each.removed?.includes(turbine)),
        // Where it stands: held over a trip, moved to tomorrow, on a trip, or neither
        stand   = standOf(held, trip, trimmed),
        stop    = trip?.legs.find(leg => leg.turbine === turbine),
        planned = trip ?? trimmed,
        vessel  = planned?.resource;

    return {
        ...describe(state, turbine),
        stand,
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

/**
 * The earliest a vessel trip that has not left yet could be on station at a turbine, with the turbine's job (an hour if
 * none) added as its last stop, and still be back before its window closes
 * @param {Object} options
 * @param {DispatchState} options.state
 * @param {TripModel[]} options.trips
 * @param {String} options.turbine
 * @returns {Object|null} `{ trip, from, back, others }`, others counts the other trips that could
 */
export function reachOf({ state, trips, turbine }) {
    const
        minutes = state.jobAt(turbine)?.minutes ?? 60,
        options = trips
            .filter(trip => trip.mode === 'vessel' && trip.status !== 'moved' && trip.departs > state.now &&
                trip.stops.length && !trip.turbines.includes(turbine))
            .map(trip => {
                const legs = timeLegs(trip.departs, buildLegs([...trip.stops, { turbine, minutes }], trip.mode));

                return { trip, from : legs.at(-2).from, back : legs.at(-1).to, close : state.closeOf(trip.resource) };
            })
            .filter(option => option.back <= option.close)
            .sort((a, b) => a.from - b.from);

    return options.length ? { ...options[0], others : options.length - 1 } : null;
}

/**
 * What the map's tooltip says about a turbine: the card's, and for a turbine no trip serves, when a trip could still
 * reach it, the sea drawn at that hour
 * @param {Object} options See cardInfo
 * @returns {Object} See cardInfo
 */
export function tipInfo({ state, trips, turbine, drop }) {
    const info = cardInfo({ state, trips, turbine, drop });

    if (info.stand !== 'none' || turbine === substation) {
        return info;
    }

    const reach = reachOf({ state, trips, turbine });

    return reach ? {
        ...info,
        hs   : state.hsAt(reach.from),
        when : `Reachable ${hhmm(reach.from)} on ${reach.trip.id}, back ${hhmm(reach.back)}` +
            (reach.others ? ` (+${reach.others} more)` : '')
    } : { ...info, when : 'No trip left reaches it before its window closes' };
}

/**
 * The card's content: the turbine at the wave height, the job, the team, the trip, when, and the weather note
 * @param {Object} info See cardInfo
 * @param {String} [id] Prefix of the IDs in the drawing, unique per card on the page
 * @returns {String} HTML
 */
export function cardHtml(info, id = 'ow') {
    const text = StringHelper.encodeHtml;

    return `
        <div class="ow-card-art">${turbineSvg({ hs : info.hs, limit : info.limit, id })}</div>
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
        this.element.dataset.tone = info.tone;
        this.html = cardHtml(info);
    }
}

TurbineCard.initClass();
