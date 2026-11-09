import { Widget } from '@bryntum/core-enterprise';
import { rowName, substation } from '../plan/Farm.js';
import { appendStop } from '../plan/Planner.js';
import { iconConfig } from '../util/Icons.js';
import { duration, hhmm } from '../util/Time.js';
import { stoppedOf } from './MapModel.js';
import { rotorText, turbineSvg } from './Turbine.js';

/**
 * The selected turbine under the map: the illustration with the sea at the forecast wave height against the vessel's
 * limit, then the job, the team, the trip, when, and one line on how it stands against the weather window. The map's
 * tooltip on a turbine shows the same card (cardContent, tipInfo).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */

/**
 * What the card says about a turbine
 * @param {Object} options
 * @param {DispatchState} options.state
 * @param {TripModel[]} options.trips
 * @param {String} options.turbine
 * @param {Object} [options.drop] A team held over a trip, see DropController#previewDrop
 * @param {TripModel} [options.selectedTrip] The trip selected in the schedule: of the trips serving the turbine (a
 * drop-off and a pickup), its visit is the one shown
 * @returns {Object} `{ name, sub, rating, stand, job, team, trip, when, hs, limit, note, tone, stopped, wind }`, the
 * substation has no `rating`
 */
export function cardInfo({ state, trips, turbine, drop, selectedTrip }) {
    const
        held    = drop?.job.turbine === turbine,
        { trip, stop } = visitOf({ trips, turbine, drop, selectedTrip, held }),
        // Its trip's status may be `at-risk` since, the turbine still waits for tomorrow
        trimmed = trips.find(each => each.change === 'trimmed' && each.removed?.includes(turbine)),
        // Where it stands: held over a trip, moved to tomorrow, on a trip, or neither
        stand   = standOf(held, trip, trimmed),
        planned = trip ?? trimmed,
        vessel  = planned?.resource;

    return {
        ...describe(state, turbine),
        stopped : stoppedOf(state, trips, turbine),
        // At hub height now, how fast the rotor of the drawing turns
        wind    : state.windAt(),
        stand,
        trip    : vessel ? `${planned.id} · ${vessel.name}` : 'Not assigned',
        when    : whenOf(stand, stop, state),
        hs      : state.hsAt(stop?.from ?? state.now),
        limit   : state.limits[vessel?.window === 'swath' ? 'swath' : 'ctv'].hs,
        ...noteOf({ state, turbine, trip : planned, drop, stand })
    };
}

// The trip that visits a turbine and its stop there: the trip of a team held over it, else the selected trip if it
// serves the turbine (a pickup after a drop-off), else the first one that does
function visitOf({ trips, turbine, drop, selectedTrip, held }) {
    if (held) {
        // From the team's check: the scheduling engine may not have placed the previewed leg yet
        return { trip : drop.trip, stop : drop.result.stop };
    }

    const
        serves = each => each.turbines.includes(turbine),
        trip   = selectedTrip && serves(selectedTrip) ? selectedTrip : trips.find(serves);

    return { trip, stop : trip?.legs.find(leg => leg.type === 'stop' && leg.turbine === turbine) };
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

// When the turbine is worked on: on station today, or the first sailing of the next day it was moved to
function whenOf(stand, stop, { firstSailing, nextDay }) {
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
        name   : turbine,
        sub    : `${rowName(turbine)}${state.faults.has(turbine) ? ' · stopped' : ''}`,
        rating : `${state.site.turbineMw.toFixed(1)} MW`,
        job    : job?.job ?? 'No work due today',
        // Every technician has the GWO basics, only a certificate that limits where a team can go is worth a word
        team   : team ? [team.name, team.certs.filter(cert => cert !== 'GWO').join(', ')].filter(Boolean).join(' · ') : '–'
    };
}

// A time in the card's one line, semibold
const clock = minutes => ({ tag : 'b', text : hhmm(minutes) });

// The line on the weather window as DomConfig children, one line, and its tone
function noteOf({ state, turbine, trip, drop, stand }) {
    const
        close = trip && state.closeOf(trip.resource),
        name  = trip && state.limits[trip.resource.window].name,
        notes = {
            held : () => drop.result.valid ?
                {
                    note : ['Back ', clock(drop.result.back), ` · ${duration(drop.result.margin)} before the ${name} window`],
                    tone : 'reach'
                } :
                { note : [drop.result.short], tone : 'cancel' },
            moved : () => ({
                note : [`Return leg would meet Hs ${state.hsAt(trip.endMinute).toFixed(1)} m`],
                tone : 'cancel'
            }),
            'at-risk' : () => ({
                note : ['Back ', clock(trip.endMinute), ` · ${duration(trip.endMinute - close)} after the ${name} window`],
                tone : 'risk'
            }),
            none : () => state.waiting.includes(turbine) ?
                {
                    note : [`${state.teams.get(state.jobAt(turbine).team)?.name} waits · drag it on a trip`],
                    tone : 'risk'
                } :
                { note : ['Window open until ', clock(state.windows.ctv)], tone : 'ok' }
        };

    return notes[stand]?.() ?? { note : ['Window open until ', clock(close)], tone : 'ok' };
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
                const { stop, back } = appendStop(trip.plan, { turbine, minutes });

                return { trip, from : stop.from, back, close : state.closeOf(trip.resource) };
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
export function tipInfo({ state, trips, turbine, drop, selectedTrip }) {
    const
        card = cardInfo({ state, trips, turbine, drop, selectedTrip }),
        // The tooltip alone says how fast the rotor turns
        info = turbine === substation ? card : { ...card, rotor : rotorText(card.wind, card.stopped) };

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
 * The card's content as DomConfigs: the turbine at the wave height, the job, the team, the trip, when, and the weather
 * note
 * @param {Object} info See cardInfo
 * @param {String} [id] Prefix of the IDs in the drawing, unique per card on the page
 * @returns {Object[]} DomConfig
 */
export function cardContent(info, id = 'ow') {
    // A stopped turbine's rotor stands still, the wrench marks one under repair
    const
        art  = turbineSvg({
            hs     : info.hs,
            limit  : info.limit,
            id,
            spin   : !info.stopped,
            wind   : info.wind,
            repair : info.stopped === 'repair'
        }),
        rows = [['Team', info.team], ['Trip', info.trip], ['When', info.when], info.rotor && ['Rotor', info.rotor]]
            .filter(Boolean).flatMap(([term, text]) => [{ tag : 'dt', text : term }, { tag : 'dd', text }]);

    return [
        // The drawing is SVG markup
        { class : 'ow-card-art', html : art },
        {
            class    : 'ow-card-body',
            children : [
                {
                    class    : 'ow-card-title',
                    children : [
                        { tag : 'b', text : info.name },
                        { tag : 'small', text : info.sub },
                        // The rating, a small pill with a lightning bolt
                        info.rating && {
                            tag      : 'span',
                            class    : 'ow-card-rating',
                            children : [iconConfig('lightning'), info.rating]
                        }
                    ]
                },
                { class : 'ow-card-job', text : info.job },
                { tag : 'dl', children : rows },
                { class : 'ow-card-note', children : [iconConfig('waves'), { tag : 'span', children : info.note }] }
            ]
        }
    ];
}

/**
 * The map's tooltip on a turbine as DomConfigs: the card's content in a smaller card
 * @param {Object} info See tipInfo
 * @returns {Object[]} DomConfig
 */
export function tipContent(info) {
    // In a list, or the config would be the tooltip's own element
    return [{ class : 'ow-card ow-card-tip', dataset : { tone : info.tone }, children : cardContent(info, 'ow-tip') }];
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
        this.html = cardContent(info);
    }
}

TurbineCard.initClass();
