import { ResourceModelEnterprise } from '@bryntum/scheduler-enterprise';
import DockPlanner from '../simulation/DockPlanner.js';

/**
 * A dock door. Its capability decides which loads it can take, see DockPlanner.accepts()
 */
export default class DockModel extends ResourceModelEnterprise {
    static $name = 'DockModel';

    static fields = [
        // 'dry' or 'reefer' (temperature controlled)
        { name : 'capability', defaultValue : 'dry' },
        'zone'
    ];

    accepts(loadType) {
        return DockPlanner.accepts(this.capability, loadType);
    }
}
