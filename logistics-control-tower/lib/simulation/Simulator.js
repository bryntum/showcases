import { Base, Delayable, Events } from '@bryntum/core-enterprise';
import DockPlanner from './DockPlanner.js';
import Random from './Random.js';
import Transport from './Transport.js';
import { hourMs, minuteMs } from '../util/Time.js';

const
    // In transit statuses by minutes of delay
    lateAfter      = 30,
    atRiskAfter    = 10,
    // A slot is tentative while its truck is further out than this, the ETA of a truck hours away is an estimate
    tentativeAfter = 3 * hourMs;

/**
 * Drives the live part of the showcase. Every tick it advances the simulated clock, lets truck ETAs drift, moves reefer
 * temperatures and GPS states (Transport), moves the slot of a truck that will not make it in time (the engine pushes
 * the slots after it, `DockBooking#reschedule()` keeps them out of door downtime), updates the shipment statuses and
 * books docks for the trucks about to arrive.
 *
 * Shipment changes go to the shipment store, slot changes to the Scheduler's event store. The views pick them up from
 * there, see GridSync. The clock holds while a slot is dragged on the schedule or a shipment from the grid. The tick
 * timer is a Delayable one, cleared when the simulator is destroyed.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/Base
 * https://bryntum.com/docs/api/Core/mixin/Events
 * https://bryntum.com/docs/api/Core/mixin/Delayable
 */
export default class Simulator extends Events(Delayable(Base)) {
    static $name = 'Simulator';

    static configurable = {
        /**
         * The simulated current time
         * @prp {Date}
         */
        now : null,

        /**
         * Real milliseconds between ticks
         * @config {Number}
         */
        tickInterval : 300,

        /**
         * Docks are booked automatically for the trucks arriving within this many hours
         * @config {Number}
         */
        autoBookHours : 6,

        /**
         * Seed of the random drift, the same run every time
         * @config {Number}
         */
        seed : 1,

        /**
         * The simulation ends here, the end of the timeline
         * @config {Date}
         */
        endDate : null,

        /**
         * Store of ShipmentModel records
         * @config {Core.data.Store}
         */
        shipmentStore : null,

        /**
         * The dock schedule, its event store holds the slots
         * @config {DockSchedule}
         */
        schedule : null,

        /**
         * The schedule's drop zone for the grid's rows, the clock holds while a shipment is dragged
         * @config {GridDropZone}
         */
        dropZone : null
    };

    construct(config) {
        super.construct(config);

        this.random    = new Random(this.seed);
        this.transport = new Transport(this.random);
    }

    changeNow(now) {
        return new Date(now);
    }

    /**
     * `true` while the simulation plays
     * @property {Boolean}
     */
    get isRunning() {
        return Boolean(this.timer);
    }

    play() {
        const me = this;

        if (!me.timer && me.now < me.endDate) {
            me.timer = me.setInterval(() => me.tick(), me.tickInterval, 'simulation');
            me.trigger('playStateChange', { running : true });
        }
    }

    pause() {
        const me = this;

        if (me.timer) {
            me.clearInterval(me.timer);
            me.timer = null;
            me.trigger('playStateChange', { running : false });
        }
    }

    toggle() {
        if (this.isRunning) {
            this.pause();
        }
        else {
            this.play();
        }
    }

    /**
     * Advances the simulation one tick. Skipped while the previous one is still being scheduled by the engine, or while
     * a slot or a shipment is dragged
     * @returns {Promise}
     */
    async tick() {
        const
            me           = this,
            { schedule } = me;

        if (me.ticking || schedule.isDraggingSlot || me.dropZone?.isDragging) {
            return;
        }

        me.ticking = true;

        try {
            const
                now      = me.now = new Date(Math.min(me.now.getTime() + minuteMs, me.endDate.getTime())),
                shipping = me.shipmentStore.records.filter(shipment => shipment.isInTransit);

            me.transport.drift(shipping);
            me.pushLateSlots();
            me.bookArrivals(3);

            // The engine schedules the moved and the new slots, then the statuses follow the scheduled times
            await schedule.reschedule();

            if (!me.isDestroyed) {
                me.refreshStatuses();
                schedule.now = now;

                /**
                 * Fired after each tick
                 * @event tick
                 * @param {Date} now
                 */
                me.trigger('tick', { now });

                if (now >= me.endDate) {
                    me.pause();
                }
            }
        }
        finally {
            me.ticking = false;
        }
    }

    /**
     * Makes a truck run late: a shipment on time or at risk with a booked slot, the next hours' first, gets 30 to 75
     * minutes of delay. Its slot moves to the new ETA the way a tick moves it, the engine pushes the slots after it,
     * then the statuses follow
     * @returns {Promise<ShipmentModel|null>} The delayed shipment, `null` if none could be
     */
    async simulateDelay() {
        const
            me                                  = this,
            { random, schedule, shipmentStore } = me,
            soon                                = me.now.getTime() + 4 * hourMs,
            // Trucks in transit with a slot have not started unloading
            booked                              = shipmentStore.records.filter(shipment =>
                shipment.isInTransit && shipment.status !== 'late' && schedule.eventStore.getById(shipment.id)),
            upcoming                            = booked.filter(shipment => shipment.eta.getTime() < soon),
            shipment                            = random.pick(upcoming.length ? upcoming : booked);

        if (!shipment) {
            return null;
        }

        me.transport.delay(shipment, Math.max(0, shipment.delayMinutes) + random.int(30, 75));
        me.pushLateSlots();

        await schedule.reschedule();

        if (me.isDestroyed) {
            return null;
        }

        me.refreshStatuses();

        /**
         * Fired when a truck was made late, see simulateDelay()
         * @event shipmentDelay
         * @param {ShipmentModel} shipment
         */
        me.trigger('shipmentDelay', { shipment });

        return shipment;
    }

    // A truck that will not be at the door in time gets its slot moved to its ETA. The door is re-sequenced, a very
    // late truck lets the next ones go first, and the engine pushes the slots after it at the same door
    pushLateSlots() {
        const
            { schedule, shipmentStore } = this,
            doors                       = new Set();

        for (const slot of schedule.eventStore) {
            const shipment = shipmentStore.getById(slot.id);

            if (!slot.isStarted && shipment && shipment.eta > slot.startDate) {
                slot.startDate = new Date(DockPlanner.ceilToFiveMinutes(shipment.eta.getTime()));
                doors.add(slot.resource);
            }
        }

        doors.forEach(door => schedule.chainDoor(door));
    }

    /**
     * The status of a shipment at the passed time
     * @param {ShipmentModel} shipment
     * @param {SlotModel} slot Its dock slot, if booked
     * @param {Date} now
     * @returns {String}
     */
    static statusOf(shipment, slot, now) {
        if (slot?.plannedEnd <= now) {
            return 'done';
        }

        if (slot?.startDate <= now && shipment.eta <= now) {
            return 'unloading';
        }

        if (shipment.eta <= now) {
            return 'yard';
        }

        return shipment.delayMinutes > lateAfter ? 'late' : shipment.delayMinutes > atRiskAfter ? 'at-risk' : 'on-time';
    }

    /**
     * Recalculates the status of all shipments and mirrors it onto their slots, which are tentative while the truck is
     * more than three hours out
     */
    refreshStatuses() {
        const { now, schedule } = this;

        // The doors redraw once for all changed slots, not per slot
        schedule.suspendRefresh();

        try {
            this.mirrorStatuses(now, schedule);
        }
        finally {
            schedule.resumeRefresh(true);
        }
    }

    mirrorStatuses(now, schedule) {
        for (const shipment of this.shipmentStore) {
            const
                slot      = schedule.eventStore.getById(shipment.id),
                status    = Simulator.statusOf(shipment, slot, now),
                tentative = shipment.isInTransit && shipment.eta - now > tentativeAfter;

            if (shipment.status !== status) {
                shipment.set({
                    status,
                    gps : status === 'yard' || status === 'unloading' || status === 'done' ? 'arrived' : shipment.gps
                });
            }

            if (slot) {
                const
                    started = status === 'unloading' || status === 'done',
                    // The shipment's display state on its slot. A slot which has started cannot be moved any more
                    mirror  = {
                        status,
                        tentative,
                        expedited    : shipment.expedited,
                        delayMinutes : shipment.delayMinutes,
                        draggable    : !started,
                        resizable    : !started
                    };

                if (Object.keys(mirror).some(key => slot[key] !== mirror[key])) {
                    slot.set(mirror);
                }
            }
        }
    }

    // Books the trucks arriving soon which have no slot yet, earliest arrival first
    bookArrivals(count) {
        const
            { schedule, now } = this,
            horizon           = now.getTime() + this.autoBookHours * hourMs,
            candidates        = this.shipmentStore.records
                .filter(shipment => !shipment.isFinished && !shipment.onHold && shipment.eta.getTime() < horizon &&
                    !schedule.eventStore.getById(shipment.id))
                .sort((a, b) => a.eta - b.eta)
                .slice(0, count);

        candidates.forEach(shipment => schedule.book(shipment));
    }
}

Simulator.initClass();
