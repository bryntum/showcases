import { Base, Events } from '@bryntum/core-enterprise';

/**
 * What the app shows apart from the plan, in one observable object: the turbine selected, whether the map follows
 * the selection, the team lifted from the tray and the one held over a trip with its check. The trip selected is the
 * Scheduler's own selection, the plan is the project's, the day and the forecast are the dispatch state's.
 *
 * Each property is a `configurable`: setting it to a new value fires `change`, which the views listen to. A value set
 * to what it is already is no change.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/Base
 * https://bryntum.com/products/scheduler/docs/api/Core/mixin/Events
 */
export default class AppState extends Base.mixin(Events) {
    static $name = 'AppState';

    static configurable = {
        /**
         * The turbine selected, on the map or through its trip
         * @prp {String|null}
         */
        selectedTurbine : null,

        /**
         * The map follows the selection: fitted to the selected trip or turbine. Off until the user selects one, and
         * after the map's Show all button
         * @prp {Boolean}
         */
        mapFollows : false,

        /**
         * The team dragged from the tray, by ID: its chip is dimmed
         * @prp {String|null}
         */
        lifted : null,

        /**
         * The team held over a trip or a vessel's row and its check, `{ target, trip, team, job, result, reach,
         * close }` (DropController#previewDrop), `null` while it is over nothing
         * @prp {Object|null}
         */
        held : null
    };

    /**
     * Fired when a property changes
     * @event change
     * @param {String} name The property
     * @param {*} value
     * @param {*} was
     */
    changed(name, value, was) {
        if (!this.isConfiguring) {
            this.trigger('change', { name, value, was });
        }
    }

    updateSelectedTurbine(value, was) {
        this.changed('selectedTurbine', value, was);
    }

    updateMapFollows(value, was) {
        this.changed('mapFollows', value, was);
    }

    updateLifted(value, was) {
        this.changed('lifted', value, was);
    }

    updateHeld(value, was) {
        this.changed('held', value, was);
    }
}

AppState.initClass();
