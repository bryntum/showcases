/**
 * Keeps AG Grid in sync with the Bryntum stores, the sources of truth: the shipment store for transport state and the
 * Scheduler's event store for the dock slots.
 *
 * - Changes are collected per shipment id and sent to AG Grid in one `applyTransactionAsync` per microtask
 *   (`queueMicrotask`, not `requestAnimationFrame`, which pauses in a hidden tab and would let the queue grow)
 * - Selecting a row selects its slot on the dock schedule and scrolls it into view, and the other way round
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/data-update-high-frequency/
 * https://bryntum.com/products/scheduler/docs/api/Core/data/Store#event-change
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/mixin/SchedulerEventSelection#event-eventSelectionChange
 */
export default class GridSync {
    /**
     * @param {Object} options
     * @param {Object} options.gridApi AG Grid API
     * @param {Core.data.Store} options.shipmentStore
     * @param {DockSchedule} options.schedule
     * @param {Function} [options.onFlush] Called after each batch is sent to the grid
     */
    constructor({ gridApi, shipmentStore, schedule, onFlush }) {
        const me = this;

        Object.assign(me, { gridApi, shipmentStore, schedule, onFlush });

        // Ids of the shipments to send to the grid
        me.dirty   = new Set();
        me.pending = false;

        const queue = ({ records = [], record }) => me.queue(record ? [record] : records);

        me.onGridRowSelected = event => me.onRowSelected(event);

        // The functions `on()` returns detach the listeners again, see destroy()
        me.detachers = [
            shipmentStore.on({ update : queue, thisObj : me }),
            // Slots added, removed or rescheduled (by the user, the simulation or the engine), and moved between doors
            schedule.eventStore.on({ add : queue, remove : queue, update : queue, thisObj : me }),
            schedule.assignmentStore.on({
                change  : ({ records = [] }) => me.queue(records.map(assignment => assignment.event).filter(Boolean)),
                thisObj : me
            }),
            // Selection, both ways
            schedule.on({ eventSelectionChange : 'onSlotSelectionChange', thisObj : me })
        ];

        gridApi.addEventListener('rowSelected', me.onGridRowSelected);
    }

    destroy() {
        const me = this;

        me.detachers.forEach(detach => detach());
        me.dirty.clear();

        if (!me.gridApi.isDestroyed()) {
            me.gridApi.removeEventListener('rowSelected', me.onGridRowSelected);
        }

        me.isDestroyed = true;
    }

    /**
     * Queues shipments (or slots, which share their ids) for the next batch
     * @param {Core.data.Model[]} records
     */
    queue(records) {
        const me = this;

        records.forEach(record => me.dirty.add(record.id));

        if (me.dirty.size && !me.pending) {
            me.pending = true;
            queueMicrotask(() => me.flush());
        }
    }

    flush() {
        const
            me                                 = this,
            { dirty, shipmentStore, schedule } = me,
            update                             = [];

        me.pending = false;

        if (me.isDestroyed) {
            return;
        }

        dirty.forEach(id => {
            const shipment = shipmentStore.getById(id);

            if (shipment) {
                update.push(shipment.toRow(schedule.eventStore.getById(id)));
            }
        });

        dirty.clear();

        if (update.length && !me.gridApi.isDestroyed()) {
            me.gridApi.applyTransactionAsync({ update });
            me.onFlush?.();
        }
    }

    //region Selection

    // A row selected in the grid selects its slot and scrolls it into view, a row deselected deselects its slot
    onRowSelected({ node, source }) {
        const me = this;

        if (me.syncingSelection || source === 'api') {
            return;
        }

        const
            { schedule } = me,
            slot         = node.data && schedule.eventStore.getById(node.data.id),
            selected     = node.isSelected();

        // Selecting another row deselects this one, possibly after its slot was selected
        if (!selected && !(slot && schedule.isEventSelected(slot))) {
            return;
        }

        me.syncingSelection = true;

        if (selected && slot) {
            schedule.revealSlot(slot);
        }
        else {
            schedule.clearEventSelection();
        }

        me.syncingSelection = false;
    }

    // A slot selected on the schedule selects its row, expands its group and scrolls it into view, no slot selected
    // deselects the rows
    onSlotSelectionChange({ selection }) {
        const
            me          = this,
            { gridApi } = me,
            slot        = selection[0],
            node        = slot && gridApi.getRowNode(slot.id);

        // A slot whose row the grid does not have (yet) leaves the grid's selection as is
        if (me.syncingSelection || (slot && !node)) {
            return;
        }

        me.syncingSelection = true;

        if (node) {
            for (let parent = node.parent; parent && parent.level >= 0; parent = parent.parent) {
                parent.setExpanded(true);
            }

            node.setSelected(true, true, 'api');
            gridApi.ensureNodeVisible(node, 'middle');
            gridApi.flashCells({ rowNodes : [node] });
        }
        else {
            gridApi.deselectAll('all', 'api');
        }

        me.syncingSelection = false;
    }

    //endregion
}
