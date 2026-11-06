import { minuteMs } from '../util/Time.js';

// Delay values kept for the sparkline
const historyLength = 16;

/**
 * The trucks on the road, for the Simulator: their ETAs drift, reefer temperatures wander, GPS signals drop. Works on
 * the shipment records only, the Simulator moves the dock slots that follow from it.
 */
export default class Transport {
    /**
     * @param {Random} random The simulation's seeded generator, shared so a run stays reproducible
     */
    constructor(random) {
        this.random = random;
    }

    /**
     * One tick of drift for the shipments in transit. More happens per tick when time runs faster
     * @param {ShipmentModel[]} shipping
     * @param {Number} speed Simulated minutes per tick
     */
    drift(shipping, speed) {
        this.driftEtas(shipping, Math.min(80, 20 * speed));
        this.driftTemperatures(shipping.filter(shipment => shipment.loadType === 'reefer'), 6);
        this.flickerGps(shipping, 2);
    }

    // Sets the delay of a shipment, its ETA and the sparkline history follow
    delay(shipment, minutes) {
        const delay = Math.min(240, Math.max(-20, minutes));

        shipment.set({
            delayMinutes : delay,
            eta          : new Date(shipment.plannedEta.getTime() + delay * minuteMs),
            etaHistory   : [...shipment.etaHistory.slice(1 - historyLength), delay]
        });
    }

    driftEtas(shipping, count) {
        const { random } = this;

        for (let i = 0; i < count && shipping.length; i++) {
            const
                shipment = random.pick(shipping),
                // Drift slightly late on average, now and then an incident (traffic, border control) adds a lot
                drift    = Math.round(random.normal(0.3, 1.4)) + (random.chance(0.015) ? random.int(12, 40) : 0);

            if (drift) {
                this.delay(shipment, shipment.delayMinutes + drift);
            }
        }
    }

    driftTemperatures(reefers, count) {
        const { random } = this;

        for (let i = 0; i < count && reefers.length; i++) {
            const
                shipment                  = random.pick(reefers),
                { setpoint, temperature } = shipment,
                // Pulled back towards the set point, with an occasional excursion (door opened, unit fault)
                excursion                 = random.chance(0.02) ? random.between(2.5, 5) : 0,
                next                      = temperature + (setpoint - temperature) * 0.2 + random.normal(0, 0.3) +
                    excursion;

            shipment.temperature = Math.round(next * 10) / 10;
        }
    }

    flickerGps(shipping, count) {
        const
            { random } = this,
            next       = {
                live  : () => random.chance(0.3) ? 'stale' : 'live',
                stale : () => random.chance(0.6) ? 'live' : random.chance(0.4) ? 'lost' : 'stale',
                lost  : () => random.chance(0.5) ? 'live' : 'lost'
            };

        for (let i = 0; i < count && shipping.length; i++) {
            const shipment = random.pick(shipping);

            shipment.gps = next[shipment.gps]?.() ?? 'live';
        }
    }
}
