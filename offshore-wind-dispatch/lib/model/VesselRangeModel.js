import { ResourceTimeRangeModel } from '@bryntum/scheduler-enterprise';

/**
 * A resource time range on a vessel's row, its `kind` saying what it is. In the Day view `nogo`, the weather no-go
 * from the hour the forecast crosses the vessel's limit, or `ghost`, the old place of a trip the forecast brought
 * forward (DispatchSync). In the Week view a vessel's day without trips, `free` or `nogo` (WeekCells)
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ResourceTimeRangeModel
 */
export default class VesselRangeModel extends ResourceTimeRangeModel {
    static $name = 'VesselRangeModel';

    static fields = [
        // `nogo`, `ghost` or `free`
        'kind',
        // The Week view's: the day of the week, 0 is today
        { name : 'day', type : 'number' }
    ];
}
