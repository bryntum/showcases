import { DateHelper, Panel } from '@bryntum/core-enterprise';
import { projectData } from '../model/TripData.js';
// Also registers the widget types used below
import '../ForecastNotice.js';
import '../Legend.js';
import '../schedule/DispatchScheduler.js';
import '../week/WeekBoard.js';

// "4 CTV · 1 SWATH · 3 heli": a vessel's type is the first part of its `kind`
function fleetCount(vessels) {
    const counts = new Map();

    vessels.forEach(({ mode, kind }) => {
        const type = mode === 'heli' ? 'heli' : kind.split(' · ')[0];

        counts.set(type, (counts.get(type) ?? 0) + 1);
    });

    return [...counts].map(([type, count]) => `${count} ${type}`).join(' · ');
}

/**
 * The schedule half of the app: the forecast notice, the Day view or the Week view, and the legend, under a tbar that
 * is the title bar. Its `header` is off; its `title` is only the tab's text on a phone.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/ButtonGroup
 */
export default class SchedulePanel extends Panel {
    static $name = 'SchedulePanel';

    static type = 'schedulepanel';

    static configurable = {
        dispatch : null,

        // The parsed data/farm.json
        data : null,

        // Set by PhoneLayout. The title bar then holds only the next forecast's button, the legend goes
        phone : false,

        cls    : 'ow-schedule',
        flex   : 1,
        layout : 'vbox',
        title  : 'Schedule',
        header : false,
        tbar   : {
            cls   : 'ow-panel-bar',
            items : {
                title    : { type : 'widget', cls : 'ow-panel-title', html : 'Vessels &amp; helicopters' },
                count    : { type : 'widget', cls : 'ow-panel-count' },
                spacer   : '->',
                forecast : {
                    type      : 'button',
                    rendition : 'tonal',
                    cls       : 'ow-forecast-button',
                    hidden    : true,
                    onClick   : 'up.onForecastClick'
                },
                // The pressed button's ref is the view it shows
                view : {
                    type        : 'buttongroup',
                    rendition   : 'padded',
                    toggleGroup : true,
                    items       : {
                        day  : { text : 'Day', pressed : true, onToggle : 'up.onViewToggle' },
                        week : { text : 'Week', onToggle : 'up.onViewToggle' }
                    }
                }
            }
        }
    };

    construct(config) {
        const
            { dispatch, data } = config,
            { day, midnight }  = dispatch;

        super.construct({
            ...config,
            items : {
                notice    : { type : 'forecastnotice' },
                scheduler : {
                    type      : 'dispatchscheduler',
                    flex      : 1,
                    listeners : { paint : 'up.refreshBar' },
                    dispatch,
                    startDate : DateHelper.add(midnight, day.dayStart, 'hour'),
                    endDate   : DateHelper.add(midnight, day.dayEnd, 'hour'),
                    // The trips of the whole week, the Day view shows one day's
                    project   : projectData({ ...data, trips : dispatch.week.days.flatMap(({ trips }) => trips) },
                        index => dispatch.dateOf(index))
                },
                board  : { type : 'weekboard', flex : 1, hidden : true, dispatch },
                legend : { type : 'legend' }
            }
        });

        const { scheduler, board } = this.widgetMap;

        this.tbar.widgetMap.count.html = fleetCount(dispatch.vessels);
        // The Week view follows the trips of the Day view's project
        board.plan = scheduler.project;
    }

    onForecastClick() {
        this.trigger('forecast');
    }

    onViewToggle({ source, pressed }) {
        if (pressed) {
            this.showView(source.ref);
        }
    }

    /**
     * @param {'day'|'week'} view
     */
    showView(view) {
        const
            { scheduler, board, legend } = this.widgetMap,
            { day, week }                = this.tbar.widgetMap,
            isWeek                       = view === 'week',
            button                       = isWeek ? week : day;

        // Called from code (a click on a day of the week): pressing the toggle shows the view through onViewToggle
        if (!button.pressed) {
            button.pressed = true;

            return;
        }

        scheduler.hidden = isWeek;
        board.hidden     = !isWeek;
        legend.view      = view;
        this.refreshBar();
    }

    updatePhone() {
        if (this.tbar) {
            this.refreshBar();
        }
    }

    refreshBar() {
        const
            me                                       = this,
            { dispatch, tbar }                       = me,
            phone                                    = Boolean(me.phone),
            { title, count, spacer, forecast, view } = tbar.widgetMap,
            next                                     = dispatch.nextForecast;

        forecast.hidden = !next;
        tbar.hidden     = phone && !next;
        title.hidden    = count.hidden = spacer.hidden = view.hidden = phone;

        me.widgetMap.legend.hidden = phone;

        if (next) {
            // A Button's text takes DomConfigs. One span keeps the space before the bold part
            forecast.text = { tag : 'span', children : [`Forecast ${next.issued} is in · `, { tag : 'b', text : 'Re-plan' }] };
        }
    }
}

SchedulePanel.initClass();
