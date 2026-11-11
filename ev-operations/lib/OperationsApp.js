import { EventHelper, Panel, Responsive, StringHelper } from '@bryntum/core-enterprise';
import './DetailPanel.js';
import './SimulationControls.js';
import './StatusKey.js';
import './StatusLegend.js';

/**
 * The app shell: a toolbar with the view switch, the heading and the simulation controls, the views in a card layout,
 * the detail panel below them and one status legend per view at the bottom.
 *
 * The detail panel shows the selected event / task. Only a click (after `detailClickDelay`, which a double-click into
 * the editor cancels) or a keyboard selection opens it, a drag or a resize selects without opening it. Clearing the
 * selection or the close button closes it.
 *
 * Below 700px wide the app is `compact` (the Responsive mixin): short view tabs, icon-only simulation controls, no
 * heading, and the detail panel overlays the timeline.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/widget/Panel
 * https://bryntum.com/docs/api/Core/layout/Card
 * https://bryntum.com/docs/api/Core/widget/mixin/Responsive
 */
export default class OperationsApp extends Panel.mixin(Responsive) {
    static $name = 'OperationsApp';

    static type = 'operationsapp';

    static configurable = {
        /**
         * The views by ref, view configs each with a `scenario` (see SimulationClock#config-scenario)
         * @config {Object<String,Object>}
         */
        viewConfigs : null,

        /**
         * A click opens the detail panel after this delay (ms), which a double-click (the editor) cancels
         * @config {Number}
         */
        detailClickDelay : 300,

        /**
         * `true` at phone widths, set by the `responsive` states
         * @prp {Boolean}
         */
        compact : null,

        responsive : {
            small : { when : 700, compact : true },
            '*'   : { compact : false }
        },

        cls     : 'ev-app',
        // Styles the body without reaching into the panel's internal markup, see tokens.css
        bodyCls : 'ev-app-body',
        layout  : 'vbox'
    };

    construct(config) {
        const
            me      = this,
            entries = Object.entries(config.viewConfigs);

        // `true` while the panel is open, see refreshDetail()
        me.detailOpen  = false;
        me.detailTimer = null;
        // `true` while the editor drawer replaces the detail panel
        me.editing     = false;
        // 'key' or 'pointer', the last input in the views, see onSelectionChange()
        me.lastInput   = null;

        super.construct({
            ...config,
            tbar  : me.buildToolbar(entries),
            items : {
                views  : me.buildViews(entries),
                detail : {
                    type      : 'detailpanel',
                    listeners : {
                        close   : 'onDetailClose',
                        thisObj : me
                    }
                }
            },
            bbar : me.buildLegendBar(entries)
        });

        me.bindViews();
    }

    /**
     * The toolbar: the view switch, the heading of the active view and its simulation controls
     * @param {Array} entries `[ref, viewConfig]` pairs of the views
     * @returns {Object} Toolbar config
     */
    buildToolbar(entries) {
        return {
            cls   : 'ev-toolbar',
            items : {
                // Segmented control switching the views, the theme's padded button group
                viewSwitch : {
                    type        : 'buttongroup',
                    flex        : 'none',
                    cls         : 'ev-view-switch',
                    rendition   : 'padded',
                    toggleGroup : true,
                    items       : entries.map(([ref, { scenario }], index) => ({
                        ref      : `${ref}Tab`,
                        text     : scenario.tab,
                        pressed  : index === 0,
                        onToggle : ({ pressed }) => pressed && this.showView(ref)
                    }))
                },
                // Gives way on narrow screens, the other items keep their size
                heading : {
                    type : 'widget',
                    cls  : 'ev-heading',
                    flex : '0 1 auto'
                },
                spacer   : '->',
                // Reset and Simulate, for the active view
                controls : {
                    type : 'simulationcontrols',
                    flex : 'none'
                }
            }
        };
    }

    /**
     * The views in a card layout, each wired to the detail panel
     * @param {Array} entries `[ref, viewConfig]` pairs of the views
     * @returns {Object} Container config
     */
    buildViews(entries) {
        return {
            type   : 'container',
            // Divider below the toolbar
            cls    : 'ev-views',
            flex   : 1,
            layout : {
                type              : 'card',
                animateCardChange : false
            },
            items : Object.fromEntries(entries.map(([ref, viewConfig]) => [ref, {
                ...viewConfig,
                listeners : {
                    ...viewConfig.listeners,
                    // Scheduler views
                    eventSelectionChange : 'onSelectionChange',
                    eventClick           : 'onTimeSpanClick',
                    // Gantt view, a click on the bar or on the row
                    selectionChange      : 'onSelectionChange',
                    taskClick            : 'onTimeSpanClick',
                    cellClick            : 'onViewCellClick',
                    // The editor drawer replaces the detail panel while open, one detail surface at a time
                    beforeTaskEdit       : 'onBeforeEdit',
                    afterTaskEdit        : 'onEditEnd',
                    taskEditCanceled     : 'onEditEnd',
                    // The open detail panel follows the simulated time
                    simTick              : 'onViewSimTick',
                    thisObj              : this
                }
            }]))
        };
    }

    /**
     * Pinned below the detail panel: one status legend per view (each keeps its own filter), the active one shown. The
     * scheduler views add a key for the blocked time hatches after it
     * @param {Array} entries `[ref, viewConfig]` pairs of the views
     * @returns {Object} Toolbar config
     */
    buildLegendBar(entries) {
        return {
            cls   : 'ev-legend-bar',
            items : Object.fromEntries(entries.flatMap(([ref, { scenario }], index) => [
                [`${ref}Legend`, {
                    type   : 'statuslegend',
                    hidden : index > 0
                }],
                // A null item is skipped, views without blocked time get no key
                [`${ref}Key`, scenario.blockedKey ? {
                    type     : 'statuskey',
                    hidden   : index > 0,
                    keyItems : scenario.blockedKey
                } : null]
            ]))
        };
    }

    // Binds the legends, the simulation controls and the detail panel to the views
    bindViews() {
        const
            me                  = this,
            { views, controls } = me.widgetMap;

        // Tells a keyboard selection from a pointer one, see onSelectionChange()
        EventHelper.on({
            element     : views.element,
            capture     : true,
            pointerdown : () => me.lastInput = 'pointer',
            keydown     : () => me.lastInput = 'key',
            thisObj     : me
        });

        me.eachView((view, ref) => {
            // Bind each legend to its view
            me.widgetMap[`${ref}Legend`].view = view;

            // Keep the detail panel in sync after drag, resize, nudge and engine rescheduling
            view.project.on({
                dataReady : () => view === me.activeView && me.refreshDetail(),
                thisObj   : me
            });
        });

        controls.view = me.activeView;
        me.refreshHeading();
    }

    eachView(fn) {
        Object.keys(this.viewConfigs).forEach(ref => fn(this.widgetMap.views.widgetMap[ref], ref));
    }

    /**
     * The view shown
     * @property {Scheduler.view.Scheduler|Gantt.view.Gantt}
     */
    get activeView() {
        return this.widgetMap.views.layout.activeItem;
    }

    /**
     * Loads the data of all views. The time axes are configured, the active view is already scrolled to now
     * @returns {Promise}
     */
    loadViews() {
        const loads = [];

        this.eachView(view => loads.push(view.project.load()));

        return Promise.all(loads);
    }

    /**
     * Only the active view simulates, switching pauses it. Showing the card paints the view, which scrolls it to now
     * @param {String} ref
     */
    showView(ref) {
        const
            me                  = this,
            { views, controls } = me.widgetMap,
            view                = views.widgetMap[ref];

        me.activeView.simulating = false;
        me.clearTimeout(me.detailTimer);
        // A switch never opens the panel, the next click or keyboard selection in the new view does
        me.detailOpen           = false;
        views.layout.activeItem = view;
        controls.view           = view;

        me.refreshHeading();
        me.refreshDetail();
    }

    // Short view tabs, icon-only controls and no heading on narrow screens. The detail panel overlays, see detail.css
    updateCompact(compact) {
        const
            me            = this,
            { widgetMap } = me;

        me.element.classList.toggle('ev-compact', compact);

        if (widgetMap.heading) {
            widgetMap.controls.compact = compact;

            me.eachView((view, ref) => {
                const { tab, shortTab = tab } = view.scenario;

                widgetMap[`${ref}Tab`].text = compact ? shortTab : tab;
            });

            // Last, hiding the heading makes the toolbar check its overflow again, with the new labels
            widgetMap.heading.hidden = compact;
        }
    }

    refreshHeading() {
        const
            me                 = this,
            view               = me.activeView,
            { title, summary } = view.scenario;

        me.widgetMap.heading.html = StringHelper.xss`<span class="ev-title">${title}</span><span class="ev-summary">${summary}</span>`;

        me.eachView((each, ref) => {
            const
                legend = me.widgetMap[`${ref}Legend`],
                key    = me.widgetMap[`${ref}Key`],
                hidden = each !== view;

            legend.hidden = hidden;

            // No key for views without blocked time, its null bbar item was skipped
            if (key) {
                key.hidden = hidden;
            }
        });
    }

    /**
     * The open panel follows the selection, also while dragging. No selection closes it
     */
    refreshDetail() {
        const
            me       = this,
            view     = me.activeView,
            timeSpan = view.selectedTimeSpan;

        if (!timeSpan) {
            me.detailOpen = false;
            me.clearTimeout(me.detailTimer);
        }

        me.widgetMap.detail.detail = me.detailOpen && timeSpan && !me.editing ? view.getDetail(timeSpan) : null;
    }

    /**
     * A keyboard selection opens the panel. A pointer one (a drag, a resize, or the mousedown of a click) does not,
     * the click itself does, see onTimeSpanClick(). Neither `eventKeyDown` nor `taskKeyDown` can tell: the Scheduler
     * navigator handles the arrow keys before `eventKeyDown` would fire, and `taskKeyDown` fires before the selection
     * moves, so the last input type is tracked instead
     */
    onSelectionChange() {
        if (this.lastInput === 'key') {
            this.detailOpen = true;
        }

        this.refreshDetail();
    }

    onTimeSpanClick() {
        const me = this;

        if (!me.detailOpen) {
            me.clearTimeout(me.detailTimer);
            me.detailTimer = me.setTimeout({
                fn : () => {
                    me.detailOpen = true;
                    me.refreshDetail();
                },
                delay : me.detailClickDelay
            });
        }
    }

    // A Gantt row click opens the panel too, for the selected phase
    onViewCellClick({ source, record }) {
        if (record === source.selectedTimeSpan) {
            this.onTimeSpanClick();
        }
    }

    // A double-click cancels the pending open of its first click
    onBeforeEdit() {
        this.clearTimeout(this.detailTimer);
        this.trackEditing(true);
    }

    onEditEnd() {
        this.trackEditing(false);
    }

    trackEditing(editing) {
        this.editing = editing;
        this.refreshDetail();
    }

    onViewSimTick({ source }) {
        if (source === this.activeView && source.selectedTimeSpan) {
            this.refreshDetail();
        }
    }

    clearSelection() {
        this.activeView.clearTimeSpanSelection();
        this.refreshDetail();
    }

    onDetailClose() {
        // Focus moves back to the timeline, the panel's close button is hidden as it closes
        const refocus = this.widgetMap.detail.containsFocus;

        this.clearSelection();

        if (refocus) {
            this.activeView.focus();
        }
    }
}

OperationsApp.initClass();
