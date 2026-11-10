import { ResourceModelEnterprise } from '@bryntum/scheduler-enterprise';

/**
 * A crew transfer vessel, the SWATH or a helicopter: a resource of both the Day and the Week view.
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

    get glyph() {
        return this.mode === 'heli' ? 'heli' : this.window === 'swath' ? 'swath' : 'ctv';
    }

    // "CTV", "SWATH", "AW169": the first part of `kind`. Not named `type`, a field of the Enterprise resource model
    get vesselType() {
        return this.kind.split(' · ')[0];
    }
}
