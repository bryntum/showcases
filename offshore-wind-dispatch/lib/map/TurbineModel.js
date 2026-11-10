import { Model } from '@bryntum/core-enterprise';

// The statuses of a turbine in words, for its accessible name
const statusWords = {
    target  : 'drop target',
    reach   : 'within reach',
    work    : 'in work',
    planned : 'planned',
    waiting : 'team waiting',
    risk    : 'at risk',
    fault   : 'stopped'
};

/**
 * A turbine of the map: where it is drawn, its status in the plan and whether it is dimmed (see MapModel). TurbineMap
 * shows them as classes of its marker (resources/map/map.css)
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/data/Model
 */
export default class TurbineModel extends Model {
    static $name = 'TurbineModel';

    static fields = [
        { name : 'x', type : 'number' },
        { name : 'y', type : 'number' },
        'row',
        /**
         * `target`, `reach`, `work`, `planned`, `waiting`, `risk`, `fault`, or empty for none
         * @field {String} status
         */
        { name : 'status', defaultValue : '' },
        /**
         * Outside the reach of the trip shown
         * @field {Boolean} dimmed
         */
        { name : 'dimmed', type : 'boolean', defaultValue : false }
    ];

    /**
     * The status in words, for the turbine's accessible name
     * @property {String}
     */
    get statusText() {
        return statusWords[this.status] ?? '';
    }
}
