/**
 * The geography of Skarv Bank: 60 turbines in six staggered rows of ten, the offshore substation between them, and the
 * port to the south west. Transit times follow from it, so the trips, a stop added by a drop and the turbines a trip
 * can still reach all come from one model:
 *
 * - From the port to a turbine and back: a base time plus a step per row and column away from the port. Rows run from
 *   A in the north to F in the south, the port is south of row F and west of column 1
 * - Between two turbines: a step per row and column apart, moving and pushing on included
 *
 * Helicopters fly the same geography faster.
 */

export const
    rows        = 6,
    cols        = 10,
    rowLetters  = 'ABCDEF',
    substation  = 'OSS',
    // Minutes, per mode of transport
    portBase    = { vessel : 50, heli : 18 },
    portStep    = { vessel : 4, heli : 1 },
    hopStep     = { vessel : 10, heli : 4 },
    // The map: the farm's rows turn a little against north, as real layouts follow the prevailing wind
    mapAngle    = -9 * Math.PI / 180,
    mapCentre   = { x : 232, y : 160 },
    mapPort     = { x : -6, y : 290 };

/**
 * The ID of the n-th turbine, "T-07"
 * @param {Number} n 1 to 60
 * @returns {String}
 */
export function turbineId(n) {
    return `T-${String(n).padStart(2, '0')}`;
}

/**
 * All turbine IDs, T-01 to T-60
 * @type {String[]}
 */
export const turbineIds = Array.from({ length : rows * cols }, (_, i) => turbineId(i + 1));

/**
 * The row and column of a turbine (0 based). The substation sits between rows C and D, columns 5 and 6
 * @param {String} id
 * @returns {{r: Number, c: Number}}
 */
export function gridOf(id) {
    if (id === substation) {
        return { r : 2.5, c : 4.5 };
    }

    const n = Number(id.slice(2)) - 1;

    return { r : Math.floor(n / cols), c : n % cols };
}

/**
 * "Row C" for a turbine
 * @param {String} id
 * @returns {String}
 */
export function rowName(id) {
    return `Row ${rowLetters[Math.floor(gridOf(id).r)]}`;
}

/**
 * Minutes from the port to a turbine, the same back
 * @param {String} id
 * @param {String} mode `vessel` or `heli`
 * @returns {Number}
 */
export function portMinutes(id, mode) {
    const { r, c } = gridOf(id);

    return Math.round(portBase[mode] + portStep[mode] * (c - r + rows - 1));
}

/**
 * Minutes from one turbine to the next
 * @param {String} from
 * @param {String} to
 * @param {String} mode `vessel` or `heli`
 * @returns {Number}
 */
export function hopMinutes(from, to, mode) {
    const
        a = gridOf(from),
        b = gridOf(to);

    return Math.round(hopStep[mode] * (Math.abs(a.r - b.r) + Math.abs(a.c - b.c)));
}

/**
 * Map position of a turbine or the substation, in the map's SVG units
 * @param {String} id
 * @returns {{x: Number, y: Number}}
 */
export function mapXY(id) {
    const
        { r, c } = gridOf(id),
        dx       = 112 + c * 27 + (Math.floor(r) % 2) * 13.5 - mapCentre.x,
        dy       = 62 + r * 38 - mapCentre.y;

    return {
        x : mapCentre.x + dx * Math.cos(mapAngle) - dy * Math.sin(mapAngle),
        y : mapCentre.y + dx * Math.sin(mapAngle) + dy * Math.cos(mapAngle)
    };
}
