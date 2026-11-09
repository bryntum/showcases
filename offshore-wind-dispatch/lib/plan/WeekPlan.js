import { closingTimes } from './Weather.js';
import { firstSailing, hopMinutes, substation, turbineIds } from './Farm.js';
import { tripEnd } from './Planner.js';
import { hhmm } from '../util/Time.js';

/**
 * The week, today and the six days after it: a small deterministic generator of the forecast and the plan of trips of
 * each day. Seeded, so the week is the same on every load and in the tests; nothing is random at runtime.
 *
 * - Today is data/farm.json as it is: its forecasts, its trips, its jobs
 * - The other days get an hourly forecast (06:00 to 18:00) from a few points of the weather story below, with a little
 *   seeded noise that never crosses a limit, and the jobs due across the week
 * - Each vessel whose window is open gets one trip a day from port, packed with the jobs due soonest, the nearest next,
 *   while it is back in port 15 minutes before its window closes and its teams fit its seats. Crew transfer vessels
 *   take one team, the SWATH two, a helicopter one hoist job. The standby vessel, and the odd vessel by the seed, stay
 *   free: workable cells left for a team the dispatcher drops there
 */

const
    // Week 46
    seed      = 46,
    minutes   = { day : 24 * 60, margin : 15 },
    // The weather story of Tuesday to Sunday: points [hour, value] the hourly values are drawn through
    weather   = [
        // Tuesday: no CTV, the SWATH until 13, wind over the helicopters' limit
        { hs : [[6, 1.8], [12, 1.92], [13, 2.08], [18, 2.6]], wind : [[6, 22], [12, 26], [18, 24]] },
        // Wednesday: go until 15
        { hs : [[6, 1.1], [14, 1.42], [15, 1.58], [18, 1.6]], wind : [[6, 9], [13, 14], [18, 12]] },
        // Thursday and Friday: go all day, the best days
        { hs : [[6, 0.7], [13, 1.1], [18, 0.9]], wind : [[6, 8], [12, 11], [18, 9]] },
        { hs : [[6, 0.8], [15, 1.3], [18, 1.2]], wind : [[6, 9], [14, 12], [18, 10]] },
        // Saturday: go until 11, the SWATH until 14
        {
            hs   : [[6, 1.3], [10, 1.42], [11, 1.58], [13, 1.92], [14, 2.08], [18, 2.2]],
            wind : [[6, 12], [15, 17], [18, 16]]
        },
        // Sunday: no-go for all
        { hs : [[6, 2.1], [12, 2.6], [18, 3.0]], wind : [[6, 22], [12, 24], [18, 23]] }
    ],
    // The work due this week, beside today's jobs
    kinds     = [
        { job : 'Annual service', type : 'Service', minutes : 180 },
        { job : 'Gearbox oil sampling', type : 'Service', minutes : 60 },
        { job : 'Pitch bearing inspection', type : 'Inspect', minutes : 90 },
        { job : 'Yaw brake pads', type : 'Service', minutes : 120 },
        { job : 'Tower flange inspection', type : 'Inspect', minutes : 90 },
        { job : 'Cooling pump swap', type : 'Repair', minutes : 150 },
        { job : 'Blade inspection from the hoist', type : 'Inspect', minutes : 45, heli : true },
        { job : 'Nacelle beacon replacement', type : 'Repair', minutes : 30, heli : true }
    ],
    jobCount  = 36,
    // The share of workable cells the seed leaves free, beside the standby vessel's
    freeShare = 0.12;

/**
 * A seeded random number generator, mulberry32
 * @param {Number} value The seed
 * @returns {Function} Returns the next number, 0 to 1
 */
function seeded(value) {
    let state = value >>> 0;

    return () => {
        state = (state + 0x6D2B79F5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The value at an hour on the line through the points
 * @param {Number[][]} points `[hour, value]`, by hour
 * @param {Number} hour
 * @returns {Number}
 */
function along(points, hour) {
    const next = points.findIndex(([at]) => at >= hour);

    if (next <= 0) {
        return points[Math.max(next, 0)][1];
    }

    const [[h0, v0], [h1, v1]] = [points[next - 1], points[next]];

    return v0 + (v1 - v0) * (hour - h0) / (h1 - h0);
}

/**
 * A day's hourly forecast from its story: the wave height to 0.05 m, ±0.03 m of noise, the wind to the m/s, ±1. The
 * points of the story keep that far from the limits, so the noise never moves a window
 * @param {Object} story `{ hs, wind }` points
 * @param {Object} day `{ dayStart, dayEnd }`
 * @param {Function} random
 * @returns {Object} `{ issued, hs, wind }`
 */
function forecastOf(story, { dayStart, dayEnd }, random) {
    const hours = Array.from({ length : dayEnd - dayStart + 1 }, (_, i) => dayStart + i);

    return {
        issued : '06:00',
        hs     : hours.map(hour => Math.round((along(story.hs, hour) + (random() - 0.5) * 0.06) * 20) / 20),
        wind   : hours.map(hour => Math.round(along(story.wind, hour) + Math.round((random() - 0.5) * 2)))
    };
}

/**
 * The jobs due this week on the turbines today's plan leaves alone, due Tuesday to Sunday
 * @param {Object} data The parsed data/farm.json
 * @param {Function} random
 * @returns {Object[]} `{ turbine, job, type, minutes, heli, due }`, by due day
 */
function weekJobs(data, random) {
    const free = turbineIds.filter(id => !data.jobs[id]);

    // Seeded shuffle
    for (let i = free.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));

        [free[i], free[j]] = [free[j], free[i]];
    }

    return free.slice(0, jobCount)
        .map((turbine, i) => ({ turbine, ...kinds[Math.floor(random() * kinds.length)], due : 1 + i % 6 }))
        .sort((a, b) => a.due - b.due);
}

/**
 * A vessel's trip of a day: the jobs due soonest that fit before its window closes, the nearest next
 * @param {Object} options
 * @returns {Object[]} The stops, `{ turbine, minutes }`, none when nothing fits
 */
function packStops({ queue, vessel, start, close }) {
    const
        heli  = vessel.mode === 'heli',
        most  = heli ? 1 : vessel.seats >= 24 ? 4 : 3,
        stops = [];

    while (stops.length < most) {
        const
            last    = stops.at(-1)?.turbine,
            options = queue.filter(job => Boolean(job.heli) === heli).slice(0, 6)
                .sort((a, b) => (last ? hopMinutes(last, a.turbine, vessel.mode) - hopMinutes(last, b.turbine,
                    vessel.mode) : 0)),
            fits    = options.find(job => tripEnd({ start, stops : [...stops, job], mode : vessel.mode }) <=
                close - minutes.margin);

        if (!fits) {
            break;
        }

        queue.splice(queue.indexOf(fits), 1);
        stops.push({ turbine : fits.turbine, minutes : fits.minutes });
    }

    return stops;
}

/**
 * The trips of a day: one per vessel whose window opens, unless it stands by, the seed leaves it free or no team is
 * left. Its teams go on no other trip that day
 * @param {Object} options
 * @returns {Object[]} The trips in the data's format
 */
function dayTrips({ index, windows, vessels, open, teams, queue, counts, random }) {
    const
        used  = new Set(),
        trips = [];

    for (const vessel of vessels) {
        const
            close = windows[vessel.window],
            skip  = random() < freeShare,
            start = open + firstSailing + 15 * Math.floor(random() * 3),
            crew  = teams.filter(team => !used.has(team.id)).slice(0, vessel.seats >= 24 ? 2 : 1),
            stops = close <= open || vessel.standby || skip || !crew.length ? [] :
                packStops({ queue, vessel, start, close });

        if (stops.length) {
            const count = counts.get(vessel.id) + 1;

            counts.set(vessel.id, count);
            crew.forEach(team => used.add(team.id));
            trips.push({
                id         : `${vessel.id.toUpperCase()}-${count}`,
                resourceId : vessel.id,
                day        : index,
                start      : hhmm(start),
                stops      : stops.map((stop, n) => ({ ...stop, team : crew[n % crew.length].id }))
            });
        }
    }

    return trips;
}

/**
 * The week: each day's forecasts, trips and the turbines due that day, and the jobs of the week
 * @param {Object} data The parsed data/farm.json
 * @returns {Object} `{ days, jobs }`. A day is `{ forecasts, trips, due }`, its trips in the data's format with their
 * `day`, 0 is today. `jobs` are the week's jobs by turbine, as data/farm.json has today's
 */
export function weekPlan(data) {
    const
        random  = seeded(seed),
        { site, vessels, limits } = data,
        day     = { dayStart : site.dayStart, dayEnd : site.dayEnd },
        jobs    = weekJobs(data, random),
        queue   = [...jobs],
        // The teams of the plan: not the ones waiting at the port for a trip, nor the HV authorised person
        waiting = new Set(data.waiting.map(turbine => data.jobs[turbine].team)),
        teams   = data.teams.filter(team => !waiting.has(team.id) && team.id !== 'AP'),
        // Trips are numbered per vessel through the week, after today's
        counts  = new Map(vessels.map(vessel => [vessel.id, data.trips.filter(trip => trip.resourceId === vessel.id)
            .length])),
        days    = [{
            forecasts : data.forecasts,
            trips     : data.trips.map(trip => ({ ...trip, day : 0 })),
            due       : Object.keys(data.jobs).filter(turbine => turbine !== substation)
        }];

    weather.forEach((story, i) => {
        const
            index    = i + 1,
            forecast = forecastOf(story, day, random),
            windows  = closingTimes(forecast, limits, day);

        days.push({
            forecasts : [forecast],
            trips     : dayTrips({ index, windows, vessels, open : site.dayStart * 60, teams, queue, counts, random }),
            due       : jobs.filter(job => job.due === index).map(job => job.turbine)
        });
    });

    // A job's team is the one its trip takes there, none while it is not planned
    const teamOf = new Map(days.flatMap(({ trips }) => trips.flatMap(trip => trip.stops))
        .map(stop => [stop.turbine, stop.team]));

    return {
        days,
        jobs : Object.fromEntries(jobs.map(({ turbine, job, type, minutes : length }) =>
            [turbine, { job, type, minutes : length, team : teamOf.get(turbine) ?? null }]))
    };
}
