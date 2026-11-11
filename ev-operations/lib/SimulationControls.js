import { Container } from '@bryntum/core-enterprise';

// A button's label as its text, or as the tooltip of an icon-only button when compact
const labelConfig = (compact, label, icon) => compact ?
    { text : null, tooltip : label, icon } :
    { text : label, tooltip : null, icon };

/**
 * Reset and Simulate buttons for the active view. Follows the view's `simulatingChange` and `simTick` events:
 *
 * - Simulate reads Simulate, Pause or Resume, tonal while paused and filled while running
 * - Reset shows once the simulated time has moved. It comes first, so showing it grows the toolbar leftwards and
 *   Simulate keeps its place. Simulate has a min-width fitting its widest label (see toolbar.css), so it keeps its
 *   width
 * - `compact` shows icons only, the labels move to the tooltips
 *
 * Listeners on the view use `thisObj`, so they are removed when the controls are destroyed
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/widget/Container
 * https://bryntum.com/docs/api/Core/widget/Button#config-rendition
 */
export default class SimulationControls extends Container {
    static $name = 'SimulationControls';

    static type = 'simulationcontrols';

    static configurable = {
        /**
         * The view the buttons control, a view using the SimulatedView mixin
         * @config {Core.widget.Widget}
         */
        view : null,

        /**
         * Icon-only buttons, for narrow screens
         * @prp {Boolean}
         */
        compact : false,

        cls    : 'ev-controls',
        layout : 'hbox',

        items : {
            reset : {
                type      : 'button',
                rendition : 'outlined',
                text      : 'Reset',
                hidden    : true,
                onAction  : 'up.onResetClick'
            },
            simulate : {
                type      : 'button',
                cls       : 'ev-simulate',
                rendition : 'tonal',
                icon      : 'fa fa-play',
                text      : 'Simulate',
                onAction  : 'up.onSimulateClick'
            }
        }
    };

    updateView(view) {
        const me = this;

        me.detachViewListeners?.();
        me.detachViewListeners = view?.on({
            simulatingChange : 'syncButtons',
            // Reset shows once time has moved
            simTick          : 'onViewSimTick',
            thisObj          : me
        });

        me.syncButtons();
    }

    updateCompact() {
        this.syncButtons();
    }

    onSimulateClick() {
        this.view.toggleSimulation();
    }

    onResetClick() {
        this.view.resetSimulation();
        this.syncButtons();
    }

    onViewSimTick() {
        if (this.widgetMap.reset.hidden === this.view.canReset) {
            this.syncButtons();
        }
    }

    syncButtons() {
        const
            { view, widgetMap, compact } = this,
            { simulate, reset }          = widgetMap;

        if (!view || !simulate) {
            return;
        }

        const
            running = view.simulating,
            label   = running ? 'Pause' : (view.canReset && !view.simulationEnded ? 'Resume' : 'Simulate');

        Object.assign(simulate, labelConfig(compact, label, running ? 'fa fa-pause' : 'fa fa-play'));
        Object.assign(reset, labelConfig(compact, 'Reset', compact ? 'fa fa-rotate-left' : null));

        simulate.rendition = running ? 'filled' : 'tonal';
        reset.hidden       = !view.canReset;
    }
}

SimulationControls.initClass();
