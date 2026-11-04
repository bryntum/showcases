import { avatar, avatarsWidth, barInset, barLayers, chip, chipWidth, liveValue, liveValueWidth, titleRow } from '../bar/BarParts.js';
import { stepPipeline } from '../bar/StepPipeline.js';
import { clamp } from '../util/Time.js';
import { formatDelay, formatNumber, formatTime } from '../util/Format.js';
import { fonts, textWidth } from '../util/TextMeasure.js';
import { batteryWidth, chargeCurve, chargeState, maxKw } from './ChargingSession.js';

/**
 * Bar content per event type of the scheduler views: production batches, service jobs and charging sessions. Each
 * returns the bar's DomConfig children for the event renderer, see OperationsScheduler#renderOpsEvent.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/mixin/SchedulerEventRendering#config-eventRenderer
 */

const
    // The second row's text, by state: planned, live or done
    byState = (live, done, planned, liveText, doneText) => {
        if (live) {
            return liveText;
        }

        return done ? doneText : planned;
    },

    // Delay badge of an unfinished event
    delayText = (eventRecord, done) => eventRecord.delayMinutes && !done ? formatDelay(eventRecord.delayMinutes) : '';

/**
 * Bar content renderers by event `type`. Each gets `{ view, eventRecord, status, width, fraction, done, live }`
 * @type {Object<String,Function>}
 */
export const eventBars = {
    batch({ eventRecord, status, width, fraction, done, live }) {
        const
            { model, startDate, priority } = eventRecord,
            // A field cleared in the editor is null until the edit is canceled
            units                          = eventRecord.units ?? 0,
            fpy                            = eventRecord.fpy ?? 0,
            value                          = `${Math.round(units * fraction)} / ${units}`,
            // Widest possible counter, for its fixed width
            maxValue                       = `${units} / ${units}`,
            meta                           = byState(live, done, `Starts ${formatTime(startDate)}`, `${eventRecord.jobsPerHour} JPH · FPY ${formatNumber(fpy, 1)}%`, `FPY ${formatNumber(fpy, 1)}%`);

        return barLayers({
            status,
            fillWidth : Math.round(width * fraction),
            rows      : [
                titleRow({
                    width,
                    title      : eventRecord.name,
                    priority   : priority && !done,
                    delay      : delayText(eventRecord, done),
                    chipConfig : chip({ icon : 'fa-layer-group', text : model }),
                    chipW      : chipWidth(model),
                    right      : liveValue(value, maxValue),
                    rightW     : liveValueWidth(maxValue)
                }),
                {
                    class    : 'ev-row ev-row-meta',
                    children : [
                        {
                            class    : 'ev-quality',
                            children : [
                                { class : 'ev-quality-good', style : { '--ev-fill' : fraction * fpy / 100 } },
                                { class : 'ev-quality-rework', style : { '--ev-fill' : fraction * (100 - fpy) / 100 } }
                            ]
                        },
                        width >= 120 + textWidth(meta, fonts.meta) && { tag : 'span', class : 'ev-meta', text : meta }
                    ]
                }
            ]
        });
    },

    service({ view, eventRecord, status, width, fraction, done }) {
        const
            { technician, priority } = eventRecord,
            job                      = eventRecord.job || '–',
            steps                    = stepPipeline(eventRecord.serviceSteps, fraction, status, width - barInset);

        return barLayers({
            status,
            fillWidth : Math.round(width * fraction),
            rows      : [
                titleRow({
                    width,
                    title      : eventRecord.name,
                    priority   : priority && !done,
                    delay      : delayText(eventRecord, done),
                    chipConfig : chip({ icon : 'fa-wrench', text : job }),
                    chipW      : chipWidth(job),
                    right      : technician && avatar(view.getPerson(technician)),
                    rightW     : avatarsWidth(1)
                }),
                steps.domConfig
            ]
        });
    },

    charge({ view, eventRecord, status, width, done, live }) {
        const
            { socStart, socEnd, purpose, startDate, endDate } = eventRecord,
            { fraction, soc, kw }                             = chargeState(eventRecord, view.simNow),
            kwText                                            = live ? `${kw} kW` : '',
            meta                                              = `${socStart ?? '–'} → ${socEnd ?? '–'}% · ${purpose}`,
            meta2                                             = byState(live, done, formatTime(startDate), `ETA ${formatTime(endDate)}`, `Done ${formatTime(endDate)}`),
            battery                                           = {
                tag      : 'span',
                class    : { 'ev-battery' : 1, 'ev-battery-low' : soc < 25 },
                children : [{ tag : 'span', class : 'ev-battery-level', style : { '--ev-fill' : clamp(Math.max(8, soc) / 100) } }]
            };

        return barLayers({
            status,
            fillWidth   : 0,
            extraLayers : [chargeCurve(eventRecord, width, fraction)],
            rows        : [
                titleRow({
                    width,
                    title      : eventRecord.name,
                    priority   : eventRecord.priority && !done,
                    delay      : delayText(eventRecord, done),
                    chipConfig : chip({ text : `${soc}%`, prefix : battery, chars : '100%'.length }),
                    // The battery glyph instead of an icon
                    chipW      : chipWidth('100%', batteryWidth),
                    right      : kwText && liveValue(kwText, maxKw),
                    rightW     : liveValueWidth(maxKw)
                }),
                {
                    class    : 'ev-row ev-row-meta ev-row-split',
                    children : [
                        { tag : 'span', class : 'ev-meta', text : meta },
                        width >= 60 + textWidth(meta, fonts.meta) + textWidth(meta2, fonts.meta) && { tag : 'span', class : 'ev-meta', text : meta2 }
                    ]
                }
            ]
        });
    }
};
