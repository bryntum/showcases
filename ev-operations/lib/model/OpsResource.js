import { ResourceModelEnterprise } from '@bryntum/scheduler-enterprise';

/**
 * A work center, service bay or charger
 */
export default class OpsResource extends ResourceModelEnterprise {
    static $name = 'OpsResource';

    static fields = [
        'description',
        // Shown instead of the description while the resource is closed (blocked time)
        'warning',
        // Picks the icon. Work centers: 'press', 'weld', 'paint', 'assembly' or 'test'. Service: 'lift', 'mobile'
        // or 'charger'
        'type',
        // Work center performance (actual vs ideal cycle time, 0-1), used for OEE
        { name : 'performance', type : 'number', defaultValue : 0.95 },
        // 'bay' or 'charger', the Service view is grouped by it
        'kind',
        // Gap indicators are not shown on charger rows
        { name : 'showGaps', type : 'boolean', defaultValue : true }
    ];

    get isCharger() {
        return this.kind === 'charger';
    }
}
