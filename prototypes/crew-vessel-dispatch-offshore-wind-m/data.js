/**
 * Mock data of the design mockup: one morning at a fictional 60 turbine farm, Skarv Bank. Hand written so every state
 * tells the story: the plan, a team dragged onto a trip, and the 08:00 forecast closing the window early.
 * Times are decimal hours of today: the page opens on the real current date, like the build will.
 */

const
    today    = new Date(),
    tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
    fmt      = (date, options) => date.toLocaleDateString('en-GB', options);

export const
    // Today, written out for the time axis ("Sunday 8 November 2026") and short for the KPI bar ("Sun 8 Nov")
    dayLong  = fmt(today, { weekday : 'long', day : 'numeric', month : 'long', year : 'numeric' }).replace(',', ''),
    dayShort = fmt(today, { weekday : 'short', day : 'numeric', month : 'short' }).replace(',', ''),
    // Where the forecast pushes work: "Mon", "Monday"
    nextDay  = fmt(tomorrow, { weekday : 'short' }),
    nextLong = fmt(tomorrow, { weekday : 'long' }),

    // The visible day
    dayStart = 6,
    dayEnd   = 18,
    // 07:40 in the plan, 08:02 once the 08:00 forecast is in
    now      = new URLSearchParams(location.search).get('state') === 'forecast' ? 8 + 2 / 60 : 7 + 40 / 60,

    // Significant wave height (m) and wind at hub height (m/s), hourly from 06:00. The forecast state is the 08:00 update
    forecast = {
        plan : {
            hs   : [0.9, 0.9, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 1.9, 2.0, 2.1],
            wind : [9, 10, 10, 11, 12, 13, 14, 15, 17, 19, 21, 23, 24]
        },
        forecast : {
            hs   : [0.9, 0.9, 1.0, 1.1, 1.25, 1.4, 1.5, 1.8, 2.0, 2.2, 2.3, 2.3, 2.4],
            wind : [9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 25, 25, 26]
        }
    },

    // When each limit is crossed, per state
    windows = {
        plan     : { ctv : 14, swath : 17, heli : 16.5 },
        forecast : { ctv : 12, swath : 14, heli : 13 }
    },

    resources = [
        { id : 'sr', group : 'ctv', name : 'Skarv Runner', kind : 'CTV', limit : 'Hs ≤ 1.5 m', pax : 12, window : 'ctv' },
        { id : 'nt', group : 'ctv', name : 'Northern Tern', kind : 'CTV', limit : 'Hs ≤ 1.5 m', pax : 12, window : 'ctv' },
        { id : 'sp', group : 'ctv', name : 'Sea Puffin', kind : 'CTV', limit : 'Hs ≤ 1.5 m', pax : 12, window : 'ctv' },
        { id : 'bp', group : 'ctv', name : 'Brine Petrel', kind : 'SWATH', limit : 'Hs ≤ 2.0 m', pax : 24, window : 'swath' },
        { id : 'h1', group : 'heli', name : 'Heli 1', kind : 'AW169 · hoist', limit : 'Wind ≤ 20 m/s', pax : 6, window : 'heli' },
        { id : 'h2', group : 'heli', name : 'Heli 2', kind : 'AW169 · hoist', limit : 'Wind ≤ 20 m/s', pax : 6, window : 'heli' }
    ],

    // Trips: a vessel or helicopter run, with its turbine stops nested in it. `seg` is [type, label, hours]
    trips = [
        {
            id : 'SR-1', resource : 'sr', team : 'Team A', pax : 3, start : 6.5,
            seg : [['transit', '', 1.2], ['stop', 'T-07', 1.5], ['stop', 'T-08', 1.5], ['stop', 'T-17', 1.3], ['transit', '', 1.2]]
        },
        {
            id : 'NT-1', resource : 'nt', team : 'Team B', pax : 3, start : 7,
            seg : [['transit', '', 1.0], ['stop', 'T-22', 2.0], ['stop', 'T-23', 2.0], ['transit', '', 1.1]]
        },
        {
            id : 'SP-1', resource : 'sp', team : 'Team C', pax : 4, start : 8,
            seg : [['transit', '', 1.1], ['stop', 'T-31', 2.5], ['stop', 'T-41', 1.5], ['transit', '', 1.2]]
        },
        {
            id : 'BP-1', resource : 'bp', team : 'Teams D, E', pax : 7, start : 6.75,
            seg : [['transit', '', 1.3], ['stop', 'T-45', 3], ['stop', 'T-46', 2.5], ['stop', 'T-55', 2], ['transit', '', 1.3]]
        },
        {
            id : 'H2-1', resource : 'h2', team : 'HV authorised person', pax : 1, start : 6.5, heli : true,
            seg : [['transit', '', 0.4], ['stop', 'OSS', 0.5], ['transit', '', 0.4]]
        },
        {
            id : 'H1-1', resource : 'h1', team : 'Team J', pax : 2, start : 9, heli : true,
            seg : [['transit', '', 0.4], ['stop', 'T-58', 0.3], ['transit', '', 0.4]]
        },
        {
            id : 'H1-2', resource : 'h1', team : 'Team J', pax : 2, start : 14.5, heli : true,
            seg : [['transit', '', 0.4], ['stop', 'T-58', 0.3], ['transit', '', 0.4]]
        }
    ],

    // Teams at the port with no trip yet, the drag sources
    waiting = [
        { id : 'F', techs : 2, certs : ['GWO', 'HV'], turbine : 'T-34', job : 'Converter fault', hours : 0.8 },
        { id : 'G', techs : 3, certs : ['GWO', 'Rope'], turbine : 'T-49', job : 'Blade leading edge', hours : 4 },
        { id : 'H', techs : 2, certs : ['GWO'], turbine : 'T-02', job : 'Annual service', hours : 6 }
    ];

/**
 * End time of a trip
 * @param {Object} trip
 * @returns {Number}
 */
export function tripEnd(trip) {
    return trip.seg.reduce((end, [, , hours]) => end + hours, trip.start);
}

/**
 * Formats decimal hours as HH:MM
 * @param {Number} hours
 * @returns {String}
 */
export function hhmm(hours) {
    const minutes = Math.round(hours * 60);

    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
