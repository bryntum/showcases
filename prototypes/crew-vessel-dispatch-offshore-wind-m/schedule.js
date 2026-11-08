/**
 * The schedule half of the mockup, static HTML standing in for Bryntum Scheduler: the teams waiting at the port, the
 * time axis with the hourly sea state, the vessels and helicopters grouped, their trips with the turbine stops nested
 * inside, the weather no-go time ranges and the window line. In the build these are a Scheduler with resource time
 * ranges, nested events, dependencies and a resource utilization column.
 */
import { dayEnd, dayLong, dayStart, forecast, hhmm, nextDay, now, resources, tripEnd, waiting, windows } from './data.js';
import { icon } from './icons.js';

const
    span  = dayEnd - dayStart,
    pct   = hours => `${((hours - dayStart) / span * 100).toFixed(3)}%`,
    width = hours => `${(hours / span * 100).toFixed(3)}%`,
    // A resource's glyph: the SWATH vessel has its own hull
    glyph = resourceId => {
        const resource = resources.find(r => r.id === resourceId);

        return resource.group === 'heli' ? 'heli' : resource.kind === 'SWATH' ? 'swath' : 'ctv';
    };

/**
 * The trips as they stand in a state, with their status and what changed
 * @param {Object[]} trips
 * @param {String} state
 * @returns {Object[]}
 */
export function tripsFor(trips, state) {
    const
        win    = windows[state === 'forecast' ? 'forecast' : 'plan'],
        result = trips.map(trip => ({ ...trip, seg : [...trip.seg], removed : [] }));

    if (state === 'forecast') {
        const
            byId = Object.fromEntries(result.map(trip => [trip.id, trip])),
            trim = (trip, ...stops) => {
                trip.removed = stops;
                trip.seg     = trip.seg.filter(([, label]) => !stops.includes(label));
                trip.status  = 'trimmed';
            };

        trim(byId['SR-1'], 'T-17');
        trim(byId['NT-1'], 'T-23');
        trim(byId['BP-1'], 'T-46', 'T-55');
        byId['SP-1'].status = 'cancelled';
        Object.assign(byId['H1-2'], { status : 'pulled', was : 14.5, start : 11.75 });
    }

    for (const trip of result) {
        const limit = win[resources.find(r => r.id === trip.resource).window];

        trip.end = tripEnd(trip);

        if (!trip.status) {
            trip.status = trip.end > limit ? 'at-risk' : 'on-plan';
        }
        trip.margin = limit - trip.end;
    }

    return result;
}

/**
 * The teams waiting at the port, the drag sources
 * @param {String} state
 * @returns {String}
 */
export function trayHtml(state) {
    const chips = waiting.map(team => `
        <div class="ow-team ${state === 'drag' && team.id === 'F' ? 'ow-team-lifted' : ''}">
            <span class="ow-team-avatar">${team.id}</span>
            <span class="ow-team-text">
                <b>Team ${team.id}</b> · ${team.techs} techs
                <span class="ow-team-job">${team.turbine} · ${team.job} · ${team.hours < 1 ? `${Math.round(team.hours * 60)} min` : `${team.hours} h`}</span>
            </span>
            <span class="ow-certs">${team.certs.map(c => `<span class="ow-cert ow-cert-${c.toLowerCase()}">${c}</span>`).join('')}</span>
        </div>`).join('');

    return `
    <div class="ow-tray">
        <span class="ow-tray-title">${icon('anchor')} Waiting at Havnes</span>
        ${chips}
        <span class="ow-tray-hint">Drag a team onto a trip</span>
    </div>`;
}

/**
 * The time axis: hours, then the hourly wave height against the vessel limits, then the wind for the helicopters
 * @param {String} state
 * @returns {String}
 */
function axisHtml(state) {
    const
        // One value per visible hour, the 18:00 one is past the end. The wave height is an AG Charts chart, see
        // wave-chart.js, drawn into .ow-wave-chart once the page is laid out
        wind         = forecast[state === 'forecast' ? 'forecast' : 'plan'].wind.slice(0, span),
        hours        = wind.map((_, i) => `<span class="ow-hour" style="left:${pct(dayStart + i)}">${hhmm(dayStart + i)}</span>`),
        winds        = wind.map((w, i) => `<span class="ow-wind ${w > 20 ? 'ow-wind-over' : ''}" style="left:${pct(dayStart + i)}">${w}</span>`);

    return `
    <div class="ow-axis">
        <div class="ow-axis-label">
            <span class="ow-axis-row ow-axis-row-head">${icon('broadcast')} ${state === 'forecast' ? '<span class="ow-chip-new">Forecast 08:00</span>' : 'Forecast 06:00'}</span>
            <span class="ow-axis-row ow-axis-row-sea">${icon('waves')}<span>Wave height<small>Hs, metres</small></span></span>
            <span class="ow-axis-row ow-axis-row-wind">${icon('wind')}<span>Wind<small>m/s at hub</small></span></span>
        </div>
        <div class="ow-axis-time">
            <div class="ow-axis-row ow-axis-row-day"><span class="ow-day">${dayLong}<em>Today</em></span></div>
            <div class="ow-axis-row ow-axis-row-hours">${hours.join('')}</div>
            <div class="ow-axis-row ow-axis-row-sea"><div class="ow-wave-chart"></div></div>
            <div class="ow-axis-row ow-axis-row-wind">${winds.join('')}</div>
            ${nowLine(true)}
        </div>
    </div>`;
}

function nowLine(label = false) {
    return `<span class="ow-now" style="left:${pct(now)}">${label ? `<span class="ow-now-label">Now ${hhmm(now)}</span>` : ''}</span>`;
}

/**
 * One trip bar: its name and team on top, the transit legs and turbine stops nested below
 * @param {Object} trip
 * @param {Object} options `{ selected, drag }`
 * @returns {String}
 */
function tripHtml(trip, { selected, drag }) {
    const
        segs   = [...trip.seg],
        status = trip.status,
        badge  = {
            'at-risk' : `<span class="ow-badge ow-badge-risk">${Math.round(-trip.margin * 60)} min past window</span>`,
            trimmed   : `<span class="ow-badge ow-badge-trim">${trip.removed.join(', ')} → ${nextDay}</span>`,
            cancelled : `<span class="ow-badge ow-badge-cancel">Moved to ${nextDay} 06:30</span>`,
            pulled    : `<span class="ow-badge ow-badge-trim">${Math.round((trip.was - trip.start) * 60)} min earlier</span>`
        }[status] ?? '';

    // The dragged team's stop, previewed before the return leg
    if (drag) {
        segs.splice(segs.length - 1, 0, ['stop ow-seg-preview', 'T-34', 0.8]);
    }

    const
        end   = segs.reduce((t, [, , h]) => t + h, trip.start),
        inner = segs.map(([type, label, hours]) => `
            <span class="ow-seg ow-seg-${type}" style="flex-grow:${hours}">
                ${type === 'transit' ? icon(glyph(trip.resource)) :`<b>${label}</b>${hours >= 1 ? `<small>${hours} h</small>` : ''}`}
            </span>`).join('');

    return `
    <div class="ow-trip ow-trip-${status} ${trip.heli ? 'ow-trip-heli' : ''} ${selected ? 'ow-selected' : ''} ${drag ? 'ow-trip-drop' : ''}"
        data-trip="${trip.id}" style="left:${pct(trip.start)};width:${width(end - trip.start)}">
        <div class="ow-trip-head"><b>${trip.id}</b><span>${trip.team} · ${trip.pax} PAX</span>${badge}</div>
        <div class="ow-trip-segs">${inner}</div>
    </div>`;
}

/**
 * The weather no-go time range of a resource, from the time its limit is crossed to the end of the day
 * @param {Object} resource
 * @param {String} state
 * @returns {String}
 */
function nogoHtml(resource, state) {
    const
        from  = windows[state === 'forecast' ? 'forecast' : 'plan'][resource.window],
        was   = windows.plan[resource.window],
        label = resource.window === 'heli' ? 'Wind > 20 m/s' : `Hs > ${resource.window === 'swath' ? '2.0' : '1.5'} m`;

    return `
    <div class="ow-nogo ow-nogo-${resource.window}" style="left:${pct(from)};width:${width(dayEnd - from)}">
        <span class="ow-nogo-label">${icon(resource.window === 'heli' ? 'wind' : 'waves')} ${label}${state === 'forecast' ? `<small>was ${hhmm(was)}</small>` : ''}</span>
    </div>
    <span class="ow-window-line" style="left:${pct(from)}"></span>`;
}

/**
 * The resource column: icon, name, type and limit, and how much of today's window its trips use
 * @param {Object} resource
 * @param {Object[]} trips
 * @param {String} state
 * @returns {String}
 */
function resourceHtml(resource, trips, state) {
    const
        start = Math.max(now, dayStart + 0.5),
        limit = windows[state === 'forecast' ? 'forecast' : 'plan'][resource.window],
        mine  = trips.filter(trip => trip.resource === resource.id && trip.status !== 'cancelled'),
        used  = mine.reduce((sum, trip) => sum + Math.max(0, Math.min(trip.end, limit) - Math.max(trip.start, start)), 0),
        share = Math.min(100, Math.round(used / (limit - start) * 100)),
        pax   = mine.reduce((max, trip) => Math.max(max, trip.pax), 0);

    return `
    <div class="ow-resource">
        <span class="ow-resource-icon">${icon(glyph(resource.id))}</span>
        <span class="ow-resource-text">
            <b>${resource.name}</b>
            <small>${resource.kind} · ${resource.limit}</small>
            <span class="ow-util" title="${share}% of the weather window booked">
                <span class="ow-util-bar"><span style="width:${share}%"></span></span>
                <span class="ow-util-text">${pax}/${resource.pax} PAX</span>
            </span>
        </span>
    </div>`;
}

/**
 * The whole schedule panel body
 * @param {Object[]} trips The trips of the state, see tripsFor
 * @param {String} state
 * @returns {String}
 */
export function scheduleHtml(trips, state) {
    const groups = [
        { id : 'ctv', name : 'Crew transfer vessels', count : 4 },
        { id : 'heli', name : 'Helicopters', count : 2 }
    ];

    const rows = groups.map(group => `
        <div class="ow-group"><span>${icon('caret-down')} ${group.name}</span><small>${group.count}</small></div>
        ${resources.filter(r => r.group === group.id).map(resource => `
        <div class="ow-row" data-resource="${resource.id}">
            ${resourceHtml(resource, trips, state)}
            <div class="ow-lane">
                ${nogoHtml(resource, state)}
                ${trips.filter(t => t.resource === resource.id).map(trip => tripHtml(trip, {
        selected : state === 'plan' && trip.id === 'NT-1',
        drag     : state === 'drag' && trip.id === 'NT-1'
    })).join('')}
                ${ghostsHtml(trips, resource, state)}
                ${nowLine()}
            </div>
        </div>`).join('')}`).join('');

    return `
    ${axisHtml(state)}
    <div class="ow-rows">
        <div class="ow-past" style="--ow-frac:${((now - dayStart) / span).toFixed(4)}"></div>
        ${rows}
        <svg class="ow-deps" aria-hidden="true"></svg>
    </div>`;
}

/**
 * What the forecast took away, faint at its old place: the stops moved to tomorrow and the old slot of a pulled trip
 * @returns {String}
 */
function ghostsHtml(trips, resource, state) {
    if (state !== 'forecast') {
        return '';
    }

    return trips.filter(t => t.resource === resource.id && t.status === 'pulled').map(trip => `
        <div class="ow-ghost" style="left:${pct(trip.was)};width:${width(trip.end - trip.start)}"></div>`).join('');
}

/**
 * Draws the dependency arrows once laid out: the HV isolation at the substation must end before work on T-45 starts
 * @param {HTMLElement} root
 */
export function drawDependencies(root) {
    const
        svg   = root.querySelector('.ow-deps'),
        box   = svg.getBoundingClientRect(),
        from  = root.querySelector('[data-trip="H2-1"]'),
        to    = root.querySelector('[data-trip="BP-1"] .ow-seg-stop');

    if (!from || !to) {
        return;
    }

    const
        a  = from.getBoundingClientRect(),
        b  = to.getBoundingClientRect(),
        x1 = a.right - box.left,
        y1 = a.top + a.height / 2 - box.top,
        x2 = b.left - box.left + 6,
        y2 = b.bottom - box.top;

    svg.innerHTML = `
        <defs><marker id="ow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" class="ow-dep-head"/></marker></defs>
        <path class="ow-dep" d="M${x1} ${y1} H${x1 + 10} V${y2 + 14} H${x2} V${y2 + 2}" marker-end="url(#ow-arrow)"/>`;
}
