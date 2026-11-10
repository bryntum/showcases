import { Base, Events } from '@bryntum/core-enterprise';

/**
 * The app's view state as one observable object. Each property is a `configurable`, so setting it to a new value fires
 * `change`; setting it to the value it has is no change.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/mixin/Events
 */
export default class AppState extends Base.mixin(Events) {
    static $name = 'AppState';

    static configurable = {
        selectedTurbine : null,

        // The map fits itself to the selected trip or turbine. Off until the user selects one, and after Show all
        mapFollows : false,

        // The ID of the team dragged from the tray
        lifted : null,

        /**
         * The team held and its check, `{ id, target, trip, team, job, result, reach, close, at }`
         * (DropController#previewDrop), `null` while it is over nothing
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
