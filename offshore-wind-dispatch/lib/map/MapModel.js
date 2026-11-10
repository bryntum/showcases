import { turbineIds } from '../plan/Farm.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * What the turbine map shows, worked out from the trips and the dispatcher's state: a status per turbine, the labels,
 * the vessel routes and, while a team is dragged, the turbines the trip can still reach.
 * TurbineMap draws it.
 */

/**
 * Whether a turbine is stopped, and why: a team works on it (its trip has left port), or it has a fault. A stopped
 * turbine's rotor does not turn
 * @param {DispatchState} state
 * @param {TripModel[]} trips
 * @param {String} id
 * @returns {String|null} `repair`, `fault` or `null` when it runs
 */
export function stoppedOf(state, trips, id) {
    if (trips.some(trip => trip.status !== 'moved' && trip.departs <= state.now && trip.turbines.includes(id))) {
        return 'repair';
    }

    return state.faults.has(id) ? 'fault' : null;
}

/**
 * The trip serving each turbine
 * @param {TripModel[]} trips
 * @returns {Map<String,TripModel>}
 */
function tripsByTurbine(trips) {
    const map = new Map();

    trips.forEach(trip => trip.turbines.forEach(id => map.set(id, trip)));

    return map;
}

// How one turbine is shown: its status, and dimmed while a trip's reach is shown and it lies outside it (all but the
// stops of that trip itself). TurbineMap#syncMarker turns it into the marker's classes
function markerOf(id, context) {
    const { reach, target, focusTrip, byTurbine } = context;

    return {
        status : id === target ? 'target' : reach?.has(id) ? 'reach' : planStatusOf(id, context),
        dimmed : Boolean(reach) && id !== target && !reach.has(id) && !(focusTrip && byTurbine.get(id) === focusTrip)
    };
}

// The status of a turbine in the plan: served by a trip (`work`, `planned`, `risk`), `moved`, stopped (`fault`),
// `waiting` for its team, or none
function planStatusOf(id, { state, byTurbine, removed }) {
    const trip = byTurbine.get(id);

    if (trip?.status === 'moved' || removed.has(id)) {
        return 'moved';
    }

    if (trip) {
        return trip.status === 'at-risk' ? 'risk' : trip.departs <= state.now ? 'work' : 'planned';
    }

    if (state.faults.has(id)) {
        return 'fault';
    }

    return state.waiting.includes(id) ? 'waiting' : '';
}

// The labels of the plan: the selected turbine, faults, trips past the window, and what the forecast moved
function planLabels({ state, trips, selectedTurbine, byTurbine }) {
    const
        labels = [],
        team   = id => state.teams.get(state.jobAt(id)?.team)?.name;

    if (selectedTurbine && byTurbine.has(selectedTurbine) && team(selectedTurbine)) {
        labels.push({ id : selectedTurbine, text : `${selectedTurbine} · ${team(selectedTurbine)}` });
    }

    for (const id of state.faults) {
        if (id !== selectedTurbine) {
            labels.push({ id, text : id, tone : 'fault' });
        }
    }

    trips.forEach(trip => {
        // The selected turbine has its label already
        if (trip.status === 'at-risk' && trip.turbines.length) {
            if (trip.turbines.at(-1) === selectedTurbine && labels.some(label => label.id === selectedTurbine)) {
                return;
            }

            labels.push({ id : trip.turbines.at(-1), text : trip.turbines.at(-1), tone : 'risk' });
        }
        else if (trip.status === 'trimmed' && trip.removed.length) {
            labels.push({ id : trip.removed.at(-1), text : `${trip.removed.join(', ')} → ${state.nextDay}`, tone : 'moved' });
        }
        else if (trip.status === 'moved' && trip.turbines.length) {
            labels.push({ id : trip.turbines[0], text : `${trip.id} → ${state.nextDay}`, tone : 'moved' });
        }
    });

    return labels;
}

// The count that leads the callout, in bold
const turbineCount = reach => ({ tag : 'b', text : `${reach.size} turbines` });

/**
 * The map's content
 * @param {Object} options
 * @param {DispatchState} options.state
 * @param {TripModel[]} options.trips
 * @param {TripModel} [options.selectedTrip]
 * @param {String} [options.selectedTurbine]
 * @param {Object} [options.drop] A team held over a trip: `{ trip, job, result, reach }`, see
 * DropController#previewDrop
 * @returns {Object} `{ markers, labels, routes, callout, selected }`: `markers` maps each turbine to
 * `{ status, dimmed }`, a label is `{ id, text, tone }`, a route `{ stops, kind }` (`selected`, `preview` or
 * none) and the callout the DomConfig children of its line, or `null`
 */
export function mapModel({ state, trips, selectedTrip, selectedTurbine, drop }) {
    const
        byTurbine = tripsByTurbine(trips),
        removed   = new Set(trips.flatMap(trip => trip.removed ?? [])),
        context   = {
            state,
            trips,
            byTurbine,
            removed,
            reach     : drop?.reach ?? null,
            target    : drop?.job.turbine,
            focusTrip : drop?.trip ?? null
        },
        markers   = new Map(turbineIds.map(id => [id, markerOf(id, context)])),
        routes    = trips.filter(trip => trip.mode === 'vessel' && trip.status !== 'moved').map(trip => ({
            stops : trip.turbines,
            kind  : trip === (drop?.trip ?? selectedTrip) ? 'selected' : null
        }));

    let labels, callout = null;

    if (drop) {
        const { result, job, trip } = drop;

        routes.push({ stops : [...trip.turbines, job.turbine], kind : 'preview' });
        labels = [{
            id   : job.turbine,
            text : result.valid ? `${job.turbine} · +${duration(job.minutes)} · back ${hhmm(result.back)}` : `${job.turbine} · ${result.short}`,
            tone : result.valid ? 'target' : 'risk'
        }];
        callout = [turbineCount(drop.reach), ` within reach of ${trip.id} before the window closes at ${hhmm(drop.close)}`];
    }
    else {
        labels = planLabels({ state, trips, selectedTurbine, byTurbine });
    }

    return { markers, labels, routes, callout, selected : selectedTurbine };
}
