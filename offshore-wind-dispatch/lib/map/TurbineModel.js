import { Model } from '@bryntum/core-enterprise';

// For the marker's accessible name
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
 * A turbine of the map, in map units. TurbineMap shows its status and dimmed as classes of its marker
 * (resources/map/map.css).
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/data/Model
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
         * Outside the reach of the trip a held team is over
         * @field {Boolean} dimmed
         */
        { name : 'dimmed', type : 'boolean', defaultValue : false }
    ];

    get statusText() {
        return statusWords[this.status] ?? '';
    }
}
