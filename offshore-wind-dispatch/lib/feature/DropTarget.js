import { SchedulerFeature } from '@bryntum/scheduler-enterprise';

/**
 * What the Day view shows while a team is dragged from the tray: the trips it fits on outlined (`fitting`), and for the
 * check where it is held (`drop`, DropController#previewDrop) the trip marked and the outline of where its stop would
 * go, a resource time range. Nothing of it is in the plan until the team is dropped.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Scheduler/feature/ResourceTimeRanges
 */
export default class DropTarget extends SchedulerFeature {
    static $name = 'DropTarget';

    static type = 'dropTarget';

    static configurable = {
        /**
         * The check of the team held, `null` while it is over nothing
         * @prp {Object|null}
         */
        drop : null,

        /**
         * The trips the team fits on, checked once when it is lifted. Not a field of the trip: it is the screen's, not
         * the plan's
         * @prp {TripModel[]}
         */
        fitting : []
    };

    // The outline moves with the check, the trips held over and left are drawn again
    updateDrop(drop, was) {
        const { client } = this;

        if (this.isConfiguring) {
            return;
        }

        client.syncRanges();

        if (was?.trip !== drop?.trip) {
            new Set([was?.trip, drop?.trip]).forEach(trip => trip?.isModel && !trip.isDestroyed &&
                client.repaintEventsForResource(trip.resource));
        }
    }

    // The trip renderer outlines them (isFitting): only the vessels of the trips that start or stop fitting redraw
    updateFitting(trips, was = []) {
        if (this.isConfiguring) {
            return;
        }

        const
            changed = trip => !trip.isDestroyed && was.includes(trip) !== trips.includes(trip),
            vessels = new Set([...was, ...trips].filter(changed).map(trip => trip.resource));

        vessels.forEach(vessel => vessel && this.client.repaintEventsForResource(vessel));
    }

    isFitting(trip) {
        return this.fitting.includes(trip);
    }

    isHeld(trip) {
        return this.drop?.trip === trip;
    }

    /**
     * The outline as resource time range data, for DispatchScheduler#syncRanges. Not over a cell of the Week view, nor
     * for a helicopter, which takes no team
     * @property {Object[]}
     */
    get ranges() {
        const
            { drop, client } = this,
            vessel           = drop?.trip.resource,
            at               = minutes => client.dispatch.dateAt(minutes);

        return drop && !drop.target.isWeekCell && vessel?.mode === 'vessel' ? [{
            id         : 'drop',
            kind       : 'drop',
            // Labels the outline: the chip under the pointer hides most of it
            name       : drop.result.stop.turbine,
            resourceId : vessel.id,
            startDate  : at(drop.result.stop.from),
            endDate    : at(drop.result.stop.to)
        }] : [];
    }
}

// Registers the feature, enabled by `features : { dropTarget : true }`
DropTarget.initClass();
