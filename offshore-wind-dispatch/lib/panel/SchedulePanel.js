import { DateHelper, Panel, StringHelper } from '@bryntum/core-enterprise';
import { projectData } from '../model/TripData.js';
import { iconConfig } from '../util/Icons.js';
// Also registers the widget types used below
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

const link = (href, text) => ({ tag : 'a', href, target : '_blank', rel : 'noopener', text });

// The footer under the rows: what the marks mean, and the products the page is built with. Swatches in scheduler.css,
// the work and risk ones in frame.css
function legendHtml(view) {
    const item = (kind, text, mark = '') => ({
        tag      : 'span',
        class    : `ow-l ow-l-${kind}`,
        children : [{ tag : 'i', class : mark && `ow-mark-${mark}` }, text]
    });

    return view === 'week' ? [
        item('cell', 'Trips: times, seats, turbines; bar = seats used', 'work'),
        item('free', 'Workable, free'),
        item('nogo', 'No-go'),
        { tag : 'span', class : 'ow-legend-credit', text : 'Drag a crew onto a free cell to plan it' }
    ] : [
        item('work', 'Work', 'work'),
        item('transit', 'Transit'),
        item('dependency', 'Must finish first'),
        item('risk', 'At risk', 'risk'),
        item('nogo', 'Weather no-go'),
        {
            tag      : 'span',
            class    : 'ow-legend-credit',
            children : [
                'Schedule: ', link('https://bryntum.com/products/scheduler/', 'Bryntum Scheduler'),
                ' · Wave height: ', link('https://www.ag-grid.com/charts/', 'AG Charts')
            ]
        }
    ];
}

/**
 * The schedule half of the app: the forecast notice, the Day view or the Week view, and the legend. Its header holds
 * the title and the fleet, the next forecast's button and the Day | Week toggle (header `tools`). The notice's buttons
 * call the app's `undoForecast` and `reviewNext` (`up.`).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel#config-tools
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/ButtonGroup
 */
export default class SchedulePanel extends Panel {
    static $name = 'SchedulePanel';

    static type = 'schedulepanel';

    static configurable = {
        dispatch : null,

        // The parsed data/farm.json
        data : null,

        // Set by PhoneLayout. The header then holds only the next forecast's button, the legend goes
        phone : false,

        cls    : 'ow-schedule',
        flex   : 1,
        layout : 'vbox',
        tools  : {
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
                cls         : 'ow-view-toggle',
                rendition   : 'padded',
                toggleGroup : true,
                items       : [
                    { ref : 'day', text : 'Day', pressed : true, onToggle : 'up.onViewToggle' },
                    { ref : 'week', text : 'Week', onToggle : 'up.onViewToggle' }
                ]
            }
        }
    };

    construct(config) {
        const
            { dispatch, data } = config,
            { day, midnight }  = dispatch;

        super.construct({
            ...config,
            title : `Vessels &amp; helicopters <span class="ow-panel-count">${StringHelper.encodeHtml(fleetCount(dispatch.vessels))}</span>`,
            items : {
                notice : {
                    type   : 'container',
                    cls    : 'ow-notice',
                    hidden : true,
                    role   : 'status',
                    layout : { type : 'hbox', align : 'center' },
                    items  : {
                        text : { type : 'widget', cls : 'ow-notice-text' },
                        // A Button's text takes DomConfigs: the showcase's SVG icon goes in with the word
                        undo : {
                            type      : 'button',
                            rendition : 'text',
                            cls       : 'ow-notice-undo',
                            text      : [iconConfig('arrow-undo'), 'Undo'],
                            onClick   : 'up.undoForecast'
                        },
                        review : {
                            type      : 'button',
                            rendition : 'filled',
                            color     : 'b-blue',
                            cls       : 'ow-notice-primary',
                            onClick   : 'up.reviewNext'
                        }
                    }
                },
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
                legend : { type : 'widget', cls : 'ow-legend' }
            }
        });

        const
            { board, scheduler, legend } = this.widgetMap,
            { view }                     = this.tools;

        // A header tool is rendered on its own, without its children: the toggle's buttons are rendered into it
        view.items.forEach(button => button.render(view.contentElement));

        // The Week view follows the trips of the Day view's project
        board.plan  = scheduler.project;
        legend.html = legendHtml('day');
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
            { day, week }                = this.tools.view.widgetMap,
            isWeek                       = view === 'week',
            button                       = isWeek ? week : day;

        // Called from code (a click on a day of the week): pressing the toggle shows the view through onViewToggle
        if (!button.pressed) {
            button.pressed = true;

            return;
        }

        scheduler.hidden = isWeek;
        board.hidden     = !isWeek;
        legend.html      = legendHtml(view);
        this.refreshBar();
    }

    /**
     * Shows the notice of a forecast that changed the plan
     * @param {Object} options
     * @param {String} options.headline
     * @param {String} options.detail
     * @param {Number} options.changes The trips changed that are still on the day, to review
     */
    showNotice({ headline, detail, changes }) {
        const { notice, text, review, undo } = this.widgetMap;

        text.html     = [iconConfig('warning'), { tag : 'span', children : [{ tag : 'b', text : headline }, ` ${detail}`] }];
        review.text   = `Review ${changes} ${changes === 1 ? 'change' : 'changes'}`;
        review.hidden = !changes;
        undo.hidden   = notice.hidden = false;
    }

    updatePhone() {
        if (this.tools) {
            this.refreshBar();
        }
    }

    refreshBar() {
        const
            me                 = this,
            phone              = Boolean(me.phone),
            { forecast, view } = me.tools,
            next               = me.dispatch.nextForecast;

        forecast.hidden = !next;
        view.hidden     = phone;
        // On a phone the header holds the forecast's button alone, and goes without one
        me.element.classList.toggle('ow-bar-empty', phone && !next);
        me.widgetMap.legend.hidden = phone;

        if (next) {
            // A Button's text takes DomConfigs. One span keeps the space before the bold part
            forecast.text = { tag : 'span', children : [`Forecast ${next.issued} is in · `, { tag : 'b', text : 'Re-plan' }] };
        }
    }
}

SchedulePanel.initClass();
