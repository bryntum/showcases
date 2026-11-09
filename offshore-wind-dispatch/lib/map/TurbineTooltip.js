import { Tooltip } from '@bryntum/core-enterprise';

/**
 * The tooltip of the map's turbines: a Bryntum Tooltip on the markers (`forSelector`), shown on hover and, with
 * `showForMarker()`, on keyboard focus. Its content comes from the `getHtml` the map passes, which asks the app for the
 * turbine's card.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip#config-forSelector
 */
export default class TurbineTooltip extends Tooltip {
    static $name = 'TurbineTooltip';

    static type = 'turbinetooltip';

    static configurable = {
        forSelector : '.ow-marker',
        cls         : 'ow-map-tip',
        // The card's width (resources/map/tooltip.css) and the tooltip's padding, so its padding is the same on both
        // sides
        maxWidth    : 'min(26rem, calc(100vw - 16px))',
        hoverDelay  : 250,
        hideDelay   : 100
    };

    /**
     * Shows the tooltip of a marker
     * @param {Element} marker
     */
    showForMarker(marker) {
        this.activeTarget = marker;
        this.updateContent();
        this.showByTarget(marker);
    }

    /**
     * Updates the tooltip shown, its turbine's plan may have changed
     */
    refresh() {
        if (this.isVisible && this.activeTarget?.isConnected) {
            this.updateContent();
            this.realign();
        }
    }
}

TurbineTooltip.initClass();
