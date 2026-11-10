import { SchedulerFeature } from '@bryntum/scheduler-enterprise';

/**
 * What the Day view shows while a team is dragged from the tray: the trips it fits on outlined (`fitting`), and for the
 * check where it is held (`drop`, DropController#previewDrop) the trip marked and the outline of where its stop would
 * go, a resource time range. Nothing of it is in the plan until the team is dropped.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
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
         * The trips the team fits on, checked once when it is lifted. Not a field of the trip: changing the record
         * would redraw the trip and its legs
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

    // The class goes on the trips' elements now, no redraw; the renderer keeps it on a later one (isFitting)
    updateFitting(trips, was = []) {
        const outline = (each, on) => this.client.getElementFromEventRecord(each)?.classList.toggle('ow-trip-fits', on);

        was.forEach(trip => outline(trip, false));
        trips.forEach(trip => outline(trip, true));
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
