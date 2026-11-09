import { turbineIds } from '../plan/Farm.js';
import { duration, hhmm, nextDay } from '../util/Time.js';

/**
 * What the turbine map shows, worked out from the trips and the dispatcher's state: a status per turbine, the labels,
 * the vessel routes and, while a team is dragged or with the Access view on, the turbines a trip can still reach.
 * TurbineMap draws it.
 */

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

// The status class of one turbine, see map.css
function statusOf(id, { state, byTurbine, removed, reach, target }) {
    const trip = byTurbine.get(id);

    if (id === target) {
        return 'ow-m-target';
    }

    if (reach?.has(id)) {
        return 'ow-m-reach';
    }

    if (trip?.status === 'moved' || removed.has(id)) {
        return 'ow-m-moved';
    }

    if (trip) {
        return trip.status === 'at-risk' ? 'ow-m-risk' : trip.startMinute <= state.now ? 'ow-m-work' : 'ow-m-planned';
    }

    return idleStatusOf(id, state, reach);
}

// A turbine no trip serves: stopped, waiting for its team, dimmed while showing a trip's reach
function idleStatusOf(id, state, reach) {
    if (state.faults.has(id)) {
        return 'ow-m-fault';
    }

    if (state.waiting.includes(id)) {
        return 'ow-m-waiting';
    }

    return reach ? 'ow-m-dim' : '';
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
            labels.push({ id, text : `${id} · fault`, cls : 'ow-map-label-fault' });
        }
    }

    trips.forEach(trip => {
        if (trip.status === 'at-risk' && trip.turbines.length) {
            labels.push({ id : trip.turbines.at(-1), text : `${trip.turbines.at(-1)} · at risk`, cls : 'ow-map-label-risk' });
        }
        else if (trip.status === 'trimmed' && trip.removed.length) {
            labels.push({ id : trip.removed.at(-1), text : `${trip.removed.join(', ')} → ${nextDay}`, cls : 'ow-map-label-moved' });
        }
        else if (trip.status === 'moved' && trip.turbines.length) {
            labels.push({ id : trip.turbines[0], text : `${trip.id} → ${nextDay}`, cls : 'ow-map-label-moved' });
        }
    });

    return labels;
}

/**
 * The map's content
 * @param {Object} options
 * @param {DispatchState} options.state
 * @param {TripModel[]} options.trips
 * @param {TripModel} [options.selectedTrip]
 * @param {String} [options.selectedTurbine]
 * @param {Object} [options.drop] A team held over a trip: `{ trip, job, result, reach }`, see DispatchApp#previewDrop
 * @param {Object} [options.access] The Access view: `{ trip, reach, minutes }`
 * @returns {Object} `{ markers, labels, routes, callout, selected }`
 */
export function mapModel({ state, trips, selectedTrip, selectedTurbine, drop, access }) {
    const
        byTurbine = tripsByTurbine(trips),
        removed   = new Set(trips.flatMap(trip => trip.removed ?? [])),
        focus     = drop ?? access,
        context   = { state, byTurbine, removed, reach : focus?.reach ?? null, target : drop?.job.turbine },
        markers   = new Map(turbineIds.map(id => [id, statusOf(id, context)])),
        routes    = trips.filter(trip => trip.mode === 'vessel' && trip.status !== 'moved').map(trip => ({
            stops : trip.turbines,
            cls   : trip === (focus?.trip ?? selectedTrip) ? 'ow-route-selected' : ''
        }));

    let labels, callout = null;

    if (drop) {
        const { result, job, trip } = drop;

        routes.push({ stops : [...trip.turbines, job.turbine], cls : 'ow-route-preview' });
        labels = [{
            id   : job.turbine,
            text : result.valid ? `${job.turbine} · +${duration(job.minutes)} · back ${hhmm(result.back)}` : `${job.turbine} · ${result.reason}`,
            cls  : result.valid ? 'ow-map-label-target' : 'ow-map-label-fault'
        }];
        callout = `<b>${drop.reach.size} turbines</b> within reach of ${trip.id} before the window closes at ${hhmm(drop.close)}`;
    }
    else {
        labels = planLabels({ state, trips, selectedTurbine, byTurbine });

        if (access) {
            callout = access.trip ?
                `<b>${access.reach.size} turbines</b> where ${access.trip.id} could still add a ${duration(access.minutes)} stop before ${hhmm(access.close)}` :
                'Select a trip to see where it can still go before its window closes';
        }
    }

    return { markers, labels, routes, callout, selected : selectedTurbine };
}
