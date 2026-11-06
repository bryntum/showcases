/**
 * The control tower's KPIs, counted over all shipments and slots
 * @param {Core.data.Store} shipmentStore
 * @param {Scheduler.data.EventStore} eventStore
 * @returns {Object<String,Number>} `inTransit`, `onTime` (percentage of those in transit), `late`, `yard`,
 * `unloading`, `done` and `conflicts` (slots ending after the shipment's due time)
 */
export function countKpis(shipmentStore, eventStore) {
    const counts = { 'on-time' : 0, 'at-risk' : 0, late : 0, yard : 0, unloading : 0, done : 0, conflicts : 0 };

    // Block bodies, a Store#forEach callback returning `false` stops the iteration
    shipmentStore.forEach(shipment => {
        counts[shipment.status]++;
    });

    eventStore.forEach(slot => {
        if (slot.slaBreach) {
            counts.conflicts++;
        }
    });

    const inTransit = counts['on-time'] + counts['at-risk'] + counts.late;

    return {
        inTransit,
        onTime    : inTransit ? 100 * counts['on-time'] / inTransit : 100,
        late      : counts.late,
        yard      : counts.yard,
        unloading : counts.unloading,
        done      : counts.done,
        conflicts : counts.conflicts
    };
}
