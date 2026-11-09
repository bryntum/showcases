import { Container } from '@bryntum/core-enterprise';
// Also registers the widget types used below
import '../map/TurbineMap.js';
import '../map/TurbineCard.js';

/**
 * The map half of the app: its title bar with the Status / Access switch, the map of the farm (TurbineMap) and the
 * selected turbine's card (TurbineCard). On a phone it is the Map tab.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 */
export default class MapPanel extends Container {
    static $name = 'MapPanel';

    static type = 'mappanel';

    static configurable = {
        /**
         * The site, for the map's port label: `{ port, portKm, name }`
         * @config {Object}
         */
        site : null,

        /**
         * Returns the HTML of a turbine's tooltip on the map, see TurbineMap#tipHtml
         * @config {Function}
         */
        tipHtml : null,

        cls    : 'ow-side',
        title  : 'Map',
        width  : 400,
        layout : 'vbox'
    };

    construct(config) {
        const { site, tipHtml } = config;

        super.construct({
            ...config,
            items : {
                sideBar : { type : 'widget', cls : 'ow-panel-bar' },
                map     : { type : 'turbinemap', flex : 1, site, tipHtml },
                card    : { type : 'turbinecard' }
            }
        });
    }
}

MapPanel.initClass();
