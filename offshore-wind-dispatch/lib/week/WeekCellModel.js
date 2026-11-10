import { EventModelEnterprise } from '@bryntum/scheduler-enterprise';

/**
 * A cell of the Week view: one vessel's trips of one day as one event, from the earliest departure to the latest
 * return, so cells never stack (WeekCells#weekCells). Its `name` is its times, its `percentDone` the seats used, which
 * the PercentBar feature draws
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/EventModelEnterprise
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/PercentBar
 */
export default class WeekCellModel extends EventModelEnterprise {
    static $name = 'WeekCellModel';

    static fields = [
        // The day of the week, 0 is today
        { name : 'day', type : 'number' },
        // The IDs of its trips, "SR-1 SR-2"
        'trips',
        // The turbines served, "T-07 T-08 T-17"
        'turbines',
        // The IDs of its trips a forecast moved here from the day before
        { name : 'moved', defaultValue : '' },
        // The most people on board on one trip, of the seats the vessel has
        { name : 'pax', type : 'number' },
        { name : 'seats', type : 'number' },
        // Minutes the last trip is back after the vessel's window closes
        { name : 'late', type : 'number', defaultValue : 0 }
    ];
}
