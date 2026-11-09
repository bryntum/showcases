import { Panel } from '@bryntum/core-enterprise';
import { projectData } from '../model/TripData.js';
import { toDate } from '../util/Time.js';
// Also registers the widget types used below
import '../TeamTray.js';
import '../IconButton.js';
import '../ForecastNotice.js';
import '../Legend.js';
import '../schedule/DispatchScheduler.js';

/**
 * The schedule half of the app: a Panel whose tbar holds the title, the next forecast's button, the Day and Week views
 * and their arrows, with the forecast notice, the vessels and helicopters on the day's timeline (DispatchScheduler),
 * its footer with the legend, and the crews waiting at the port under it. On a phone it is the Schedule tab.
 *
 * The scheduler runs from today 06:00 to 18:00 over the vessels, the trips with their legs nested in them and the
 * dependency of the farm data.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/ButtonGroup
 */
export default class SchedulePanel extends Panel {
    static $name = 'SchedulePanel';

    static type = 'schedulepanel';

    static configurable = {
        /**
         * The dispatcher's state, the weather windows and the clock
         * @config {DispatchState}
         */
        dispatch : null,

        /**
         * The parsed data/farm.json
         * @config {Object}
         */
        data : null,

        cls    : 'ow-schedule',
        flex   : 1,
        layout : 'vbox'
    };

    construct(config) {
        const
            { dispatch, data } = config,
            { site, day }      = dispatch,
            me                 = this,
            boats              = dispatch.vessels.filter(vessel => vessel.mode === 'vessel').length;

        super.construct({
            ...config,
            // Its tab's text on a phone, the tbar is the title bar
            title  : 'Schedule',
            header : false,
            tbar   : {
                cls   : 'ow-panel-bar',
                items : {
                    title : { type : 'widget', cls : 'ow-panel-title', html : 'Vessels &amp; helicopters' },
                    count : {
                        type : 'widget',
                        cls  : 'ow-panel-count',
                        html : `${boats} CTV · ${dispatch.vessels.length - boats} heli`
                    },
                    spacer   : '->',
                    // The next forecast, in: the one action that changes the plan, quiet and blue
                    forecast : {
                        type    : 'button',
                        cls     : 'ow-forecast-button',
                        hidden  : true,
                        onClick : () => me.trigger('forecast')
                    },
                    // Earlier: two hours along the day, a week in the Week view
                    previous : {
                        type      : 'button',
                        cls       : 'ow-nudge',
                        icon      : 'b-icon b-icon-previous',
                        ariaLabel : 'Earlier',
                        onClick   : () => me.nudge(-1)
                    },
                    view : {
                        type  : 'buttongroup',
                        items : {
                            day : {
                                text        : 'Day',
                                pressed     : true,
                                toggleGroup : 'view',
                                onToggle    : ({ pressed }) => pressed && me.showView('day')
                            },
                            week : {
                                text        : 'Week',
                                toggleGroup : 'view',
                                onToggle    : ({ pressed }) => pressed && me.showView('week')
                            }
                        }
                    },
                    next : {
                        type      : 'button',
                        cls       : 'ow-nudge',
                        icon      : 'b-icon b-icon-next',
                        ariaLabel : 'Later',
                        onClick   : () => me.nudge(1)
                    }
                }
            },
            items : {
                notice    : { type : 'forecastnotice' },
                scheduler : {
                    type      : 'dispatchscheduler',
                    flex      : 1,
                    listeners : {
                        paint                  : 'up.onSchedulerPaint',
                        timelineViewportResize : 'up.refreshBar'
                    },
                    dispatch,
                    startDate : toDate(day.dayStart * 60),
                    endDate   : toDate(day.dayEnd * 60),
                    project   : projectData(data)
                },
                // The schedule's footer, then the crews waiting under the schedule
                legend : { type : 'legend' },
                tray   : { type : 'teamtray', port : site.portShort ?? site.port }
            }
        });
    }

    // The scheduler paints after the panel: the arrows follow what it can show, its scrolling and its width
    onSchedulerPaint() {
        const { scheduler } = this.widgetMap;

        scheduler.timeAxisSubGrid.scrollable.on({ scroll : 'refreshBar', thisObj : this });
        this.refreshBar();
    }

    /**
     * Moves the schedule earlier or later, see DispatchScheduler#nudge
     * @param {Number} direction -1 or 1
     */
    nudge(direction) {
        this.widgetMap.scheduler.nudge(direction);
        this.refreshBar();
    }

    /**
     * Shows the Day or the Week view of the schedule
     * @param {'day'|'week'} view
     */
    showView(view) {
        this.widgetMap.scheduler.view = view;
        this.refreshBar();
    }

    /**
     * Updates the tbar: the next forecast's button, and the arrows, off at the ends of what can be shown
     */
    refreshBar() {
        const
            { dispatch }                  = this,
            { scheduler }                 = this.widgetMap,
            { forecast, previous, next : later } = this.tbar.widgetMap,
            next                          = dispatch.nextForecast;

        forecast.hidden = !next;

        if (next) {
            forecast.text = `Forecast ${next.issued} is in · Re-plan`;
        }

        if (scheduler.isPainted) {
            const can = scheduler.canNudge;

            previous.disabled = !can.previous;
            later.disabled    = !can.next;
        }
    }
}

SchedulePanel.initClass();
