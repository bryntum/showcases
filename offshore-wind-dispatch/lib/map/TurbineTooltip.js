import { Tooltip } from '@bryntum/core-enterprise';

/**
 * The tooltip of the map's turbines, one Tooltip for all markers (`forSelector`). Shown on hover and, through
 * `showForMarker()`, on keyboard focus, which the Tooltip does not do for a delegated target on its own.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/widget/Tooltip#config-forSelector
 * https://bryntum.com/docs/api/Core/widget/Tooltip#config-getHtml
 */
export default class TurbineTooltip extends Tooltip {
    static $name = 'TurbineTooltip';

    static type = 'turbinetooltip';

    static configurable = {
        /**
         * Returns the DomConfig of a turbine's tooltip, called with the turbine's ID
         * @config {Function}
         */
        contentOf : null,

        forSelector : '.ow-marker',
        getHtml     : 'this.markerHtml',
        cls         : 'ow-map-tip',
        // The card inside brings its own width and padding (resources/map/card.css)
        maxWidth    : 'min(24rem, calc(100vw - 2rem))',
        hoverDelay  : 250,
        hideDelay   : 100
    };

    /**
     * The marker shown, hovered or focused
     * @member {Element} marker
     */

    markerHtml({ activeTarget }) {
        this.marker = activeTarget;

        return this.contentOf?.(activeTarget.dataset.turbine) ?? '';
    }

    // For a marker focused from the keyboard
    showForMarker(marker) {
        const me = this;

        me.marker = marker;
        me.html   = me.contentOf?.(marker.dataset.turbine) ?? '';
        me.showBy({ target : marker });
    }

    // The plan of the turbine shown may have changed
    refresh() {
        const { marker } = this;

        if (this.isVisible && marker?.isConnected) {
            this.showForMarker(marker);
        }
    }
}

TurbineTooltip.initClass();
