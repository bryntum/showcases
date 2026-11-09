import { Panel, StringHelper } from '@bryntum/core-enterprise';
import { turbineIds } from '../plan/Farm.js';
import { iconConfig } from '../util/Icons.js';
// Also registers the widget types used below
import '../map/TurbineMap.js';
import '../map/TurbineCard.js';

/**
 * The map half of the app: a Panel whose tbar holds the site's name and the Status / Access switch, with the map of
 * the farm (TurbineMap) and the selected turbine's card (TurbineCard) in its body. On a phone it is the Map tab.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/ButtonGroup
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
         * The map's view, `status` or `access`. The switch changes it, the `mapViewChange` event tells
         * @prp {String}
         */
        mapView : 'status',

        cls    : 'ow-side',
        width  : 400,
        layout : 'vbox'
    };

    construct(config) {
        const
            me                         = this,
            { site, tipContent, mapView } = config,
            show                          = name => ({
                text     : name[0].toUpperCase() + name.slice(1),
                pressed  : mapView === name,
                onToggle : ({ pressed }) => pressed && me.trigger('mapViewChange', { mapView : name })
            });

        super.construct({
            ...config,
            // Its tab's text on a phone, the tbar is the title bar
            title  : 'Map',
            header : false,
            tbar   : {
                cls   : 'ow-panel-bar',
                items : {
                    title : { type : 'widget', cls : 'ow-panel-title', html : StringHelper.encodeHtml(site.name) },
                    count : {
                        type    : 'widget',
                        cls     : 'ow-panel-count',
                        tooltip : `${turbineIds.length} turbines`
                    },
                    spacer : '->',
                    view   : {
                        type        : 'buttongroup',
                        toggleGroup : true,
                        items       : { status : show('status'), access : show('access') }
                    }
                }
            },
            items : {
                map  : { type : 'turbinemap', flex : 1, site, tipContent },
                card : { type : 'turbinecard' }
            }
        });
    }

    afterConstruct() {
        super.afterConstruct();

        // The turbine count, with the turbine's icon
        this.tbar.widgetMap.count.html = [iconConfig('turbine'), { tag : 'span', text : String(turbineIds.length) }];
    }

    updateMapView(mapView) {
        const { status, access } = this.tbar?.widgetMap ?? {};

        if (status) {
            (mapView === 'access' ? access : status).pressed = true;
        }
    }
}

MapPanel.initClass();
