/**
 * A small seeded pseudo random number generator (mulberry32). Seeding it makes the generated data and the simulation
 * reproducible: every load starts in the same state.
 */
export default class Random {
    constructor(seed = 1) {
        this.state = seed >>> 0;
    }

    // A number in the range [0, 1)
    next() {
        // Wrapped to 32 bits, the state stays a small integer however long the simulation runs
        this.state = (this.state + 0x6D2B79F5) | 0;

        let t = this.state;

        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);

        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    between(min, max) {
        return min + this.next() * (max - min);
    }

    // An integer in the range [min, max]
    int(min, max) {
        return Math.floor(this.between(min, max + 1));
    }

    pick(array) {
        return array[Math.floor(this.next() * array.length)];
    }

    chance(probability) {
        return this.next() < probability;
    }

    // An approximately normally distributed number (sum of four uniform numbers, scaled to a standard deviation of 1)
    normal(mean = 0, deviation = 1) {
        return mean + deviation * (this.next() + this.next() + this.next() + this.next() - 2) * Math.sqrt(3);
    }
}
