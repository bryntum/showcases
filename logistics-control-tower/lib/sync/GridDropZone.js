import { DomHelper } from '@bryntum/core-enterprise';
import DockPlanner from '../simulation/DockPlanner.js';
import { formatTime, minuteMs } from '../util/Time.js';

/**
 * Makes the dock schedule's timeline a drop zone for the rows of the shipment grid (AG Grid's `addRowDropZone`). While
 * a shipment is dragged over a door, a preview bar shows the slot it would get, or why the door can not take it.
 * Dropping it books the slot (or moves its slot there), the engine pushes the slots after it.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/drag-and-drop/#row-drop-zone
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/TimelineBase#function-getDateFromCoordinate
 * https://bryntum.com/products/scheduler/docs/api/Grid/view/Grid#function-getRecordFromElement
 */
export default class GridDropZone {
    /**
     * @param {Object} options
     * @param {Object} options.gridApi AG Grid API
     * @param {DockSchedule} options.schedule
     * @param {Core.data.Store} options.shipmentStore
     */
    constructor({ gridApi, schedule, shipmentStore }) {
        const me = this;

        Object.assign(me, { gridApi, schedule, shipmentStore });

        gridApi.addRowDropZone({
            getContainer : () => schedule.timeAxisSubGridElement,
            onDragEnter  : params => me.onDragging(params),
            onDragging   : params => me.onDragging(params),
            onDragLeave  : () => me.hidePreview(),
            onDragStop   : params => me.onDragStop(params)
        });
    }

    /**
     * Where the dragged shipment would go: the door and the start under the pointer, and whether it may go there
     * @param {Object} params AG Grid row drag params
     * @returns {Object|null} `{ shipment, door, startDate, minutes, valid, message }`, `null` outside the doors
     */
    resolveTarget({ event, node }) {
        const
            { schedule } = this,
            shipment     = node?.data && this.shipmentStore.getById(node.data.id),
            door         = shipment && this.resolveDoor(event),
            // The pointer's time, unrounded, the slot starts on the next five minutes
            date         = door && schedule.getDateFromCoordinate(event.clientX, null, false);

        if (!date) {
            return null;
        }

        const
            startDate = new Date(DockPlanner.ceilToFiveMinutes(Math.max(date.getTime(), schedule.now.getTime()))),
            minutes   = DockPlanner.unloadMinutes(shipment.pallets, shipment.loadType),
            accepts   = door.accepts(shipment.loadType);

        return {
            shipment,
            door,
            startDate,
            minutes,
            valid   : accepts,
            message : accepts ? `${door.name} · ${formatTime(startDate)}` : `${door.name} cannot take ${shipment.loadType} loads`
        };
    }

    // The door row under the pointer. The event's target is AG Grid's drag layer, so the row is found by position
    resolveDoor({ clientX, clientY }) {
        const
            { schedule } = this,
            row          = document.elementsFromPoint(clientX, clientY)
                .find(element => element.matches('.b-grid-row') && schedule.element.contains(element));

        return row ? schedule.getRecordFromElement(row) : null;
    }

    onDragging(params) {
        const target = this.resolveTarget(params);

        target ? this.showPreview(target) : this.hidePreview();
    }

    onDragStop(params) {
        const
            me           = this,
            { schedule } = me,
            target       = me.resolveTarget(params);

        me.hidePreview();

        if (target?.valid) {
            const slot = schedule.bookAt(target.shipment, target.door, target.startDate);

            schedule.project.commitAsync().then(() => {
                if (!schedule.isDestroyed && schedule.eventStore.includes(slot)) {
                    schedule.selectEvent(slot);
                    schedule.scrollEventIntoView(slot, { animate : true, highlight : true });
                }
            });
        }
    }

    // A bar where the slot would be booked, green or red, in the scrolling foreground of the timeline
    showPreview({ door, startDate, minutes, valid, message }) {
        const
            me           = this,
            { schedule } = me,
            row          = schedule.getRowFor(door);

        if (!row) {
            me.hidePreview();
            return;
        }

        me.preview ??= DomHelper.createElement({
            class    : 'lct-drop-preview',
            parent   : schedule.foregroundCanvas,
            children : [{ tag : 'span', class : 'lct-drop-preview-text' }]
        });

        const
            { preview } = me,
            x           = schedule.getCoordinateFromDate(startDate),
            width       = schedule.timeAxisViewModel.getDistanceForDuration(minutes * minuteMs);

        preview.classList.toggle('lct-drop-invalid', !valid);
        preview.firstChild.textContent = message;

        Object.assign(preview.style, {
            insetInlineStart : `${x}px`,
            insetBlockStart  : `${row.top + schedule.barMargin}px`,
            width            : `${width}px`,
            height           : `${row.height - 2 * schedule.barMargin}px`,
            display          : ''
        });
    }

    hidePreview() {
        if (this.preview) {
            this.preview.style.display = 'none';
        }
    }
}
