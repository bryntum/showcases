import { EventModelEnterprise } from '@bryntum/scheduler-enterprise';
import { minuteMs } from '../util/Time.js';

/**
 * A booked unloading slot at a dock door. Its id is the id of the shipment it belongs to. The shipment's display state
 * is mirrored onto the slot, so the event renderer does not look anything up.
 */
export default class SlotModel extends EventModelEnterprise {
    static $name = 'SlotModel';

    static fields = [
        'carrierCode',
        'carrierColor',
        'loadType',
        { name : 'pallets', type : 'int' },
        { name : 'dueBy', type : 'date' },
        { name : 'status', defaultValue : 'on-time' },
        // The shipment's delay in minutes, shown on the bars of trucks at risk or late
        { name : 'delayMinutes', type : 'int', defaultValue : 0 },
        { name : 'expedited', type : 'boolean', defaultValue : false },
        // Booked for a truck whose arrival is not confirmed yet, see Simulator#refreshStatuses
        { name : 'tentative', type : 'boolean', defaultValue : false },
        { name : 'durationUnit', defaultValue : 'minute' }
    ];

    get isStarted() {
        return this.status === 'unloading' || this.status === 'done';
    }

    /**
     * The end time in ms from the start and the duration in minutes. Unlike `endDate` it is known right after a change,
     * before the scheduling engine has committed it
     * @property {Number}
     */
    get plannedEnd() {
        return this.startDate.getTime() + this.duration * minuteMs;
    }

    /**
     * Unloading ends after the shipment's due time
     * @property {Boolean}
     */
    get slaBreach() {
        return this.status !== 'done' && Boolean(this.dueBy) && this.plannedEnd > this.dueBy.getTime();
    }
}
