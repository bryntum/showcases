/**
 * Design mockup of the Offshore Wind Dispatch showcase. Static, for review only: no Bryntum widgets beyond the shared
 * showcase shell and theme, so the look can be judged before the build. Pick a state with the URL:
 *
 *   ?state=plan       The morning plan, Northern Tern's trip selected (default)
 *   ?state=drag       Team F dragged onto Northern Tern's trip: what it can still reach before the window closes
 *   ?state=forecast   The 08:00 forecast closes the window two hours early: trips trimmed, moved and pulled forward
 *   &tab=map          Phone widths: the map tab instead of the schedule
 */
import { createShell } from '@showcases/shared';
import '@bryntum/scheduler-enterprise/scheduler.css';
import '@bryntum/scheduler-enterprise/svalbard.css';
import { now, trips as allTrips, hhmm, windows } from './data.js';
import { mapPanelHtml } from './map.js';
import { drawDependencies, scheduleHtml, trayHtml, tripsFor } from './schedule.js';
import './mockup.css';

const
    params = new URLSearchParams(location.search),
    state  = ['plan', 'drag', 'forecast'].includes(params.get('state')) ? params.get('state') : 'plan',
    tab    = params.get('tab') === 'map' ? 'map' : 'schedule',
    trips  = tripsFor(allTrips, state),
    win    = windows[state === 'forecast' ? 'forecast' : 'plan'];

/**
 * The KPI bar: the clock, the weather window as the headline, then the day's counts
 * @returns {String}
 */
function kpiHtml() {
    const
        left    = win.ctv - now,
        moved   = state === 'forecast',
        kpis    = moved ?
            [['Due today', 14], ['Assigned', 5], ['Moved to Tue', 6, 'ow-kpi-alert'], ['Offshore', '14 techs'], ['At risk', 0]] :
            [['Due today', 14], ['Assigned', 11], ['Waiting', 3], ['Offshore', '14 techs'], ['At risk', 1, 'ow-kpi-warn']];

    return `
    <div class="ow-kpis">
        <div class="ow-clock"><small>Mon 9 Nov · Skarv Bank</small><b>${hhmm(now)}</b></div>
        <div class="ow-window ${moved ? 'ow-window-short' : ''}">
            <i class="fa fa-water"></i>
            <span><small>CTV weather window</small><b>Closes ${hhmm(win.ctv)}</b></span>
            <span class="ow-window-left">${Math.floor(left)} h ${Math.round(left % 1 * 60)} min left${moved ? '<em>was 14:00</em>' : ''}</span>
        </div>
        ${kpis.map(([label, value, cls = '']) => `<div class="ow-kpi ${cls}"><small>${label}</small><b>${value}</b></div>`).join('')}
        <div class="ow-kpi-tools">
            <span class="ow-next"><i class="fa fa-satellite-dish"></i> ${moved ? 'Updated 08:00' : 'Next forecast 08:00'}</span>
            <button class="ow-play"><i class="fa fa-play"></i> Play the day</button>
        </div>
    </div>`;
}

/**
 * The 08:00 forecast's notice: what it changed, with undo
 * @returns {String}
 */
function toastHtml() {
    return state !== 'forecast' ? '' : `
    <div class="ow-toast" role="status">
        <i class="fa fa-triangle-exclamation"></i>
        <span><b>Forecast 08:00: Hs reaches 1.5 m at 12:00, two hours earlier.</b>
        3 trips trimmed, Sea Puffin moved to Tuesday, Heli 1's pickup brought forward.</span>
        <button>Undo</button><button class="ow-toast-primary">Review 5 changes</button>
    </div>`;
}

/**
 * The team being dragged and the drop tooltip, placed over the previewed stop once laid out
 * @param {HTMLElement} app
 */
function placeDrag(app) {
    const preview = app.querySelector('.ow-seg-preview');

    if (!preview) {
        return;
    }

    const
        box  = app.getBoundingClientRect(),
        rect = preview.getBoundingClientRect(),
        x    = rect.left - box.left + rect.width / 2,
        y    = rect.top - box.top;

    app.insertAdjacentHTML('beforeend', `
    <div class="ow-drag-chip" style="left:${x - 20}px;top:${y + 8}px">
        <span class="ow-team-avatar">F</span><b>Team F</b><span class="ow-cert ow-cert-hv">HV</span>
        <i class="fa fa-hand-back-fist ow-drag-hand"></i>
    </div>
    <div class="ow-drop-tip" style="left:${x + 4}px;top:${y + 50}px">
        <div class="ow-drop-tip-head"><i class="fa fa-circle-check"></i> T-34 fits on NT-1</div>
        <dl>
            <dt>On station</dt><dd>12:05 – 12:53</dd>
            <dt>Back at port</dt><dd><b>13:54</b>, window closes 14:00</dd>
            <dt>Seats</dt><dd>5 / 12 PAX</dd>
            <dt>Certificates</dt><dd>GWO ✓ HV ✓</dd>
        </dl>
        <div class="ow-drop-tip-foot">NT-1 can still reach 9 turbines before 14:00, see the map</div>
    </div>`);
}

const
    container = createShell({ title : 'Offshore Wind Dispatch', source : 'offshore-wind-dispatch' }),
    app       = document.createElement('div');

app.className = `b-outer ow-app ow-state-${state}`;
app.dataset.tab = tab;
app.innerHTML = `
    ${kpiHtml()}
    <div class="ow-tabs"><button class="${tab === 'schedule' ? 'ow-pressed' : ''}">Schedule</button><button class="${tab === 'map' ? 'ow-pressed' : ''}">Map</button></div>
    <div class="ow-main">
        <section class="ow-schedule">
            <div class="ow-panel-bar">
                <span class="ow-panel-title">Vessels &amp; helicopters <small>4 CTV · 2 heli</small></span>
                <span class="ow-seg-buttons"><button>−</button><button class="ow-pressed">Day</button><button>+</button></span>
            </div>
            ${trayHtml(state)}
            ${toastHtml()}
            <div class="ow-schedule-body">${scheduleHtml(trips, state)}</div>
            <div class="ow-legend">
                <span class="ow-l-plan">On plan</span><span class="ow-l-risk">Past window</span><span class="ow-l-trim">Trimmed</span>
                <span class="ow-l-cancel">Moved</span><span class="ow-l-transit">Transit</span><span class="ow-l-nogo">Weather no-go</span>
                <span class="ow-l-dep">Must finish first</span>
                <span class="ow-legend-credit">Schedule: Bryntum Scheduler</span>
            </div>
        </section>
        <section class="ow-side">${mapPanelHtml(trips, state)}</section>
    </div>`;
container.append(app);

await document.fonts.ready;
drawDependencies(app);
placeDrag(app);
addEventListener('resize', () => drawDependencies(app));
document.documentElement.dataset.ready = 'true';
