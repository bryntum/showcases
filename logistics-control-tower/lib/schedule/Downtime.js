import { DateHelper, StringHelper, Tooltip } from '@bryntum/core-enterprise';
import { formatTime } from '../util/Time.js';

/**
 * Door downtime (ResourceTimeRanges): defrost cycles of the cold store doors, maintenance and cleaning windows. Drawn
 * striped behind the slots, labelled where wide enough, explained by a tooltip. No slot may be booked, dropped,
 * resized or moved into it, see DockBooking#getBusy and DockSchedule#validateSlotDrop.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip#config-forSelector
 */
export const
    /**
     * The downtime of a door overlapping the passed span, if any
     * @param {DockModel} door
     * @param {Date|Number} start
     * @param {Date|Number} end
     * @returns {Scheduler.model.ResourceTimeRangeModel|undefined}
     */
    downtimeAt = (door, start, end) => door.timeRanges.find(range =>
        DateHelper.intersectSpans(new Date(start), new Date(end), range.startDate, range.endDate)),

    /**
     * The downtime of a door as busy `{ start, end }` intervals in ms, see DockPlanner
     * @param {DockModel} door
     * @returns {Object[]}
     */
    downtimeIntervals = door => door.timeRanges.map(range => ({
        start : range.startDate.getTime(),
        end   : range.endDate.getTime()
    })),

    // The range's label, hidden by a container query where the range is too narrow for it (downtime.css)
    renderDowntime = ({ resourceTimeRangeRecord, renderData }) => {
        renderData.cls['lct-downtime'] = 1;

        return { class : 'lct-downtime-label', text : resourceTimeRangeRecord.name };
    },

    /**
     * The tooltip of the downtime: what and when, also for a range too narrow for its label
     * @param {Scheduler.view.Scheduler} view
     * @returns {Core.widget.Tooltip}
     */
    createDowntimeTip = view => new Tooltip({
        forElement  : view.element,
        forSelector : '.lct-downtime',
        hoverDelay  : 200,
        align       : 'b-t',
        getHtml     : ({ activeTarget }) => {
            const range = view.resolveResourceTimeRangeRecord(activeTarget);

            return range && StringHelper.xss`${range.name}, unavailable · ${formatTime(range.startDate)}–${formatTime(range.endDate)}`;
        }
    });
