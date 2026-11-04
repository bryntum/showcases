import { EventHelper } from '@bryntum/core-enterprise';

/**
 * The simulated clock of a view: the scenario's "now" (not the wall clock), playing and pausing it, and following it
 * with the timeline. Following pauses while the user scrolls the now line out of view.
 */

const
    // Each simulation tick advances the simulated now by the scenario's `step`
    tickMs    = 80,
    // The now line is kept at this fraction of the visible schedule
    nowAnchor = 0.3;

export default Target => class SimulationClock extends Target {
    static $name = 'SimulationClock';

    static configurable = {
        /**
         * Scenario meta data: `{ tab, title, summary, legend, initialNow, step, liveColumns }`, plus `tightGap`,
         * `shift`, `liveAllRows` and `blockedKey` for the scheduler views. `legend` holds a label per status key
         * @config {Object}
         */
        scenario : null,

        /**
         * The simulated current time
         * @prp {Date}
         */
        simNow : null,

        /**
         * `true` while the simulation plays. Status changes animate only then, see SimulatedView#function-markFlip
         * @prp {Boolean}
         */
        simulating : false
    };

    construct(config) {
        const me = this;

        super.construct(config);

        me.simNow = me.simNow || me.initialNow;

        me.on({
            horizontalScroll       : 'onClockTimelineScroll',
            // Scrolled to now as it is shown, before the browser renders a frame at another position
            paint                  : 'scrollToSimNow',
            // A timeline without width when painted (the locked columns filled a phone) scrolls once it gets one
            timelineViewportResize : ({ width, oldWidth }) => !oldWidth && width && me.scrollToSimNow(),
            thisObj                : me
        });

        me.listenToUserInput();
    }

    // Scrolling the timeline by hand pauses following the now line, see advance(). A hidden tab pauses the simulation
    listenToUserInput() {
        EventHelper.on({
            element          : this.element,
            wheel            : 'onUserScrollInput',
            touchstart       : 'onUserScrollInput',
            keydown          : 'onUserScrollInput',
            pointerdown      : 'onUserPointerDown',
            pointermove      : 'onUserPointerMove',
            // A context menu or another window can swallow the release
            contextmenu      : 'clearPointerHeld',
            pointerup        : { element : document, handler : 'clearPointerHeld', capture : true },
            pointercancel    : { element : document, handler : 'clearPointerHeld', capture : true },
            blur             : { element : window, handler : 'clearPointerHeld' },
            visibilitychange : { element : document, handler : 'onVisibilityChange' },
            passive          : true,
            thisObj          : this
        });
    }

    changeSimNow(now) {
        return now ? new Date(now) : now;
    }

    get initialNow() {
        return new Date(this.scenario.initialNow);
    }

    get canReset() {
        return this.simNow > this.initialNow;
    }

    /**
     * Half the width (px) of the now marker centred on the now line, the simulation stops where it still fits. None
     * here, see NowMarker
     * @property {Number}
     */
    get nowMarkerHalfWidth() {
        return 0;
    }

    /**
     * The simulation stops where the now marker still fits inside the time axis. A line exactly at its end would not
     * render
     */
    get simulationEnd() {
        const { endDate, timeAxisViewModel } = this;

        return new Date(endDate - this.nowMarkerHalfWidth / timeAxisViewModel.getDistanceForDuration(1));
    }

    get simulationEnded() {
        return this.simNow >= this.simulationEnd;
    }

    // True when the time span starts or ends between the two times
    crossesBoundary(timeSpan, now, old) {
        const
            from = Math.min(now, old),
            to   = Math.max(now, old);

        return [timeSpan.startDate, timeSpan.endDate].some(date => date > from && date <= to);
    }

    //region Play and pause

    /**
     * Plays or pauses the simulation. Playing again once it has ended restarts it
     */
    toggleSimulation() {
        const me = this;

        if (!me.simulating && me.simulationEnded) {
            me.resetSimulation();
        }

        me.simulating = !me.simulating;
    }

    updateSimulating(simulating) {
        const me = this;

        me.element.classList.toggle('ev-simulating', simulating);

        if (simulating) {
            me.pointerHeld     = false;
            me.simulationTimer = me.setInterval(() => me.simulationTick(), tickMs, 'simulation');
        }
        else if (me.simulationTimer) {
            me.clearInterval(me.simulationTimer);
            me.simulationTimer = null;
        }

        if (!me.isConstructing) {
            /**
             * Fired when the simulation starts or pauses, also when it reaches its end or the tab is hidden
             * @event simulatingChange
             * @param {Boolean} simulating
             */
            me.trigger('simulatingChange', { simulating });
        }
    }

    simulationTick() {
        // The clock holds while a bar is pressed, dragged or resized, so the bar stays under the pointer
        if (!this.isDraggingTimeSpan && !this.pointerHeld && !this.advance()) {
            this.simulating = false;
        }
    }

    /**
     * `true` while a bar is being dragged or resized
     * @property {Boolean}
     */
    get isDraggingTimeSpan() {
        const { eventDrag, eventResize, taskDrag, taskResize } = this.features;

        return Boolean(eventDrag?.isDragging || taskDrag?.isDragging ||
            eventResize?.isResizing || taskResize?.isResizing);
    }

    /**
     * Advances one step, `false` at the end. The timeline scrolls to hold the now line at ~30% of the view, pausing
     * while the user has scrolled the line out of view
     */
    advance() {
        const
            me             = this,
            { scrollable } = me.timeAxisSubGrid,
            width          = scrollable.clientWidth,
            anchor         = Math.round(width * nowAnchor);

        me.simNow = Math.min(me.simNow.getTime() + me.scenario.step, me.simulationEnd.getTime());

        const
            // Distance from the start edge of the time axis, the same in RTL, as the scroller's `x`
            x       = me.getCoordinateFromDate(me.simNow, { local : true, ignoreRTL : true }),
            screenX = x - scrollable.x,
            visible = screenX >= 0 && screenX <= width;

        // Paused by a user scroll while the line is out of view. Once it is back in view, following resumes
        me.followPaused = !visible && (me.followPaused || me.userScrolled);
        me.userScrolled = false;

        if (!me.followPaused && (screenX > anchor || screenX < 0)) {
            scrollable.x = x - anchor;
        }

        // Scrolls not matching this one are by someone else, see onClockTimelineScroll
        me.followScrollX = Math.round(scrollable.x);

        return !me.simulationEnded;
    }

    resetSimulation() {
        const me = this;

        me.simulating   = false;
        me.simNow       = me.initialNow;
        me.followPaused = false;
        me.scrollToSimNow();
    }

    /**
     * Scroll the timeline to put the simulated now at ~30% of the visible schedule. Applied synchronously once
     * painted, a hidden view applies it when shown
     */
    scrollToSimNow() {
        const { simNow, timeAxisSubGrid } = this;

        this.visibleDate = { date : simNow, block : 'start', edgeOffset : Math.round(timeAxisSubGrid.width * nowAnchor) };
    }

    //endregion

    //region User input

    onUserScrollInput() {
        this.lastUserInput = performance.now();
    }

    // A press on the timeline holds the clock until the drag starts, so the bar does not scroll from under the pointer
    onUserPointerDown(event) {
        this.pointerHeld = event.button === 0 && this.timeAxisSubGrid.element.contains(event.target);
        this.onUserScrollInput();
    }

    onUserPointerMove(event) {
        if (event.buttons) {
            this.onUserScrollInput();
        }
        else {
            this.pointerHeld = false;
        }
    }

    clearPointerHeld() {
        this.pointerHeld = false;
    }

    onVisibilityChange() {
        if (document.hidden) {
            this.simulating  = false;
            this.pointerHeld = false;
        }
    }

    // A scroll we did not cause ourselves, shortly after the user interacted with the timeline
    onClockTimelineScroll({ scrollX }) {
        const me = this;

        if (Math.round(scrollX) !== me.followScrollX && performance.now() - (me.lastUserInput ?? -Infinity) < 1000) {
            me.userScrolled = true;
        }
    }

    //endregion
};
