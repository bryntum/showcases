import { DateHelper, StringHelper, Tooltip } from '@bryntum/core-enterprise';
import { formatTime } from '../util/Format.js';

/**
 * Blocked time of the scheduler views (ResourceTimeRanges): the rule that events stay out of it, the range renderer
 * with an icon per type, and the hover tooltip that explains a range too narrow for its label.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip#config-forSelector
 */

// Icon per blocked time type (the range's `state`): a die change, a breakdown, an inspection
const rangeIcons = { changeover : 'fa-gear', down : 'fa-triangle-exclamation', maintenance : 'fa-wrench' };

export const
    /**
     * `true` when the dates overlap blocked time of the resource. An app rule checked by the validators, resource
     * calendars could model it as well
     * @param {Scheduler.model.ResourceModel} resourceRecord
     * @param {Date} startDate
     * @param {Date} endDate
     * @returns {Boolean}
     */
    intersectsBlock = (resourceRecord, startDate, endDate) => resourceRecord.timeRanges.some(range =>
        DateHelper.intersectSpans(startDate, endDate, range.startDate, range.endDate)),

    /**
     * Range renderer: an icon per type and the label. The label sticks to the visible start edge, a narrow range shows
     * the icon alone, see ClippedBars
     */
    renderBlockedTime = ({ resourceTimeRangeRecord, renderData }) => {
        const { state, name } = resourceTimeRangeRecord;

        Object.assign(renderData.cls, { 'ev-range' : 1, [`ev-range-${state}`] : 1 });

        return [
            { tag : 'i', class : `fa ${rangeIcons[state] || rangeIcons.changeover} ev-range-icon`, 'aria-hidden' : 'true' },
            { tag : 'span', class : 'ev-range-label', text : name }
        ];
    },

    /**
     * Blocked time explains itself on hover: the full label and the times, also when the range only shows its icon
     * @param {Scheduler.view.Scheduler} view
     * @returns {Core.widget.Tooltip}
     */
    createBlockedTimeTip = view => new Tooltip({
        forElement  : view.element,
        forSelector : '.ev-range',
        hoverDelay  : 200,
        align       : 'b-t',
        getHtml     : ({ activeTarget }) => {
            const range = view.resolveResourceTimeRangeRecord(activeTarget);

            return range && StringHelper.xss`${range.name} · ${formatTime(range.startDate)}–${formatTime(range.endDate)}`;
        }
    });
