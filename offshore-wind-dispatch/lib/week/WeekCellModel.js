import { EventModelEnterprise } from '@bryntum/scheduler-enterprise';

/**
 * A cell of the Week view: one vessel's trips of one day as one derived event (WeekCells#weekCells). Its `name` is its
 * times, its `percentDone` the seats used, which the PercentBar feature draws.
 */
export default class WeekCellModel extends EventModelEnterprise {
    static $name = 'WeekCellModel';

    static fields = [
        // 0 is today
        { name : 'day', type : 'number' },
        // The IDs of its trips, "SR-1 SR-2"
        'trips',
        // The turbines served, "T-07 T-08 T-17"
        'turbines',
        // Has a trip a forecast carried over from the day before, drawn dashed
        { name : 'carried', type : 'boolean' },
        // The most people on board one trip, against the vessel's seats
        { name : 'pax', type : 'number' },
        { name : 'seats', type : 'number' },
        // Minutes the last trip is back after the vessel's window closes
        { name : 'late', type : 'number', defaultValue : 0 }
    ];
}
