import { duration, hhmm } from '../util/Time.js';

/**
 * What the turbine map shows, as plain data worked out from the trips and the dispatch state (mapModel). TurbineMap
 * draws it.
 */

/**
 * A turbine is stopped while a team works on it (its trip has left port), or with a fault
 * @returns {String|null} `repair`, `fault` or `null` when it runs
 */
export function stoppedOf(state, trips, id) {
    if (trips.some(trip => trip.departs <= state.now && trip.turbines.includes(id))) {
        return 'repair';
    }

    return state.faults.has(id) ? 'fault' : null;
}

function tripsByTurbine(trips) {
    const map = new Map();

    trips.forEach(trip => trip.turbines.forEach(id => map.set(id, trip)));

    return map;
}

// Dimmed while a trip's reach is shown and the turbine lies outside it, unless it is a stop of that trip
function markerOf(id, context) {
    const { reach, target, focusTrip, byTurbine } = context;

    return {
        status : id === target ? 'target' : reach?.has(id) ? 'reach' : planStatusOf(id, context),
        dimmed : Boolean(reach) && id !== target && !reach.has(id) && !(focusTrip && byTurbine.get(id) === focusTrip)
    };
}

function planStatusOf(id, { state, byTurbine }) {
    const trip = byTurbine.get(id);

    if (trip) {
        return trip.status === 'at-risk' ? 'risk' : trip.departs <= state.now ? 'work' : 'planned';
    }

    if (state.faults.has(id)) {
        return 'fault';
    }

    return state.waiting.includes(id) ? 'waiting' : '';
}

// Labels for the selected turbine, the faults and the last stop of each trip past the window
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
        const last = trip.turbines.at(-1);

        // The selected turbine has its label already
        if (trip.status === 'at-risk' && last && !(last === selectedTurbine && labels.some(label => label.id === last))) {
            labels.push({ id : last, text : last, tone : 'risk' });
        }
    });

    return labels;
}

const turbineCount = reach => ({ tag : 'b', text : `${reach.size} turbines` });

/**
 * @param {Object} options
 * @param {DispatchState} options.state
 * @param {TripModel[]} options.trips
 * @param {TripModel} [options.selectedTrip]
 * @param {String} [options.selectedTurbine]
 * @param {Object} [options.drop] A team held over a trip: `{ trip, job, result, reach }`, see
 * DropController#previewDrop
 * @returns {Object} `{ markerOf, labels, routes, callout, selected }`: `markerOf(id)` gives a turbine's
 * `{ status, dimmed }` (its TurbineModel fields), a label is `{ id, text, tone }`, a route `{ stops, kind }`
 * (`selected`, `preview` or none) and the callout the DomConfig children of its line, or `null`
 */
export function mapModel({ state, trips, selectedTrip, selectedTurbine, drop }) {
    const
        byTurbine = tripsByTurbine(trips),
        context   = {
            state,
            trips,
            byTurbine,
            reach     : drop?.reach ?? null,
            target    : drop?.job.turbine,
            focusTrip : drop?.trip ?? null
        },
        routes    = trips.filter(trip => trip.mode === 'vessel').map(trip => ({
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

    return { markerOf : id => markerOf(id, context), labels, routes, callout, selected : selectedTurbine };
}
