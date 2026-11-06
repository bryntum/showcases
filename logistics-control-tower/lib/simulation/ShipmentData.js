import DockPlanner from './DockPlanner.js';
import Random from './Random.js';
import { hourMs, minuteMs } from '../util/Time.js';

/**
 * Generates a reproducible data set from the network (the load mix, carriers, origins and dock doors, see
 * data/network.json) and a seed: the inbound shipments spread over the days, and the dock slots booked so far, chained
 * per door with dependencies so the scheduling engine pushes the later slots when one runs late.
 */
export default class ShipmentData {
    /**
     * @param {Object} network The parsed data/network.json
     * @param {Object} [options]
     * @param {Number} [options.bookHours] Hours after the site's `now` that are booked up front
     * @returns {Object} `{ shipments, docks, slots, assignments, dependencies }`, plain data objects
     */
    static generate({ site, loads, carriers, origins, docks }, { bookHours = 14 } = {}) {
        const
            random    = new Random(site.seed),
            start     = new Date(site.startDate).getTime(),
            now       = new Date(site.now).getTime(),
            // Planned arrivals on the 5 minute grid, most of them in daytime
            plannedAt = Array.from({ length : site.shipments },
                () => ShipmentData.plannedArrival(random, start, site.days))
                .sort((a, b) => a - b),
            shipments = plannedAt.map((planned, index) => ShipmentData.createShipment({
                random, index, planned, now, loads, carriers, origins
            }));

        return {
            shipments,
            docks : docks.map(dock => ({ ...dock })),
            ...ShipmentData.bookInitialSlots(shipments, docks, now + bookHours * hourMs)
        };
    }

    // A day, then an hour weighted towards the day shifts (04:00 - 22:00 for 75% of the trucks)
    static plannedArrival(random, start, days) {
        const
            day     = random.int(0, days - 1),
            minutes = random.chance(0.75) ? random.between(4 * 60, 22 * 60) : random.between(0, 24 * 60);

        return start + day * 24 * hourMs + Math.round(minutes / 5) * 5 * minuteMs;
    }

    static createShipment({ random, index, planned, now, loads, carriers, origins }) {
        const
            load     = ShipmentData.pickLoad(random, loads),
            loadType = load.type,
            carrier  = random.pick(carriers),
            pallets  = random.int(...load.pallets),
            // Most trucks are roughly on time, some are hit by an incident
            delay    = Math.max(-15, Math.round(random.normal(3, 7)) + (random.chance(0.08) ? random.int(25, 70) : 0)),
            history  = [delay],
            setpoint = loadType === 'reefer' ? random.pick([-18, 2, 4]) : null,
            eta      = planned + delay * minuteMs,
            ref      = `SHP-${10001 + index}`;

        // ETA drift history, walked backwards from the current delay
        for (let i = 0; i < 15; i++) {
            history.unshift(Math.round(history[0] - random.normal(0.6, 2.2)));
        }

        return {
            id           : ref,
            ref,
            carrier      : carrier.name,
            carrierCode  : carrier.code,
            carrierColor : carrier.color,
            origin       : random.pick(origins),
            loadType,
            pallets,
            plannedEta   : new Date(planned),
            eta          : new Date(eta),
            // Unloading must be complete within 90 minutes of the planned arrival
            dueBy        : new Date(planned + 90 * minuteMs),
            delayMinutes : delay,
            etaHistory   : history,
            setpoint,
            temperature  : setpoint === null ? null : Math.round((setpoint + random.normal(0, 0.5)) * 10) / 10,
            gps          : eta <= now ? 'arrived' : random.chance(0.05) ? 'stale' : 'live',
            expedited    : random.chance(0.03)
        };
    }

    // A load type by its share of the trucks (network.json `loads`), the last one takes what is left
    static pickLoad(random, loads) {
        let roll = random.next();

        return loads.find(load => (roll -= load.share) < 0) ?? loads.at(-1);
    }

    // Greedy first come, first served planning of the shipments planned to arrive before `bookUntil`
    static bookInitialSlots(shipments, docks, bookUntil) {
        const
            busy         = new Map(docks.map(dock => [dock, []])),
            slots        = [],
            assignments  = [],
            dependencies = [];

        for (const shipment of shipments) {
            const
                { id, ref, loadType, pallets, plannedEta, eta } = shipment,
                minutes                                         = DockPlanner.unloadMinutes(pallets, loadType),
                from                                            = DockPlanner.ceilToFiveMinutes(eta.getTime());

            if (plannedEta.getTime() >= bookUntil) {
                break;
            }

            const slot = DockPlanner.findSlot({
                doors    : docks,
                getBusy  : door => busy.get(door),
                duration : minutes * minuteMs,
                loadType,
                from
            });

            // No door free within four hours of arrival, left in the backlog for the dispatcher
            if (slot && slot.start - from <= 4 * hourMs) {
                const intervals = busy.get(slot.door);

                intervals.push({ start : slot.start, end : slot.start + minutes * minuteMs, id });
                intervals.sort((a, b) => a.start - b.start);

                slots.push({
                    id,
                    name           : ref,
                    startDate      : new Date(slot.start),
                    // Kept at its booked time, unless the slot before it pushes it later
                    constraintType : 'startnoearlierthan',
                    constraintDate : new Date(slot.start),
                    duration       : minutes,
                    durationUnit   : 'minute',
                    carrierCode    : shipment.carrierCode,
                    carrierColor   : shipment.carrierColor,
                    loadType,
                    pallets,
                    dueBy          : shipment.dueBy,
                    expedited      : shipment.expedited
                });

                assignments.push({ id : `a-${id}`, event : id, resource : slot.door.id });
            }
        }

        // Chain the slots of each door, so a late truck pushes the trucks after it
        for (const intervals of busy.values()) {
            for (let i = 1; i < intervals.length; i++) {
                dependencies.push({
                    id        : `${intervals[i - 1].id}>${intervals[i].id}`,
                    fromEvent : intervals[i - 1].id,
                    toEvent   : intervals[i].id,
                    lag       : DockPlanner.TURNAROUND,
                    lagUnit   : 'minute'
                });
            }
        }

        return { slots, assignments, dependencies };
    }
}
