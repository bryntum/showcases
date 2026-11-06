import { minuteMs } from '../util/Time.js';

// A dry load on a cold store door counts as starting this much later, booking, expediting and the generated data
// alike: the door is kept free for the reefer loads only it can take, unless it is free much earlier
const specialDoorPenalty = 45 * minuteMs;

/**
 * Pure slot finding logic, shared by the data generator (plain objects) and the live scheduler (records). Works on
 * timestamps in milliseconds.
 */
export default class DockPlanner {
    // Minutes a door needs between two trucks
    static TURNAROUND = 10;

    // Dry goods fit any door, temperature controlled loads need a door equipped for them
    static accepts(capability, loadType) {
        return loadType === 'dry' || capability === loadType;
    }

    // Unloading time in minutes, rounded up to 5 minutes: docking, the pallets, then the cold chain checks of a reefer
    static unloadMinutes(pallets, loadType) {
        const minutes = 10 + pallets * 1.5 + (loadType === 'reefer' ? 8 : 0);

        return Math.ceil(minutes / 5) * 5;
    }

    /**
     * The preference penalty in ms of a door for a load, `specialDoorPenalty` for a load the door is not built for
     * @param {String} capability
     * @param {String} loadType
     * @returns {Number}
     */
    static doorPenalty(capability, loadType) {
        return capability === loadType ? 0 : specialDoorPenalty;
    }

    static ceilToFiveMinutes(time) {
        const step = 5 * minuteMs;

        return Math.ceil(time / step) * step;
    }

    /**
     * Earliest start at or after `from` where a slot of `duration` ms fits between the busy intervals, keeping the
     * turnaround gap on both sides.
     * @param {Object[]} intervals Busy `{ start, end }` intervals sorted by start
     * @param {Number} from
     * @param {Number} duration
     * @returns {Number}
     */
    static earliestGap(intervals, from, duration) {
        const gap = DockPlanner.TURNAROUND * minuteMs;

        let start = from;

        for (const { start : busyStart, end : busyEnd } of intervals) {
            if (busyEnd + gap <= start) {
                continue;
            }

            if (start + duration + gap <= busyStart) {
                break;
            }

            start = Math.max(start, busyEnd + gap);
        }

        return start;
    }

    /**
     * Finds the best door and start for a load: the earliest start, a dry load on a reefer door only when that is
     * much earlier
     * @param {Object} options
     * @param {Object[]} options.doors Doors (anything with `capability`)
     * @param {Function} options.getBusy Returns the sorted busy intervals of a door
     * @param {String} options.loadType
     * @param {Number} options.from Earliest allowed start
     * @param {Number} options.duration Slot duration in ms
     * @returns {{door : Object, start : Number}|null} `null` when no door accepts the load type
     */
    static findSlot({ doors, getBusy, loadType, from, duration }) {
        let best = null;

        for (const door of doors) {
            if (DockPlanner.accepts(door.capability, loadType)) {
                const
                    start = DockPlanner.earliestGap(getBusy(door), from, duration),
                    score = start + DockPlanner.doorPenalty(door.capability, loadType);

                if (!best || score < best.score) {
                    best = { door, start, score };
                }
            }
        }

        return best && { door : best.door, start : best.start };
    }
}
