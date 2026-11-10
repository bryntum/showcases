/**
 * The geography of Skarv Bank: 60 turbines in six staggered rows of ten (A in the north to F in the south), the
 * substation between them and the port south of row F, west of column 1. All transit times come from it:
 *
 * - Port to turbine, the same back: a base time plus a step per row and column away from the port
 * - Turbine to turbine: a step per row and column apart, moving and pushing on included
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
    // The first sailing of a day, minutes after the working day starts (`site.dayStart`, DispatchState#firstSailing):
    // where a day's planned trips start and where work moved to the next day goes
    firstSailing = 30,
    // The map: the farm's rows turn a little against north, as real layouts follow the prevailing wind
    mapAngle    = -9 * Math.PI / 180,
    mapCentre   = { x : 232, y : 160 },
    mapPort     = { x : -6, y : 290 };

// The n-th turbine (1 based), "T-07"
function turbineId(n) {
    return `T-${String(n).padStart(2, '0')}`;
}

export const turbineIds = Array.from({ length : rows * cols }, (_, i) => turbineId(i + 1));

// The row and column of a turbine (0 based). The substation sits between rows C and D, columns 5 and 6
function gridOf(id) {
    if (id === substation) {
        return { r : 2.5, c : 4.5 };
    }

    const n = Number(id.slice(2)) - 1;

    return { r : Math.floor(n / cols), c : n % cols };
}

export function rowName(id) {
    return `Row ${rowLetters[Math.floor(gridOf(id).r)]}`;
}

// Minutes from the port to a turbine, the same back, `mode` is `vessel` or `heli`
export function portMinutes(id, mode) {
    const { r, c } = gridOf(id);

    return Math.round(portBase[mode] + portStep[mode] * (c - r + rows - 1));
}

// Minutes from one turbine to the next, `mode` is `vessel` or `heli`
export function hopMinutes(from, to, mode) {
    const
        a = gridOf(from),
        b = gridOf(to);

    return Math.round(hopStep[mode] * (Math.abs(a.r - b.r) + Math.abs(a.c - b.c)));
}

// `{ x, y }` of a turbine or the substation, in the map's SVG units
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
