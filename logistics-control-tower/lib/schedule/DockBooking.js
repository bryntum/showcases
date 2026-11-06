import DockPlanner from '../simulation/DockPlanner.js';
import { slotData } from '../simulation/ShipmentData.js';
import { downtimeAt, downtimeIntervals } from './Downtime.js';
import { minuteMs } from '../util/Time.js';

// Moving a slot out of downtime can push the next slot of its door into a window, at most this many rounds
const downtimeRounds = 5;

/**
 * Mixin of the dock schedule booking slots for shipments. The slots of a door are chained with dependencies (finish to
 * start, with the turnaround time as lag), so the scheduling engine pushes every slot to at least the end of the slot
 * before it. Moving a slot, booking or unbooking one re-sequences its door, `reschedule()` then schedules the change
 * and keeps the slots out of door downtime.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ProjectModelEnterprise
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/DependencyModelEnterprise
 */
export default Target => class DockBooking extends Target {
    static $name = 'DockBooking';

    //region Door sequencing

    /**
     * Rebuilds the dependency chain of a door from its slots in start order. Only the dependencies that differ are
     * touched
     * @param {DockModel} door
     */
    chainDoor(door) {
        if (!door) {
            return;
        }

        const
            { dependencyStore } = this,
            slots               = door.events.slice()
                .sort((a, b) => a.startDate - b.startDate || a.id.localeCompare(b.id)),
            wanted              = new Set(slots.slice(1).map((slot, index) => `${slots[index].id}>${slot.id}`)),
            // The dependencies of this door's slots only, a dependency between two of them is listed by both
            current             = new Set(slots.flatMap(slot => slot.dependencies)),
            toRemove            = [];

        for (const dependency of current) {
            // Keep the ones still wanted, what is left in `wanted` is added below
            if (!wanted.delete(`${dependency.fromEvent?.id}>${dependency.toEvent?.id}`)) {
                toRemove.push(dependency);
            }
        }

        dependencyStore.remove(toRemove);

        dependencyStore.add([...wanted].map(id => {
            const [fromEvent, toEvent] = id.split('>');

            return { id, fromEvent, toEvent, lag : DockPlanner.TURNAROUND, lagUnit : 'minute' };
        }));
    }

    /**
     * Schedules the changes with the engine, after every booking, move, resize and simulation tick. The engine does not
     * know the doors' downtime, a slot it pushed into a window is moved to right after it (with the door's turnaround,
     * as booking does), and the engine pushes the slots after it again. Not done with resource calendars, which would
     * stretch a slot over the window instead of moving it
     * @returns {Promise}
     */
    async reschedule() {
        const me = this;

        await me.project.commitAsync();

        for (let round = 0; round < downtimeRounds && !me.isDestroyed; round++) {
            const doors = new Set();

            for (const slot of me.eventStore) {
                const
                    door  = slot.resource,
                    start = slot.startDate.getTime();

                if (door && !slot.isStarted && downtimeAt(door, start, slot.plannedEnd)) {
                    const after = DockPlanner.earliestGap(downtimeIntervals(door).sort((a, b) => a.start - b.start),
                        start, slot.plannedEnd - start);

                    slot.startDate = new Date(DockPlanner.ceilToFiveMinutes(after));
                    doors.add(door);
                }
            }

            if (!doors.size) {
                return;
            }

            doors.forEach(door => me.chainDoor(door));
            await me.project.commitAsync();
        }
    }

    //endregion

    //region Booking

    // Sorted busy intervals of a door, its slots (optionally but one) and its downtime
    getBusy(door, ignoreId) {
        return door.events
            .filter(slot => slot.id !== ignoreId)
            .map(slot => ({ start : slot.startDate.getTime(), end : slot.plannedEnd }))
            .concat(downtimeIntervals(door))
            .sort((a, b) => a.start - b.start);
    }

    // Earliest moment a slot for the shipment may start: when the truck is there, and not in the past
    earliestStart(shipment) {
        return DockPlanner.ceilToFiveMinutes(Math.max(this.now.getTime(), shipment.eta.getTime()));
    }

    /**
     * Books the first free slot for a shipment at a door able to take it
     * @param {ShipmentModel} shipment
     * @returns {SlotModel|null} The new slot, `null` if it was already booked
     */
    book(shipment) {
        const me = this;

        if (me.eventStore.getById(shipment.id)) {
            return null;
        }

        const slot = DockPlanner.findSlot({
            doors    : me.resourceStore.records,
            getBusy  : door => me.getBusy(door),
            loadType : shipment.loadType,
            from     : me.earliestStart(shipment),
            duration : DockPlanner.unloadMinutes(shipment.pallets, shipment.loadType) * minuteMs
        });

        return slot && me.bookAt(shipment, slot.door, new Date(slot.start));
    }

    /**
     * Books a slot for a shipment at the passed door and time, or moves its slot there if it is booked already
     * @param {ShipmentModel} shipment
     * @param {DockModel} door
     * @param {Date} startDate
     * @returns {SlotModel|null} The slot, `null` when unloading has started and it can no longer move
     */
    bookAt(shipment, door, startDate) {
        const
            me       = this,
            existing = me.eventStore.getById(shipment.id);

        // A truck being unloaded stays where it is
        if (existing?.isStarted) {
            return null;
        }

        shipment.onHold = false;

        if (existing) {
            const oldDoor = existing.resource;

            // Kept at its new time, also when that is earlier than the one it was booked at
            existing.set({ startDate, constraintDate : startDate });

            if (oldDoor !== door) {
                existing.reassign(oldDoor, door);
                me.chainDoor(oldDoor);
            }

            me.chainDoor(door);

            return existing;
        }

        const [slot] = me.eventStore.add({ ...slotData(shipment, startDate), status : shipment.status });

        slot.assign(door);
        me.chainDoor(door);

        return slot;
    }

    /**
     * Removes the slot of a shipment, unless unloading has started. The simulation does not book it again
     * @param {String} shipmentId
     */
    unbook(shipmentId) {
        const
            me   = this,
            slot = me.eventStore.getById(shipmentId);

        if (slot && !slot.isStarted) {
            const door = slot.resource;

            me.eventStore.remove(slot);
            me.chainDoor(door);
            me.shipmentStore.getById(shipmentId)?.set('onHold', true);
        }
    }

    // The door is chained in start order: the slots not yet unloading that would keep a slot from starting at `start`
    // move to `end`, after it, and the chain pushes the ones after them. The slots being unloaded stay
    makeRoom(door, start, end, ignoreId) {
        const gap = DockPlanner.TURNAROUND * minuteMs;

        for (const slot of door.events) {
            if (slot.id !== ignoreId && !slot.isStarted && slot.startDate.getTime() <= start &&
                slot.plannedEnd + gap > start) {
                slot.startDate = new Date(end);
            }
        }
    }

    /**
     * Gives a shipment the earliest possible slot: right after the truck unloading at the best door, clear of its
     * downtime. It jumps in front of the trucks not yet unloading there, the engine pushes them back
     * @param {String} shipmentId
     * @returns {SlotModel|null}
     */
    expedite(shipmentId) {
        const
            me       = this,
            shipment = me.shipmentStore.getById(shipmentId),
            existing = me.eventStore.getById(shipmentId);

        if (!shipment || existing?.isStarted || shipment.isFinished) {
            return null;
        }

        const
            from     = me.earliestStart(shipment),
            gap      = DockPlanner.TURNAROUND * minuteMs,
            duration = DockPlanner.unloadMinutes(shipment.pallets, shipment.loadType) * minuteMs;

        let best = null;

        for (const door of me.resourceStore) {
            if (door.accepts(shipment.loadType)) {
                // Only the slots being unloaded and the downtime block the door, the other slots are pushed back
                const
                    unloadedBy = Math.max(from, ...door.events.filter(slot => slot.isStarted)
                        .map(slot => slot.plannedEnd + gap)),
                    start      = DockPlanner.earliestGap(downtimeIntervals(door).sort((a, b) => a.start - b.start),
                        unloadedBy, duration),
                    score      = start + DockPlanner.doorPenalty(door.capability, shipment.loadType);

                if (!best || score < best.score) {
                    best = { door, start, score };
                }
            }
        }

        // No door takes this load type
        if (!best) {
            return null;
        }

        const start = DockPlanner.ceilToFiveMinutes(best.start);

        me.makeRoom(best.door, start, start + duration + gap, shipmentId);
        shipment.expedited = true;

        const slot = me.bookAt(shipment, best.door, new Date(start));

        if (slot) {
            slot.expedited = true;
        }

        return slot;
    }

    //endregion
};
