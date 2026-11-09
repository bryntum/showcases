import { ResourceModelEnterprise } from '@bryntum/scheduler-enterprise';

/**
 * A crew transfer vessel, the SWATH vessel or a helicopter, a resource of the Day view's Scheduler and of the Week
 * view's (both on the Enterprise tier)
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ResourceModelEnterprise
 */
export default class VesselModel extends ResourceModelEnterprise {
    static $name = 'VesselModel';

    static fields = [
        // `ctv` or `heli`, the group it is listed in
        'group',
        // Its type and what it carries: "CTV", "SWATH", "AW169 · hoist"
        'kind',
        // The weather limit it works to: `ctv`, `swath` or `heli`
        'window',
        // `vessel` or `heli`, how fast it gets around (Farm.js)
        'mode',
        { name : 'seats', type : 'int' }
    ];

    /**
     * The glyph of the icon set: `ctv`, `swath` or `heli`
     * @property {String}
     */
    get glyph() {
        return this.mode === 'heli' ? 'heli' : this.window === 'swath' ? 'swath' : 'ctv';
    }

    /**
     * Just its type, "CTV", "SWATH", "AW169", the first part of its `kind`. Not `type`: that is a field of the
     * Enterprise resource model already
     * @property {String}
     */
    get vesselType() {
        return this.kind.split(' · ')[0];
    }
}
