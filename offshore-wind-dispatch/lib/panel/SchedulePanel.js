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

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

// The footer under the rows, the panel's bbar: what the marks mean, a swatch and a name each (scheduler.css; the work
// and risk swatches in frame.css), and the products the page is built with
function legendItems(view) {
    const item = (kind, text, mark = '') => ({
        type : 'widget',
        cls  : `ow-l ow-l-${kind}`,
        html : `<i class="${mark && `ow-mark-${mark}`}"></i>${text}`
    });

    return view === 'week' ? [
        item('cell', 'Trips: times, seats, turbines; bar = seats used', 'work'),
        item('free', 'Workable, free'),
        item('nogo', 'No-go'),
        '->',
        { type : 'widget', cls : 'ow-legend-credit', html : 'Drag a crew onto a free cell to plan it' }
    ] : [
        item('work', 'Work', 'work'),
        item('transit', 'Transit'),
        item('dependency', 'Must finish first'),
        item('risk', 'At risk', 'risk'),
        item('nogo', 'Weather no-go'),
        '->',
        {
            type : 'widget',
            cls  : 'ow-legend-credit',
            // In a span: the widget's flex box would drop the spaces round the links
            html : `<span>Schedule: ${link('https://bryntum.com/products/scheduler/', 'Bryntum Scheduler')} · Wave ` +
                `height: ${link('https://www.ag-grid.com/charts/', 'AG Charts')}</span>`
        }
    ];
}

/**
 * The schedule half of the app: the forecast notice, the Day view or the Week view, and the legend. Its header holds
 * the title and the fleet, the next forecast's button and the Day | Week toggle (header `strips`). The notice's buttons
 * call the app's `undoForecast` and `reviewNext` (`up.`).
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/widget/Panel#config-strips
 * https://bryntum.com/docs/api/Core/widget/ButtonGroup
 */
export default class SchedulePanel extends Panel {
    static $name = 'SchedulePanel';

    static type = 'schedulepanel';

    static configurable = {
        dispatch : null,

        // The parsed data/farm.json
        data : null,

        // Set by DispatchApp on a phone. The header then holds only the next forecast's button, the legend goes
        phone : false,

        cls    : 'ow-schedule',
        flex   : 1,
        layout : 'vbox',
        // Header strips (`dock : 'header'`), after the title: the higher the weight, the closer to it
        strips : {
            forecast : {
                type      : 'button',
                dock      : 'header',
                weight    : 2,
                rendition : 'tonal',
                cls       : 'ow-forecast-button',
                hidden    : true,
                onClick   : 'up.onForecastClick'
            },
            // The pressed button's ref is the view it shows
            view : {
                type        : 'buttongroup',
                dock        : 'header',
                weight      : 1,
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
                        // A Button's text takes DomConfigs: the showcase's SVG icon, named by its label and tooltip
                        undo : {
                            type      : 'button',
                            rendition : 'text',
                            cls       : 'ow-notice-undo',
                            text      : [iconConfig('arrow-undo')],
                            ariaLabel : 'Undo',
                            tooltip   : 'Undo the re-plan',
                            onClick   : 'up.undoForecast'
                        },
                        // Opens the next day on the trip the cut work went to
                        carry : {
                            type      : 'button',
                            rendition : 'tonal',
                            cls       : 'ow-notice-carry',
                            onClick   : 'up.showCarried'
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
                board : { type : 'weekboard', flex : 1, hidden : true, dispatch }
            },
            bbar : { cls : 'ow-legend', items : legendItems('day') }
        });

        const { board, scheduler } = this.widgetMap;

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
            { scheduler, board }         = this.widgetMap,
            { day, week }                = this.strips.view.widgetMap,
            isWeek                       = view === 'week',
            button                       = isWeek ? week : day;

        // Called from code (a click on a day of the week): pressing the toggle shows the view through onViewToggle
        if (!button.pressed) {
            button.pressed = true;

            return;
        }

        scheduler.hidden = isWeek;
        board.hidden     = !isWeek;
        this.bbar.removeAll();
        this.bbar.add(legendItems(view));
        this.refreshBar();
    }

    /**
     * Shows the notice of a forecast that changed the plan, two lines: the forecast, and what the re-plan did
     * @param {Object} options
     * @param {String} options.headline The forecast
     * @param {String} options.today What changed on the day, after the headline
     * @param {String} options.later Where the work cut went, what stays at risk; the second line
     * @param {TripModel|null} options.carried The trip of the next day the cut work went to
     * @param {Number} options.changes The trips changed that are still on the day, to review
     */
    showNotice({ headline, today, later, carried, changes }) {
        const { notice, text, review, carry, undo } = this.widgetMap;

        text.html     = [iconConfig('warning'), {
            tag      : 'span',
            children : [
                { class : 'ow-notice-line', children : [{ tag : 'b', class : 'ow-notice-head', text : headline }, today && ` ${today}`] },
                later ? { class : 'ow-notice-line', text : later } : null
            ]
        }];
        carry.text    = carried ? `Show on ${DateHelper.format(this.dispatch.dateOf(carried.day), 'dddd')}` : '';
        carry.hidden  = !carried;
        review.text   = `Review ${changes} ${changes === 1 ? 'change' : 'changes'} today`;
        review.hidden = !changes;
        undo.hidden   = notice.hidden = false;
    }

    updatePhone() {
        if (this.strips) {
            this.refreshBar();
        }
    }

    refreshBar() {
        const
            me                 = this,
            phone              = Boolean(me.phone),
            { forecast, view } = me.strips,
            next               = me.dispatch.nextForecast;

        forecast.hidden = !next;
        view.hidden     = phone;
        // On a phone the header holds the forecast's button alone, and goes without one
        me.element.classList.toggle('ow-bar-empty', phone && !next);
        me.bbar.hidden = phone;

        if (next) {
            // A Button's text takes DomConfigs. One span keeps the space before the bold part
            forecast.text = { tag : 'span', children : [`Forecast ${next.issued} is in · `, { tag : 'b', text : 'Re-plan' }] };
        }
    }
}

SchedulePanel.initClass();
