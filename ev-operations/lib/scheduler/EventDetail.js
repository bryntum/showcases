import { stat } from '../DetailPanel.js';
import { stepPipeline } from '../bar/StepPipeline.js';
import { elapsedFraction, isLiveStatus } from '../util/Time.js';
import { formatNumber, formatPercent, formatTime } from '../util/Format.js';
import { batteryKwh, chargeState } from './ChargingSession.js';

/**
 * The detail panel content of a scheduler event, live at the simulated now: a title and stat tiles per event type.
 */

const
    vehicleOf = eventRecord => `${eventRecord.name} · ${eventRecord.plate || '–'}`,

    // Title and stats by event `type`. Each gets `{ view, eventRecord, status, fraction, timeWindow }`
    detailsByType = {
        batch({ eventRecord, fraction, timeWindow }) {
            const
                units  = eventRecord.units ?? 0,
                fpy    = eventRecord.fpy ?? 0,
                built  = Math.round(units * fraction),
                rework = Math.round(built * (100 - fpy) / 100);

            return {
                title : `${eventRecord.name} · ${eventRecord.model}`,
                stats : [
                    stat('Window', timeWindow),
                    stat('Units', `${built} / ${units}`),
                    stat('Throughput', `${eventRecord.jobsPerHour} JPH`),
                    stat('First-pass yield', `${formatNumber(fpy, 1)}%`),
                    stat('Rework', `${rework} unit${rework === 1 ? '' : 's'}`)
                ]
            };
        },

        charge({ view, eventRecord, status, timeWindow }) {
            const { soc, kw } = chargeState(eventRecord, view.simNow);

            return {
                title : `${eventRecord.name} · ${eventRecord.purpose}`,
                stats : [
                    stat('Vehicle', vehicleOf(eventRecord)),
                    stat('State of charge', `${soc}% → ${eventRecord.socEnd ?? '–'}%`),
                    stat('Power', isLiveStatus(status) ? `${kw} kW` : '—'),
                    stat('Energy added', `${Math.round(batteryKwh * (soc - (eventRecord.socStart ?? 0)) / 100)} kWh`),
                    stat('Window', timeWindow),
                    stat('ETA', formatTime(eventRecord.endDate))
                ]
            };
        },

        service({ eventRecord, status, fraction, timeWindow }) {
            return {
                title : `${eventRecord.name} · ${eventRecord.job || '–'}`,
                stats : [
                    stat('Window', timeWindow),
                    stat('Vehicle', vehicleOf(eventRecord)),
                    stat('Repair order', eventRecord.repairOrder),
                    stat('Current step', stepPipeline(eventRecord.serviceSteps, fraction, status, 0).current),
                    stat('Progress', formatPercent(fraction)),
                    stat('Technician', eventRecord.technician)
                ]
            };
        }
    };

/**
 * The detail of an event for the DetailPanel, see DetailPanel#config-detail
 * @param {Scheduler.view.Scheduler} view
 * @param {Scheduler.model.EventModel} eventRecord
 * @returns {Object}
 */
export const getEventDetail = (view, eventRecord) => {
    const
        status   = view.getStatus(eventRecord),
        buildFor = detailsByType[eventRecord.type] || detailsByType.service;

    return {
        status,
        statusLabel : view.getStatusLabel(status),
        where       : eventRecord.resource?.name,
        ...buildFor({
            view,
            eventRecord,
            status,
            fraction   : elapsedFraction(eventRecord, view.simNow),
            timeWindow : `${formatTime(eventRecord.startDate)} – ${formatTime(eventRecord.endDate)}`
        })
    };
};
