import { DomHelper } from '@bryntum/core-enterprise';
import DockPlanner from '../simulation/DockPlanner.js';
import { minuteMs } from '../util/Time.js';
import { shipmentNumber } from '../util/Status.js';
import { downtimeAt } from '../schedule/Downtime.js';

/**
 * Makes the dock schedule's timeline a drop zone for the rows of the shipment grid (AG Grid's `addRowDropZone`). While
 * a shipment is dragged over a door, a preview bar shows the slot it would get, or why the door can not take it.
 * Dropping it books the slot (or moves its slot there), the engine pushes the slots after it. While a shipment is
 * dragged `isDragging` is set, the simulation holds its clock.
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

        /**
         * `true` while a shipment row is dragged, over the grid or over the dock schedule
         * @property {Boolean}
         */
        me.isDragging = false;

        me.dropZone = {
            getContainer : () => schedule.timeAxisSubGridElement,
            onDragEnter  : params => me.onDragging(params),
            onDragging   : params => me.onDragging(params),
            onDragLeave  : () => me.onDragEnd(),
            onDragStop   : params => me.onDragStop(params),
            onDragCancel : () => me.onDragEnd()
        };

        gridApi.addRowDropZone(me.dropZone);

        // The drag starts over the grid, which reports it until the row leaves it, is dropped or the drag is cancelled
        me.gridListeners = {
            rowDragEnter  : () => me.isDragging = true,
            rowDragLeave  : () => me.isDragging = false,
            rowDragEnd    : () => me.isDragging = false,
            rowDragCancel : () => me.isDragging = false
        };

        Object.entries(me.gridListeners).forEach(([name, fn]) => gridApi.addEventListener(name, fn));
    }

    destroy() {
        const { gridApi, gridListeners, dropZone } = this;

        if (!gridApi.isDestroyed()) {
            gridApi.removeRowDropZone(dropZone);
            Object.entries(gridListeners).forEach(([name, fn]) => gridApi.removeEventListener(name, fn));
        }

        this.preview?.remove();
        this.preview = this.isDragging = null;
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
            message   = this.invalidReason(shipment, door, startDate, minutes);

        return {
            shipment,
            door,
            startDate,
            minutes,
            valid   : !message,
            // Drop 10151, the slot's start reads off the axis
            message : message ?? `Drop ${shipmentNumber(shipment.ref)}`
        };
    }

    /**
     * Why the shipment can not go to the door at the passed time, nothing when it can
     * @param {ShipmentModel} shipment
     * @param {DockModel} door
     * @param {Date} startDate
     * @param {Number} minutes The unloading time
     * @returns {String|null}
     */
    invalidReason(shipment, door, startDate, minutes) {
        const downtime = downtimeAt(door, startDate, startDate.getTime() + minutes * minuteMs);

        if (shipment.isFinished) {
            return `${shipment.ref} is unloaded`;
        }

        if (this.schedule.eventStore.getById(shipment.id)?.isStarted) {
            return `${shipment.ref} is being unloaded`;
        }

        if (!door.accepts(shipment.loadType)) {
            return `${door.name} cannot take ${shipment.loadType} loads`;
        }

        return downtime ? `${door.name} is unavailable, ${downtime.name.toLowerCase()}` : null;
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

        this.isDragging = true;

        if (target) {
            this.showPreview(target);
        }
        else {
            this.hidePreview();
        }
    }

    // Left the schedule, cancelled or dropped
    onDragEnd() {
        this.isDragging = false;
        this.hidePreview();
    }

    async onDragStop(params) {
        const
            me           = this,
            { schedule } = me,
            target       = me.resolveTarget(params);

        me.onDragEnd();

        const slot = target?.valid && schedule.bookAt(target.shipment, target.door, target.startDate);

        if (slot) {
            // Revealed where the engine scheduled it
            await schedule.reschedule();
            schedule.revealSlot(slot);
        }
    }

    // A dashed box where the slot would be booked, blue or red, in the scrolling foreground of the timeline
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
