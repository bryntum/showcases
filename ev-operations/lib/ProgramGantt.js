import { DateHelper } from '@bryntum/core-enterprise';
import { Gantt } from '@bryntum/gantt-enterprise';
// The TimeRanges feature (past shading, now line) is a Scheduler feature, importing the package registers it
import '@bryntum/scheduler-enterprise';
import SimulatedView from './SimulatedView.js';
import TimeSpanEditing, { editorDrawer } from './TimeSpanEditing.js';
import ProgramTask from './model/ProgramTask.js';
import SlipTracking, { isPhase, weekIndex } from './gantt/SlipTracking.js';
import { approachMs, renderMilestone, renderPhaseBar, renderSummaryBar } from './gantt/PhaseBars.js';
import { renderDependency } from './gantt/DependencyRoute.js';
import { getPhaseDetail } from './gantt/PhaseDetail.js';
import { deriveStatus, elapsedFraction } from './util/Time.js';
import { formatDay } from './util/Format.js';
import { mergeFeature } from './util/Features.js';

const
    // How long a milestone reached during Simulate keeps `ev-milestone-flare`, longer than the 0.3s
    // ev-milestone-flare animation in program.css, so the class outlasts it
    flareMs       = 400,
    // Slimmer group and milestone rows. The milestone's 28px bar box then fits the rotated diamond's points
    slimRowHeight = 52,
    // Time axis label, months with the year on January
    isYearStart   = date => date.getMonth() === 0,
    axisLabel     = date => DateHelper.format(date, isYearStart(date) ? 'MMM YYYY' : 'MMM');

/**
 * Gantt used by the "Vehicle program" view.
 *
 * - Phases grouped in a tree (Design, Validation...), the parents show a slim summary bar and roll up progress and
 *   variance from their phases
 * - Same custom bar anatomy as the scheduler views, using `taskRenderer`
 * - Slip zone beyond the baseline end, using the task's `baselines` data without showing the baseline bars
 * - Critical path from the scheduling engine (the task's `critical` field)
 * - Quiet, neutral dependency lines. A dependency `renderer` routes them down right after the predecessor and into the
 *   start of the successor along its own row, and dims the ones leaving a finished phase
 * - Dragging a predecessor pushes its successors, the scheduling engine reschedules them. The variance column follows
 *   the drag live
 * - Double-click (or Enter) edits a phase in the TaskEdit drawer
 *
 * Learn more:
 * https://bryntum.com/docs/api/Gantt/view/Gantt#config-taskRenderer
 * https://bryntum.com/docs/api/Scheduler/view/TimelineBase#function-refreshEvents
 * https://bryntum.com/docs/api/Gantt/feature/CriticalPaths
 * https://bryntum.com/docs/api/Gantt/feature/TaskEdit
 * https://bryntum.com/docs/api/Gantt/feature/Dependencies#config-renderer
 * https://bryntum.com/docs/api/Gantt/model/TaskModel#field-baselines
 */
export default class ProgramGantt extends TimeSpanEditing(SlipTracking(SimulatedView(Gantt))) {
    static $name = 'ProgramGantt';

    static type = 'programgantt';

    static configurable = {
        rowHeight                 : 92,
        // Gantt uses fixed row heights by default
        fixedRowHeight            : false,
        // Group rows (a summary bar) and the milestone row are slimmer
        getRowHeight              : record => record.isParent || record.milestone ? slimRowHeight : null,
        barMargin                 : 12,
        eventStyle                : null,
        eventColor                : null,
        useInitialAnimation       : false,
        zoomOnMouseWheel          : false,
        zoomOnTimeAxisDoubleClick : false,
        snap                      : true,

        viewPreset : {
            tickWidth         : 96,
            displayDateFormat : 'MMM D',
            shiftUnit         : 'month',
            shiftIncrement    : 1,
            timeResolution    : {
                unit      : 'day',
                increment : 1
            },
            headers : [{
                unit  : 'month',
                // Labels at the tick start, like the bars
                align : 'start',
                // Months, with the year on January, which is accented (styled by the ev-year-start cls)
                renderer(start, end, headerConfig) {
                    if (isYearStart(start)) {
                        headerConfig.headerCellCls = `${headerConfig.headerCellCls ?? ''} ev-year-start`.trim();
                    }

                    return axisLabel(start);
                }
            }]
        },

        features : {
            // A click selects, double-click or Enter edits in a drawer docked to the end of the viewport
            taskEdit : {
                editorConfig : { ...editorDrawer, title : 'Program phase' },
                items        : {
                    generalTab : {
                        labelPosition : 'above',
                        items         : {
                            // Progress is derived from the simulated time
                            percentDone : false,
                            effort      : false,
                            gateField   : {
                                type      : 'combo',
                                name      : 'gate',
                                label     : 'Stage gate',
                                items     : ['G1', 'G2', 'G3', 'G4', 'G5'],
                                editable  : false,
                                clearable : true,
                                weight    : 700
                            },
                            // The tab lays its fields out in two grid columns, date and time need both
                            startDate : { cls : 'ev-editor-wide' },
                            endDate   : { cls : 'ev-editor-wide' }
                        }
                    },
                    resourcesTab : false,
                    advancedTab  : false,
                    notesTab     : false
                }
            },
            taskMenu           : false,
            taskTooltip        : false,
            taskDragCreate     : false,
            cellEdit           : false,
            cellMenu           : false,
            headerMenu         : false,
            timeAxisHeaderMenu : false,
            sort               : false,
            percentBar         : false,
            projectLines       : false,
            nonWorkingTime     : false,
            dependencyEdit     : false,
            criticalPaths      : true,
            // Milestone label to the left of the diamond
            labels             : {
                before : {
                    renderer : ({ taskRecord, domConfig }) => taskRecord.milestone ? {
                        className : { ...domConfig.className, 'ev-milestone-label' : 1 },
                        children  : [
                            { tag : 'span', class : 'ev-milestone-name', text : taskRecord.name },
                            { tag : 'span', class : 'ev-milestone-date', text : formatDay(taskRecord.startDate) }
                        ]
                    } : null
                }
            },
            columnLines : {
                // Quarter lines are brighter than month lines, year lines brighter still
                renderer(tickStart, domConfig) {
                    domConfig.className['ev-major-line'] = tickStart.getMonth() % 3 === 0;
                    domConfig.className['ev-year-line']  = tickStart.getMonth() === 0;
                }
            },
            dependencies : {
                radius                            : 8,
                // Compact filled triangle, see program.css. A custom marker also gets an id per view
                // Workaround for bryntum/support#14015
                markerDef                         : 'M4.1,0.65 L8,3 L4.1,5.35 z',
                allowCreate                       : false,
                showTooltip                       : false,
                enableDelete                      : false,
                highlightDependenciesOnEventHover : false
            }
        }
    };

    construct(config = {}) {
        const me = this;

        // Milestones reached live during Simulate, flaring once
        me.flaringMilestones = new Set();

        super.construct({
            ...config,
            project : {
                taskModelClass : ProgramTask,
                ...config.project
            },
            taskRenderer : me.renderPhase,
            features     : mergeFeature(config.features, 'dependencies', { renderer : args => renderDependency(me, args) })
        });
    }

    formatNow(date) {
        return formatDay(date);
    }

    get statusFilterStore() {
        return this.taskStore;
    }

    countsInLegend(taskRecord) {
        return isPhase(taskRecord);
    }

    // Derived status: done / not started from the simulated time, otherwise at risk when slipping past the
    // baseline, critical when on the critical path, else on track
    getStatus(taskRecord) {
        let liveStatus = 'ok';

        if (this.getVariance(taskRecord) > 0) {
            liveStatus = 'late';
        }
        else if (taskRecord.critical) {
            liveStatus = 'focus';
        }

        return deriveStatus(taskRecord, this.simNow, liveStatus);
    }

    // Duration weighted elapsed fraction of the phases of a parent. Progress is time based in this simulation, so it
    // is rolled up here instead of by the engine's `percentDone` rollup
    getRollupFraction(taskRecord) {
        const
            now     = this.simNow,
            phases  = taskRecord.allChildren.filter(isPhase),
            length  = phase => phase.endDate - phase.startDate,
            total   = phases.reduce((sum, phase) => sum + length(phase), 0),
            elapsed = phases.reduce((sum, phase) => sum + length(phase) * elapsedFraction(phase, now), 0);

        return total ? elapsed / total : 0;
    }

    // Task renderer: a milestone, a group's summary bar or a phase, see PhaseBars
    renderPhase({ taskRecord, renderData }) {
        if (taskRecord.milestone) {
            return renderMilestone(this, taskRecord, renderData);
        }

        if (taskRecord.isParent) {
            return renderSummaryBar(this, taskRecord, renderData);
        }

        return renderPhaseBar(this, taskRecord, renderData);
    }

    getDetail(taskRecord) {
        return getPhaseDetail(this, taskRecord);
    }

    //region Simulation

    /**
     * Repaints the bars and the live locked cells of the phases live or changing state between the two times,
     * milestones also while approaching, without re-rendering their rows. `refreshEvents()` runs the task renderer
     * again and re-renders the time axis cells only, `refreshRows()` would render whole rows
     */
    paintSimTick(now, old) {
        const
            me          = this,
            from        = Math.min(now, old),
            to          = Math.max(now, old),
            weekChanged = weekIndex(now, me.initialNow) !== weekIndex(old, me.initialNow),
            // A phase finishing (or no longer finished, going back on Reset) leaves (or joins) the live rows
            phaseEnded  = me.taskStore.allRecords.some(taskRecord => isPhase(taskRecord) &&
                me.isPhaseFinished(taskRecord, now) !== me.isPhaseFinished(taskRecord, old)),
            oldScale    = me.slipScale,
            changed     = new Set();

        // The slip chart scale follows the week and the live rows, recomputed before the slip cells render
        if (weekChanged || phaseEnded) {
            me.slipScale = null;
        }

        me.taskStore.forEach(taskRecord => {
            const lead = taskRecord.milestone ? approachMs : 0;

            if (!taskRecord.isRoot && taskRecord.startDate <= to + lead && taskRecord.endDate >= from) {
                me.markTaskTick(taskRecord, now, old);
                changed.add(taskRecord);
            }
        });

        // All visible bars in one render pass
        if (changed.size) {
            me.refreshEvents();
        }

        me.refreshLiveCells([...changed]);
        me.refreshSlipCells(oldScale, weekChanged, changed);
    }

    // Flags a task changing state between the two times: a milestone reached flares once, a phase starting or ending
    // flips its status colour and its group's
    markTaskTick(taskRecord, now, old) {
        const
            me         = this,
            { parent } = taskRecord;

        if (taskRecord.milestone && old < taskRecord.startDate && now >= taskRecord.startDate) {
            me.flaringMilestones.add(taskRecord);
            // Delayable timer, cleared on destroy
            me.setTimeout({
                fn : () => {
                    me.flaringMilestones.delete(taskRecord);
                    me.refreshEvents();
                },
                delay : flareMs
            });
        }

        if (me.crossesBoundary(taskRecord, now, old)) {
            me.markFlip(taskRecord.id);

            // Its group's rolled up state may change too
            if (parent && !parent.isRoot) {
                me.markFlip(parent.id);
            }
        }
    }

    resetSimulation() {
        this.flaringMilestones.clear();
        super.resetSimulation();
    }

    //endregion

    //region Selection & keyboard nudge

    get selectedTimeSpan() {
        const [taskRecord] = this.selectedRecords;

        return taskRecord && !taskRecord.milestone ? taskRecord : null;
    }

    clearTimeSpanSelection() {
        this.deselectAll();
    }

    // A day per step
    nudge(days) {
        const taskRecord = this.selectedTimeSpan;

        if (!taskRecord || this.readOnly) {
            return false;
        }

        // Moving a task with the engine sets a "start no earlier than" constraint, successors are pushed
        taskRecord.setStartDate(DateHelper.add(taskRecord.startDate, days, 'day'), true);

        return true;
    }

    //endregion
}

ProgramGantt.initClass();
