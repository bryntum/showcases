/**
 * The day's counts of the KPI header (KpiBar): turbines due, turbines on a trip, either the trips past their window
 * (when any) or the turbines a forecast moved to the next day, and the turbines stopped
 * @param {TripModel[]} trips
 * @param {DispatchState} dispatch
 * @returns {Object[]} `{ label, value, tone }`
 */
export function dayKpis(trips, dispatch) {
    const
        assigned = new Set(trips.filter(trip => trip.status !== 'moved').flatMap(trip => trip.turbines)),
        moved    = new Set(trips.flatMap(trip => trip.status === 'moved' ? trip.turbines : trip.removed ?? [])),
        atRisk   = trips.filter(trip => trip.status === 'at-risk').length;

    return [
        { label : dispatch.isToday ? 'Due today' : 'Due', value : dispatch.dueTurbines.length },
        { label : 'Assigned', value : assigned.size },
        // One slot: trips past their window need acting on now, so they win over what a forecast already moved
        atRisk || !moved.size ?
            { label : 'At risk', value : atRisk, tone : 'warn' } :
            { label : `Moved to ${dispatch.nextDay}`, value : moved.size, tone : 'alert' },
        { label : 'Stopped', value : dispatch.faults.size, tone : 'stop' }
    ];
}
