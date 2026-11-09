import { Model } from '@bryntum/core-enterprise';

/**
 * A turbine of the map: where it is drawn and its status class (see MapModel and resources/map/turbines.css)
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
        { name : 'status', defaultValue : '' }
    ];

    /**
     * The status in words, for the turbine's accessible name
     * @property {String}
     */
    get statusText() {
        const words = {
            'ow-m-target'  : 'drop target',
            'ow-m-reach'   : 'within reach',
            'ow-m-work'    : 'in work',
            'ow-m-planned' : 'planned',
            'ow-m-waiting' : 'team waiting',
            'ow-m-risk'    : 'at risk',
            'ow-m-moved'   : 'moved to tomorrow',
            'ow-m-fault'   : 'stopped'
        };

        return this.status.split(' ').map(cls => words[cls]).filter(Boolean).join(', ');
    }
}
