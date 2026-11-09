import { Panel } from '@bryntum/core-enterprise';
import { projectData } from '../model/TripData.js';
import { toDate } from '../util/Time.js';
// Also registers the widget types used below
import '../IconButton.js';
import '../ForecastNotice.js';
import '../Legend.js';
import '../schedule/DispatchScheduler.js';

/**
 * The schedule half of the app: a Panel whose tbar holds the title, the next forecast's button and the Day | Week
 * toggle, with the forecast notice, the vessels and helicopters on the day's timeline (DispatchScheduler),
 * and its footer with the legend. The crews waiting at the port sit under it, on the page (DispatchApp). On a phone
 * it is the Schedule tab.
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
            { day }            = dispatch,
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
                    }
                }
            },
            items : {
                notice    : { type : 'forecastnotice' },
                scheduler : {
                    type      : 'dispatchscheduler',
                    flex      : 1,
                    listeners : {
                        paint : 'up.refreshBar'
                    },
                    dispatch,
                    startDate : toDate(day.dayStart * 60),
                    endDate   : toDate(day.dayEnd * 60),
                    project   : projectData(data)
                },
                // The schedule's footer
                legend : { type : 'legend' }
            }
        });
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
     * Updates the tbar: the next forecast's button
     */
    refreshBar() {
        const
            { dispatch } = this,
            { forecast } = this.tbar.widgetMap,
            next         = dispatch.nextForecast;

        forecast.hidden = !next;

        if (next) {
            const text = `Forecast ${next.issued} is in · Re-plan`;

            if (forecast.text !== text) {
                forecast.text = text;
                // The action in semibold, the button's label kept as it is (a Button has no markup in its text)
                const label = forecast.element.querySelector('.b-button-label');

                label?.replaceChildren(`Forecast ${next.issued} is in · `,
                    Object.assign(document.createElement('b'), { textContent : 'Re-plan' }));
            }
        }
    }
}

SchedulePanel.initClass();
