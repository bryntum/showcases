/**
 * Links the turbine map and the schedule under the pointer, both ways:
 *
 * - A turbine hovered on the map lights up the trips that serve it, with the Scheduler's own event highlighting, which
 *   fades the other trips
 * - A trip hovered in the schedule rings its turbines on the map. With none hovered, the trip a team is held over or
 *   else the selected trip keeps its turbines ringed
 *
 * The selection is linked by the app (DispatchApp#onTurbineSelectionChange and #onTripSelectionChange).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/TimelineBase#function-highlightEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler#event-eventMouseEnter
 */

/**
 * The trips serving a turbine, or that the forecast took it off
 * @param {TripModel[]} trips
 * @param {String} turbine
 * @returns {TripModel[]}
 */
export function tripsOf(trips, turbine) {
    return turbine ? trips.filter(trip => trip.turbines.includes(turbine) || trip.removed?.includes(turbine)) : [];
}

export default class MapLink {
    /**
     * @param {Object} options
     * @param {TurbineMap} options.map
     * @param {DispatchScheduler} options.scheduler
     * @param {Function} options.focusTrip Returns the trip whose turbines are ringed while no trip is hovered
     */
    constructor({ map, scheduler, focusTrip }) {
        const me = this;

        Object.assign(me, { map, scheduler, focusTrip, hoverTrip : null, lighting : false });

        map.on({ turbineHover : ({ turbine }) => me.lightTrips(turbine) });
        scheduler.on({
            eventMouseEnter : event => me.onTripMouseEnter(event),
            eventMouseLeave : event => me.onTripMouseLeave(event)
        });
    }

    /**
     * Rings and lights up again, the plan under the pointer may have changed
     */
    refresh() {
        this.map.ring(this.ringedTurbines());
        this.lightTrips(this.map.hovered);
    }

    /**
     * Lights up the trips of a turbine, or none
     * @param {String|null} turbine
     */
    lightTrips(turbine) {
        const
            me            = this,
            { scheduler } = me,
            trips         = tripsOf(scheduler.trips, turbine);

        if (trips.length) {
            scheduler.highlightEvents({
                events             : trips,
                scroll             : false,
                unhighlightOnClick : false,
                unhighlightOthers  : true
            });
        }
        // Only the trips this link lit up
        else if (me.lighting) {
            scheduler.unhighlightEvents();
        }

        me.lighting = trips.length > 0;
    }

    onTripMouseEnter({ eventRecord }) {
        this.hoverTrip = eventRecord.trip;
        this.map.ring(this.ringedTurbines());
    }

    onTripMouseLeave({ eventRecord, event }) {
        const
            me      = this,
            related = event?.relatedTarget,
            // Moving between a trip and its legs is not leaving it
            into    = related instanceof Element ? me.scheduler.resolveEventRecord(related) : null;

        if (me.hoverTrip === eventRecord.trip && into?.trip !== me.hoverTrip) {
            me.hoverTrip = null;
            me.map.ring(me.ringedTurbines());
        }
    }

    // The turbines of the trip hovered, else of the focus trip
    ringedTurbines() {
        const trip = (this.hoverTrip ?? this.focusTrip())?.trip;

        return trip && !trip.isDestroyed ? trip.turbines : [];
    }
}
