import { SchedulerFeature } from '@bryntum/scheduler-enterprise';

export function tripsOf(trips, turbine) {
    return turbine ? trips.filter(trip => trip.turbines.includes(turbine)) : [];
}

/**
 * Links the hover of the turbine map and the Day view, both ways: a turbine hovered lights up its trips (the
 * Scheduler's event highlighting), a trip hovered rings its turbines. With no trip hovered, the trip `focusTrip` gives
 * (the one a team is held over, else the selected one) keeps its turbines ringed. The selection is linked by
 * DispatchApp.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/TimelineBase#function-highlightEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler#event-eventMouseEnter
 */
export default class MapLink extends SchedulerFeature {
    static $name = 'MapLink';

    static type = 'mapLink';

    static configurable = {
        /**
         * @config {TurbineMap}
         */
        map : null,

        /**
         * Returns the trip whose turbines are ringed while no trip is hovered
         * @config {Function}
         */
        focusTrip : () => null
    };

    construct(config) {
        super.construct(config);

        this.client.on({ eventMouseEnter : 'onTripMouseEnter', eventMouseLeave : 'onTripMouseLeave', thisObj : this });
    }

    updateMap(map) {
        map?.on({ turbineHover : ({ turbine }) => this.lightTrips(turbine), thisObj : this });
    }

    // The plan under the pointer may have changed
    refresh() {
        const { map } = this;

        if (map) {
            map.ring(this.ringedTurbines());
            this.lightTrips(map.hovered);
        }
    }

    lightTrips(turbine) {
        const
            me         = this,
            { client } = me,
            trips      = tripsOf(client.trips, turbine);

        if (trips.length) {
            client.highlightEvents({
                events             : trips,
                scroll             : false,
                unhighlightOnClick : false,
                unhighlightOthers  : true
            });
        }
        // Only the trips this link lit up
        else if (me.lighting) {
            client.unhighlightEvents();
        }

        me.lighting = trips.length > 0;
    }

    onTripMouseEnter({ eventRecord }) {
        this.hoverTrip = eventRecord.trip;
        this.map?.ring(this.ringedTurbines());
    }

    onTripMouseLeave({ eventRecord, event }) {
        const
            me      = this,
            related = event?.relatedTarget,
            // Moving between a trip and its legs is not leaving it
            into    = related instanceof Element ? me.client.resolveEventRecord(related) : null;

        if (me.hoverTrip === eventRecord.trip && into?.trip !== me.hoverTrip) {
            me.hoverTrip = null;
            me.map?.ring(me.ringedTurbines());
        }
    }

    ringedTurbines() {
        const trip = (this.hoverTrip ?? this.focusTrip())?.trip;

        return trip && !trip.isDestroyed ? trip.turbines : [];
    }
}

// Registers the feature, enabled by `features : { mapLink : true }`
MapLink.initClass();
