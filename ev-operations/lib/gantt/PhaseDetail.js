import { DateHelper } from '@bryntum/core-enterprise';
import { stat } from '../DetailPanel.js';
import { stepPipeline } from '../bar/StepPipeline.js';
import { dayMs, elapsedFraction, weekMs } from '../util/Time.js';
import { formatPercent } from '../util/Format.js';
import { formatSlip } from './PhaseBars.js';
import { isPhase } from './SlipTracking.js';

/**
 * The detail panel content of a program phase or a group of phases, live at the simulated now.
 */

const
    formatMonth = date => DateHelper.format(date, 'MMM YYYY'),

    // What differs between a group of phases and a phase: its progress, slip (ms) and where it sits
    kinds = {
        group : (view, taskRecord) => ({
            fraction : view.getRollupFraction(taskRecord),
            // The worst slip of its phases
            slip     : Math.max(0, view.getSlipInfo(taskRecord)?.slip ?? 0) * dayMs,
            where    : 'Program stage'
        }),
        phase : (view, taskRecord) => ({
            fraction : elapsedFraction(taskRecord, view.simNow),
            slip     : view.getSlip(taskRecord),
            where    : taskRecord.parent?.name
        })
    };

/**
 * The detail of a task for the DetailPanel, see DetailPanel#config-detail
 * @param {ProgramGantt} view
 * @param {Gantt.model.TaskModel} taskRecord A phase or a group of phases
 * @returns {Object}
 */
export const getPhaseDetail = (view, taskRecord) => {
    const
        { isParent, scope, startDate, endDate } = taskRecord,
        status                                  = view.getStatus(taskRecord),
        { fraction, slip, where }               = kinds[isParent ? 'group' : 'phase'](view, taskRecord);

    return {
        status,
        statusLabel : view.getStatusLabel(status),
        title       : scope ? `${taskRecord.name} · ${scope}` : taskRecord.name,
        where,
        stats       : [
            stat('Window', `${formatMonth(startDate)} – ${formatMonth(new Date(endDate - 1))}`),
            stat('Duration', `${Math.round((endDate - startDate) / weekMs)} weeks`),
            isParent ?
                stat('Phases', taskRecord.allChildren.filter(isPhase).map(phase => phase.name).join(', ')) :
                stat('Current stage', stepPipeline(taskRecord.stages, fraction, status, 0).current),
            stat('Progress', formatPercent(fraction)),
            !isParent && stat('Owners', taskRecord.owners.join(', ') || '–'),
            taskRecord.baselineEndDate && stat('Variance', slip ? `${formatSlip(slip)} vs baseline` : 'On plan')
        ].filter(Boolean)
    };
};
