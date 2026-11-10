import { ResourceTimeRangeModel } from '@bryntum/scheduler-enterprise';

/**
 * A resource time range on a vessel's row, by `kind`: in the Day view `nogo` (the weather no-go) or `ghost` (the old
 * place of a trip the forecast brought forward), in the Week view a day without trips, `free` or `nogo` (WeekCells).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ResourceTimeRangeModel
 */
export default class VesselRangeModel extends ResourceTimeRangeModel {
    static $name = 'VesselRangeModel';

    static fields = [
        'kind',
        // The Week view's: the day of the week, 0 is today
        { name : 'day', type : 'number' }
    ];
}
