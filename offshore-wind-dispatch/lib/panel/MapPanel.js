import { Panel, StringHelper } from '@bryntum/core-enterprise';
import { turbineIds } from '../plan/Farm.js';
import { iconConfig } from '../util/Icons.js';
// Also registers the widget types used below
import '../map/TurbineMap.js';
import '../map/TurbineCard.js';

/**
 * The map half of the app: a column of two cards. The site's card has a title bar with the site's name and its
 * turbine count, the map of the farm (TurbineMap) inset, and its legend. The selected turbine's card
 * (TurbineCard) is under it. On a phone it is the Map tab.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel
 */
export default class MapPanel extends Panel {
    static $name = 'MapPanel';

    static type = 'mappanel';

    static configurable = {
        /**
         * The site, for the map's port label and the title: `{ port, portKm, name }`
         * @config {Object}
         */
        site : null,

        /**
         * Returns the content (a DomConfig) of a turbine's tooltip on the map, see TurbineMap#tipContent
         * @config {Function}
         */
        tipContent : null,

        /**
         * At phone widths the map is its own tab, the site's title bar goes. Set by DispatchApp#updatePhone
         * @prp {Boolean}
         */
        phone : false,

        cls    : 'ow-side',
        width  : 400,
        layout : 'vbox'
    };

    construct(config) {
        const { site, tipContent } = config;

        super.construct({
            ...config,
            // Its tab's text on a phone
            title  : 'Map',
            header : false,
            items  : {
                // The site's card: the title bar, the map inset with the card's padding, the legend on the card
                place : {
                    type   : 'container',
                    cls    : 'ow-side-card',
                    flex   : 1,
                    layout : 'vbox',
                    items  : {
                        bar : {
                            type  : 'toolbar',
                            cls   : 'ow-panel-bar',
                            items : {
                                title : { type : 'widget', cls : 'ow-panel-title', html : StringHelper.encodeHtml(site.name) },
                                count : {
                                    type    : 'widget',
                                    cls     : 'ow-panel-count',
                                    tooltip : `${turbineIds.length} turbines`
                                }
                            }
                        },
                        map    : { type : 'turbinemap', flex : 1, site, tipContent, margin : '4 16 0' },
                        legend : { type : 'maplegend' }
                    }
                },
                // The selected turbine, a card of its own
                card : { type : 'turbinecard' }
            }
        });
    }

    afterConstruct() {
        super.afterConstruct();

        // The turbine count, with the turbine's icon
        this.widgetMap.bar.widgetMap.count.html = [iconConfig('turbine'), { tag : 'span', text : String(turbineIds.length) }];
        this.updatePhone(this.phone);
    }

    updatePhone(phone) {
        const { bar } = this.widgetMap ?? {};

        if (bar) {
            bar.hidden = phone;
        }
    }
}

MapPanel.initClass();
