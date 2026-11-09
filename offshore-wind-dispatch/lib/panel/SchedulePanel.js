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
 * The schedule half of the app: a Panel whose tbar holds the title, the next forecast's button and the zoom, with the
 * teams waiting at the port, the forecast notice, the vessels and helicopters on the day's timeline
 * (DispatchScheduler) and the legend under it. On a phone it is the Schedule tab.
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
                    // The next forecast, in: the one action that changes the plan
                    forecast : {
                        type    : 'iconbutton',
                        cls     : 'ow-forecast-button',
                        svg     : 'broadcast',
                        hidden  : true,
                        onClick : () => me.trigger('forecast')
                    },
                    zoom : {
                        type  : 'buttongroup',
                        items : {
                            zoomOut : { text : '−', ariaLabel : 'Zoom out', onClick : () => me.zoomTo(step => step - 1) },
                            zoomDay : { text : 'Day', toggleable : true, onClick : () => me.zoomTo(() => 0) },
                            zoomIn  : { text : '+', ariaLabel : 'Zoom in', onClick : () => me.zoomTo(step => step + 1) }
                        }
                    }
                }
            },
            items : {
                tray      : { type : 'teamtray', port : site.portShort ?? site.port },
                notice    : { type : 'forecastnotice' },
                scheduler : {
                    type      : 'dispatchscheduler',
                    flex      : 1,
                    dispatch,
                    startDate : toDate(day.dayStart * 60),
                    endDate   : toDate(day.dayEnd * 60),
                    project   : projectData(data)
                },
                legend : { type : 'legend' }
            }
        });
    }

    /**
     * Zooms the schedule, never past either limit
     * @param {Function} step Gets the current zoom step, returns the one to go to
     */
    zoomTo(step) {
        const { scheduler } = this.widgetMap;

        scheduler.zoomStep = Math.min(Math.max(step(scheduler.zoomStep), 0), scheduler.lastZoomStep);
        this.refreshBar();
    }

    /**
     * Updates the tbar: the next forecast's button, and the zoom buttons, − and + off at the limits of the zoom
     */
    refreshBar() {
        const
            { dispatch }                          = this,
            { scheduler }                         = this.widgetMap,
            { forecast, zoomOut, zoomDay, zoomIn } = this.tbar.widgetMap,
            next                                  = dispatch.nextForecast;

        forecast.hidden = !next;

        if (next) {
            forecast.text = `Forecast ${next.issued} is in`;
        }

        zoomOut.disabled = scheduler.zoomStep <= 0;
        zoomIn.disabled  = scheduler.zoomStep >= scheduler.lastZoomStep;
        zoomDay.pressed  = !scheduler.zoomStep;
    }
}

SchedulePanel.initClass();
