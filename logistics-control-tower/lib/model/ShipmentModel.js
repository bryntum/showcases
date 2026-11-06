import { Model } from '@bryntum/core-enterprise';

/**
 * An inbound shipment, a truck on its way to the distribution centre. Shipments live in their own store, the source of
 * truth for transport state (ETA, GPS, temperature). Booked dock slots live in the Scheduler's event store, with the
 * shipment id as the event id, the source of truth for slots.
 */
export default class ShipmentModel extends Model {
    static $name = 'ShipmentModel';

    static fields = [
        // Human readable reference, shown in both views
        'ref',
        'carrier',
        'carrierCode',
        // Name of a Bryntum palette colour (blue, teal...), resolved through `--b-color-{name}`, follows the theme
        'carrierColor',
        'origin',
        // 'dry' or 'reefer' (temperature controlled)
        'loadType',
        { name : 'pallets', type : 'int' },
        { name : 'plannedEta', type : 'date' },
        { name : 'eta', type : 'date' },
        // Latest acceptable unload completion, slots ending after it breach the delivery SLA
        { name : 'dueBy', type : 'date' },
        // Minutes the ETA is behind (positive) or ahead of (negative) the planned ETA
        { name : 'delayMinutes', type : 'int', defaultValue : 0 },
        // The last delayMinutes values, drawn as a sparkline in the grid
        { name : 'etaHistory', type : 'array', defaultValue : [] },
        { name : 'setpoint', type : 'number' },
        { name : 'temperature', type : 'number' },
        // 'live', 'stale', 'lost' or 'arrived'
        { name : 'gps', defaultValue : 'live' },
        // 'on-time', 'at-risk', 'late' (in transit), 'yard' (arrived, waiting), 'unloading' or 'done'
        { name : 'status', defaultValue : 'on-time' },
        { name : 'expedited', type : 'boolean', defaultValue : false },
        // Unbooked by the dispatcher, the simulation does not book it again
        { name : 'onHold', type : 'boolean', defaultValue : false }
    ];

    get isFinished() {
        return this.status === 'done';
    }

    get isInTransit() {
        return this.status === 'on-time' || this.status === 'at-risk' || this.status === 'late';
    }

    /**
     * Flattens this shipment and its dock slot (if booked) to the plain object AG Grid shows. Dates become timestamps,
     * so AG Grid detects the values that changed and flashes their cells
     * @param {SlotModel} [slot] The booked dock slot
     * @returns {Object}
     */
    toRow(slot) {
        const
            {
                id, ref, carrier, carrierCode, carrierColor, origin, loadType, pallets, plannedEta, eta, dueBy,
                delayMinutes, etaHistory, setpoint, temperature, gps, status, expedited, onHold
            }    = this,
            dock = slot?.resource;

        return {
            id,
            ref,
            carrier,
            carrierCode,
            carrierColor,
            origin,
            loadType,
            pallets,
            plannedEta : plannedEta.getTime(),
            eta        : eta.getTime(),
            dueBy      : dueBy.getTime(),
            delay      : delayMinutes,
            // A new array when the history changed, AG Grid's sparkline compares by reference
            etaHistory,
            setpoint,
            temperature,
            gps,
            status,
            // Aggregated per carrier in the group rows
            late       : status === 'late' ? 1 : 0,
            expedited,
            onHold,
            dockId     : dock?.id ?? null,
            dockName   : dock?.name ?? null,
            slotStart  : slot ? slot.startDate.getTime() : null,
            slotEnd    : slot ? slot.plannedEnd : null,
            slaBreach  : Boolean(slot?.slaBreach)
        };
    }
}
