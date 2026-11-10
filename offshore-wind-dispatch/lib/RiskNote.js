import { Container } from '@bryntum/core-enterprise';
import { duration } from './util/Time.js';

/**
 * On a phone, in the header in place of the counts: the trips back after their window closes, "Sea Puffin back 17 min
 * after the window closes", and a Show button that fires `locate` for each of them in turn, the latest first. Hidden
 * while no trip is late.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 */
export default class RiskNote extends Container {
    static $name = 'RiskNote';

    static type = 'risknote';

    static configurable = {
        /**
         * The late trips, `{ trip, late }` (DispatchState#lateTrips)
         * @prp {Object[]}
         */
        trips : [],

        cls    : 'ow-risk',
        hidden : true,
        role   : 'status',
        layout : { type : 'hbox', align : 'center' },
        items  : {
            riskText : { type : 'widget', cls : 'ow-risk-text', flex : 1 },
            riskShow : { type : 'button', rendition : 'text', text : 'Show', onClick : 'up.onShowClick' }
        }
    };

    /**
     * Fired when Show is clicked, for the next late trip
     * @event locate
     * @param {TripModel} trip
     */
    onShowClick() {
        const { trips } = this;

        if (trips.length) {
            this.index = ((this.index ?? -1) + 1) % trips.length;
            this.trigger('locate', { trip : trips[this.index].trip });
        }
    }

    updateTrips(trips) {
        const [first] = trips;

        this.index = null;
        this.hidden = !first;
        this.widgetMap.riskText.html = trips.length > 1 ? `${trips.length} trips back after their window closes` :
            first ? `${first.trip.resource.name} back ${duration(first.late)} after the window closes` : '';
    }
}

RiskNote.initClass();
