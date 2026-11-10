import { Tooltip } from '@bryntum/core-enterprise';

/**
 * The tooltip of the map's turbines: a Bryntum Tooltip on the markers (`forSelector`), shown on hover and, with
 * `showForMarker()`, on keyboard focus. Its content comes from `contentOf`, which the map passes and which asks the app
 * for the turbine's card.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip#config-forSelector
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip#config-getHtml
 */
export default class TurbineTooltip extends Tooltip {
    static $name = 'TurbineTooltip';

    static type = 'turbinetooltip';

    static configurable = {
        /**
         * Returns the content of a turbine's tooltip
         * @config {Function}
         * @param {String} turbine The turbine's ID
         * @returns {Object} DomConfig
         */
        contentOf : null,

        forSelector : '.ow-marker',
        getHtml     : 'this.markerHtml',
        cls         : 'ow-map-tip',
        // The card's width (resources/map/tooltip.css), which brings its own padding
        maxWidth    : 'min(24rem, calc(100vw - 2rem))',
        hoverDelay  : 250,
        hideDelay   : 100
    };

    /**
     * The marker whose turbine the tooltip shows, hovered or focused
     * @member {Element} marker
     */

    // The content for a hovered marker (`getHtml`)
    markerHtml({ activeTarget }) {
        this.marker = activeTarget;

        return this.contentOf?.(activeTarget.dataset.turbine) ?? '';
    }

    /**
     * Shows the tooltip of a marker, the one focused from the keyboard
     * @param {Element} marker
     */
    showForMarker(marker) {
        const me = this;

        me.marker = marker;
        me.html   = me.contentOf?.(marker.dataset.turbine) ?? '';
        me.showBy({ target : marker });
    }

    /**
     * Updates the tooltip shown, its turbine's plan may have changed
     */
    refresh() {
        const { marker } = this;

        if (this.isVisible && marker?.isConnected) {
            this.showForMarker(marker);
        }
    }
}

TurbineTooltip.initClass();
