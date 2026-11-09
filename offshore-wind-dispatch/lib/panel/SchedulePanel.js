import { Container } from '@bryntum/core-enterprise';
import { projectData } from '../model/TripData.js';
import { legendHtml } from '../TitleBars.js';
import { toDate } from '../util/Time.js';
// Also registers the widget types used below
import '../TeamTray.js';
import '../ForecastNotice.js';
import '../schedule/DispatchScheduler.js';

/**
 * The schedule half of the app: its title bar, the teams waiting at the port, the forecast notice, the vessels and
 * helicopters on the day's timeline (DispatchScheduler) and the legend under it. On a phone it is the Schedule tab.
 *
 * The scheduler runs from today 06:00 to 18:00 over the vessels, the trips with their legs nested in them and the
 * dependency of the farm data.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 */
export default class SchedulePanel extends Container {
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
        // Its tab's text on a phone
        title  : 'Schedule',
        flex   : 1,
        layout : 'vbox'
    };

    construct(config) {
        const
            { dispatch, data } = config,
            { site, day }      = dispatch;

        super.construct({
            ...config,
            items : {
                scheduleBar : { type : 'widget', cls : 'ow-panel-bar' },
                tray        : { type : 'teamtray', port : site.portShort ?? site.port },
                notice      : { type : 'forecastnotice' },
                scheduler   : {
                    type      : 'dispatchscheduler',
                    flex      : 1,
                    dispatch,
                    startDate : toDate(day.dayStart * 60),
                    endDate   : toDate(day.dayEnd * 60),
                    project   : projectData(data)
                },
                legend : { type : 'widget', cls : 'ow-legend', html : legendHtml }
            }
        });
    }
}

SchedulePanel.initClass();
