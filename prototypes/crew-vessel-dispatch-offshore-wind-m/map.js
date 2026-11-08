/**
 * The turbine map of the mockup: the 60 turbines of Skarv Bank in their staggered rows, the substation, the routes of
 * the trips from the port and the status of every turbine. While a team is dragged it shows which turbines the trip
 * can still reach before the window closes. Below it, the selected turbine with the turbine illustration.
 */
import { now } from './data.js';
import { icon } from './icons.js';
import { turbineMarker, turbineSvg } from './turbine.js';

/**
 * An icon placed inside the map SVG, centred on the current origin
 * @param {String} name
 * @param {Number} size In map units
 * @returns {String}
 */
const placed = (name, size) => icon(name).replace('<svg ', `<svg x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" `);

const
    rows   = 6,
    cols   = 10,
    // The farm's rows turn a little against north, as real layouts follow the prevailing wind
    angle  = -9 * Math.PI / 180,
    centre = { x : 232, y : 160 },
    due    = {
        'T-07' : 'SR-1', 'T-08' : 'SR-1', 'T-17' : 'SR-1', 'T-22' : 'NT-1', 'T-23' : 'NT-1', 'T-31' : 'SP-1',
        'T-41' : 'SP-1', 'T-45' : 'BP-1', 'T-46' : 'BP-1', 'T-55' : 'BP-1', 'T-58' : 'H1-1'
    },
    unassigned = ['T-34', 'T-49', 'T-02'],
    // The turbines the trip can still reach while Team F is dragged onto NT-1, before 14:00
    reachable  = ['T-34', 'T-24', 'T-33', 'T-13', 'T-32', 'T-12', 'T-14', 'T-25', 'T-35'];

/**
 * Map position of a turbine
 * @param {Number} n Turbine number, 1 to 60
 * @returns {{x: Number, y: Number}}
 */
export function turbineXY(n) {
    const
        r  = Math.floor((n - 1) / cols),
        c  = (n - 1) % cols,
        dx = 112 + c * 27 + (r % 2) * 13.5 - centre.x,
        dy = 62 + r * 38 - centre.y;

    return {
        x : centre.x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y : centre.y + dx * Math.sin(angle) + dy * Math.cos(angle)
    };
}

const
    id   = n => `T-${String(n).padStart(2, '0')}`,
    xy   = name => turbineXY(Number(name.slice(2))),
    port = { x : -6, y : 290 };

/**
 * Status class of a turbine in a state
 * @returns {String}
 */
function statusOf(name, trips, state) {
    const trip = trips.find(t => t.id === due[name]);

    if (state === 'drag') {
        if (name === 'T-34') {
            return 'ow-m-target';
        }
        if (reachable.includes(name)) {
            return 'ow-m-reach';
        }
    }
    if (trip?.removed?.includes(name) || trip?.status === 'cancelled') {
        return 'ow-m-moved';
    }
    if (trip) {
        return trip.status === 'at-risk' ? 'ow-m-risk' : trip.start < now ? 'ow-m-work' : 'ow-m-planned';
    }
    if (name === 'T-34') {
        return 'ow-m-fault';
    }
    if (unassigned.includes(name)) {
        return 'ow-m-waiting';
    }

    return state === 'drag' ? 'ow-m-dim' : '';
}

/**
 * A trip's route: from the port to each stop and back
 * @returns {String}
 */
function routeHtml(trip, cls) {
    const stops = trip.seg.filter(([type]) => type.startsWith('stop')).map(([, label]) => label).filter(l => l.startsWith('T-'));

    if (!stops.length) {
        return '';
    }

    const points = [port, ...stops.map(xy)];

    return `<path class="ow-route ${cls}" d="M${points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}"/>`;
}

/**
 * The map SVG
 * @param {Object[]} trips The trips of the state
 * @param {String} state
 * @returns {String}
 */
export function mapSvg(trips, state) {
    const
        markers  = Array.from({ length : rows * cols }, (_, i) => {
            const { x, y } = turbineXY(i + 1);

            return turbineMarker(x.toFixed(1), y.toFixed(1), statusOf(id(i + 1), trips, state), id(i + 1));
        }),
        selected = trips.find(t => t.id === 'NT-1'),
        routes   = trips.filter(t => !t.heli && t.status !== 'cancelled')
            .map(t => routeHtml(t, t.id === 'NT-1' && state !== 'forecast' ? 'ow-route-selected' : '')),
        oss      = { x : (turbineXY(25).x + turbineXY(36).x) / 2, y : (turbineXY(25).y + turbineXY(36).y) / 2 },
        labels   = labelsFor(state).map(([name, text, cls = '']) => {
            const p = xy(name);

            return `<g class="ow-map-label ${cls}" transform="translate(${p.x.toFixed(1)} ${(p.y - 13).toFixed(1)})">
                <text text-anchor="middle">${text}</text></g>`;
        });

    // The dragged trip's route with the new stop
    const preview = state === 'drag' ?
        routeHtml({ seg : [...selected.seg.slice(0, -1), ['stop', 'T-34']] }, 'ow-route-preview') : '';

    return `
<svg class="ow-map-svg" viewBox="0 0 440 330" role="img" aria-label="Map of the 60 turbines of Skarv Bank">
    <defs>
        <pattern id="ow-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" class="ow-hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="ow-hatch-line"/>
        </pattern>
    </defs>
    <!-- Depth contours, the faint bathymetry of the bank -->
    <g class="ow-contours">
        <path d="M-20 40 C 90 10, 210 70, 460 20"/>
        <path d="M-20 120 C 120 80, 260 150, 460 100"/>
        <path d="M-20 210 C 100 180, 300 250, 460 190"/>
        <path d="M-20 300 C 140 260, 280 330, 460 280"/>
    </g>
    <text class="ow-depth" x="420" y="34" text-anchor="end">24 m</text>
    <text class="ow-depth" x="420" y="114" text-anchor="end">28 m</text>
    <text class="ow-depth" x="420" y="204" text-anchor="end">31 m</text>
    <!-- The export cable to shore and the port -->
    <path class="ow-cable" d="M${oss.x} ${oss.y} C 120 230, 40 270, -10 300"/>
    ${routes.join('')}
    ${preview}
    <g class="ow-port" transform="translate(14 300)">
        <circle r="9"/>${placed('anchor', 12)}<text x="14" y="4">Havnes O&amp;M base · 34 km</text>
    </g>
    <g class="ow-oss" transform="translate(${oss.x} ${oss.y})">
        <title>Offshore substation</title>
        <circle r="11"/>${placed('substation', 16)}
    </g>
    ${markers.join('')}
    ${labels.join('')}
    ${state === 'drag' ? reachZone() : ''}
</svg>`;
}

/**
 * The labelled turbines of a state: `[turbine, text, class]`
 * @returns {Array[]}
 */
function labelsFor(state) {
    return {
        plan     : [['T-22', 'T-22 · Team B'], ['T-34', 'T-34 · fault', 'ow-map-label-fault'], ['T-41', 'T-41 · at risk', 'ow-map-label-risk']],
        drag     : [['T-34', 'T-34 · +48 min · back 13:54', 'ow-map-label-target']],
        forecast : [['T-31', 'SP-1 → Tue', 'ow-map-label-moved'], ['T-17', 'T-17 → Tue', 'ow-map-label-moved'],
            ['T-55', 'T-46, T-55 → Tue', 'ow-map-label-moved']]
    }[state];
}

/**
 * The reach of the dragged trip, a soft outline around the turbines it can still make
 * @returns {String}
 */
function reachZone() {
    const points = reachable.map(xy);
    const cx     = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy     = points.reduce((s, p) => s + p.y, 0) / points.length;

    return `<ellipse class="ow-reach-zone" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="74" ry="50" transform="rotate(-9 ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
}

/**
 * The map panel: header, the map, its legend and the selected turbine card
 * @param {Object[]} trips
 * @param {String} state
 * @returns {String}
 */
export function mapPanelHtml(trips, state) {
    const card = {
        plan : {
            name : 'T-22', sub : 'Row C · 8.0 MW', job : 'Pitch bearing inspection', team : 'Team B · GWO, HV',
            trip : 'NT-1 · Northern Tern', eta : 'On station 08:00 – 10:00', hs : 1.1, note : 'Window open until 14:00'
        },
        drag : {
            name : 'T-34', sub : 'Row D · 8.0 MW · stopped', job : 'Converter fault, reset and test', team : 'Team F · GWO, HV',
            trip : 'NT-1 · Northern Tern', eta : 'On station 12:05 – 12:53', hs : 1.4, note : 'Back at port 13:54, 6 min before Hs 1.5 m'
        },
        forecast : {
            name : 'T-31', sub : 'Row D · 8.0 MW', job : 'Yaw gear oil change', team : 'Team C · GWO',
            trip : 'SP-1 · Sea Puffin', eta : 'Moved to Tue 06:30', hs : 1.5, note : 'Return leg would meet Hs 1.8 m'
        }
    }[state];

    return `
    <div class="ow-panel-bar">
        <span class="ow-panel-title">Skarv Bank <small>60 turbines · 14 due today</small></span>
        <span class="ow-seg-buttons"><button class="ow-pressed">Status</button><button>Access</button></span>
    </div>
    <div class="ow-map">
        ${mapSvg(trips, state)}
        ${state === 'drag' ? `<div class="ow-map-callout"><b>9 turbines</b> within reach of NT-1 before the window closes at 14:00</div>` : ''}
        <div class="ow-map-legend">
            <span class="ow-m-work"><i></i>In work</span><span class="ow-m-planned"><i></i>Planned</span>
            <span class="ow-m-waiting"><i></i>Waiting</span><span class="ow-m-risk"><i></i>At risk</span>
            <span class="ow-m-fault"><i></i>Stopped</span>
        </div>
    </div>
    <div class="ow-card ${state === 'forecast' ? 'ow-card-moved' : ''}">
        <div class="ow-card-art">${turbineSvg({ hs : card.hs })}</div>
        <div class="ow-card-body">
            <div class="ow-card-title"><b>${card.name}</b><small>${card.sub}</small></div>
            <div class="ow-card-job">${card.job}</div>
            <dl>
                <dt>Team</dt><dd>${card.team}</dd>
                <dt>Trip</dt><dd>${card.trip}</dd>
                <dt>When</dt><dd>${card.eta}</dd>
            </dl>
            <div class="ow-card-note">${icon('waves')} ${card.note}</div>
        </div>
    </div>`;
}
