import { avatar, avatarsWidth, barGap, barInset, barLayers, chip, chipWidth, titleRow } from '../bar/BarParts.js';
import { stepPipeline } from '../bar/StepPipeline.js';
import { dayMs, elapsedFraction, weekMs } from '../util/Time.js';

/**
 * Bar content of the Vehicle program view: a phase with the scheduler views' bar anatomy plus a slip zone beyond its
 * baseline end, the slim summary bar of a group and the milestone diamond. See ProgramGantt#renderPhase.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Gantt/view/Gantt#config-taskRenderer
 */

export const
    // The milestone is "approaching" this long before its date
    approachMs = 3 * weekMs,

    // +2 wk, +4d
    formatSlip = ms => ms >= weekMs ? `+${Math.round(ms / weekMs)} wk` : `+${Math.round(ms / dayMs)}d`,

    /**
     * A leaf phase: the shared bar layers, a slip zone beyond the baseline end, and the stage pipeline
     * @param {ProgramGantt} view
     * @param {Gantt.model.TaskModel} taskRecord
     * @param {Object} renderData The renderer's `renderData`
     * @returns {DomConfig[]}
     */
    renderPhaseBar = (view, taskRecord, renderData) => {
        const
            { timeAxisViewModel } = view,
            { owners, endDate }   = taskRecord,
            status                = view.getStatus(taskRecord),
            done                  = status === 'done',
            width                 = timeAxisViewModel.getDistanceBetweenDates(taskRecord.startDate, endDate) - barGap,
            fraction              = elapsedFraction(taskRecord, view.simNow),
            slip                  = done ? 0 : view.getSlip(taskRecord),
            slipPx                = slip ?
                Math.round(timeAxisViewModel.getDistanceBetweenDates(taskRecord.baselineEndDate, endDate)) - barGap :
                0,
            steps                 = stepPipeline(taskRecord.stages, fraction, status, width - barInset);

        view.applyBarCls(renderData.cls, taskRecord, status, 'phase');

        return barLayers({
            status,
            fillWidth   : Math.round(width * fraction),
            extraLayers : [slipPx > 0 && { class : 'ev-slip', style : { '--ev-slip' : `${slipPx}px` } }],
            rows        : [
                titleRow({
                    width,
                    title      : taskRecord.name,
                    priority   : taskRecord.priority && !done,
                    delay      : slip ? formatSlip(slip) : '',
                    chipConfig : taskRecord.scope && chip({ icon : 'fa-flag', text : taskRecord.scope }),
                    chipW      : chipWidth(taskRecord.scope),
                    right      : owners.length && { tag : 'span', class : 'ev-avatars', children : owners.map(name => avatar(view.getPerson(name))) },
                    rightW     : avatarsWidth(owners.length)
                }),
                steps.domConfig
            ]
        });
    },

    /**
     * Slim summary bar for a group of phases: a track with bracket ends, filled up to now
     * @param {ProgramGantt} view
     * @param {Gantt.model.TaskModel} taskRecord
     * @param {Object} renderData The renderer's `renderData`
     * @returns {DomConfig[]}
     */
    renderSummaryBar = (view, taskRecord, renderData) => {
        const
            status   = view.getStatus(taskRecord),
            fraction = elapsedFraction(taskRecord, view.simNow);

        Object.assign(renderData.cls, {
            'ev-summary'            : 1,
            [`ev-status-${status}`] : 1,
            'ev-flip'               : view.isFlipping(taskRecord.id),
            // The bracket ends take the colour of the track end they sit on, filled or not
            'ev-summary-started'    : fraction > 0,
            'ev-summary-complete'   : fraction >= 1
        });

        return [
            { class : 'ev-summary-track', children : [{ class : 'ev-summary-fill', style : { '--ev-fill' : fraction } }] }
        ];
    },

    /**
     * Hollow diamond, approaching shortly before its date, solid once reached. The flare only plays when reached live
     * @param {ProgramGantt} view
     * @param {Gantt.model.TaskModel} taskRecord
     * @param {Object} renderData The renderer's `renderData`
     * @returns {String} No content, the diamond is styled by the classes
     */
    renderMilestone = (view, taskRecord, renderData) => {
        const
            now     = view.simNow,
            date    = taskRecord.startDate,
            reached = now >= date;

        Object.assign(renderData.cls, {
            'ev-milestone'             : 1,
            'ev-milestone-approaching' : !reached && date - now <= approachMs,
            'ev-milestone-reached'     : reached,
            'ev-milestone-flare'       : view.flaringMilestones.has(taskRecord)
        });

        return '';
    };
