import { Panel, StringHelper } from '@bryntum/core-enterprise';
import { turbineIds } from '../plan/Farm.js';
// Also registers the widget types used below
import '../map/TurbineMap.js';
import { markerParts } from '../map/Turbine.js';
import { mapModel } from '../map/MapModel.js';
import { cardInfo } from '../map/TurbineCard.js';

/**
 * The map half of the app: a column of two cards. The site's card has a title bar with the site's name and its
 * turbine count, the map of the farm (TurbineMap) inset, and its legend. The selected turbine's card
 * (TurbineCard) is under it. On a phone it is the Map tab.
 *
 * `draw()` draws both from the plan and the app's state, and fits the map to what is selected when that changed.
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
                                title  : { type : 'widget', cls : 'ow-panel-title', html : StringHelper.encodeHtml(site.name) },
                                // The count at the right end
                                spacer : '->',
                                count  : {
                                    type    : 'widget',
                                    cls     : 'ow-panel-count',
                                    tooltip : `${turbineIds.length} turbines`
                                }
                            }
                        },
                        map    : { type : 'turbinemap', flex : 1, site, tipContent, margin : '0 16' },
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

        // The turbine count, with the turbines' own mark on the map
        this.widgetMap.bar.widgetMap.count.html = `<svg class="ow-legend-mark" viewBox="-8 -8 16 16" aria-hidden="true">${markerParts()}</svg>` +
            `<span>${turbineIds.length}</span>`;
        this.updatePhone(this.phone);
    }

    /**
     * Draws the map and the selected turbine's card, and fits the map to the selection when it changed
     * @param {Object} options
     * @param {DispatchState} options.state
     * @param {TripModel[]} options.trips The trips of the day shown
     * @param {TripModel|null} options.selectedTrip
     * @param {String|null} options.turbine The turbine shown: the held team's, else the selected one
     * @param {Object|null} options.held The team held and its check, see DropController#previewDrop
     * @param {Boolean} options.follow The map follows the selection (AppState#mapFollows)
     */
    draw({ state, trips, selectedTrip, turbine, held, follow }) {
        const
            { map, card, legend } = this.widgetMap,
            model                 = mapModel({ state, trips, selectedTrip, selectedTurbine : turbine, drop : held });

        map.draw(model);
        legend.moved = [...model.markers.values()].some(({ status }) => status === 'moved');
        this.fit(selectedTrip, turbine, follow && !held, Boolean(held));

        if (turbine) {
            card.draw(cardInfo({ state, trips, turbine, drop : held, selectedTrip }));
        }
    }

    /**
     * Fits the map to the selected trip's turbines and the port, or to the selected turbine and the port, when it
     * follows the selection. A team held over a trip shows the whole farm, what the trip can still reach is all over
     * it. Only a change of what is shown moves the map: another trip or turbine, following or not, a team held or not.
     * A redraw of the same selection (the plan, the clock, a hover) leaves the view the user panned or zoomed to
     * @param {TripModel|null} trip
     * @param {String|null} turbine
     * @param {Boolean} follow
     * @param {Boolean} held
     */
    fit(trip, turbine, follow, held) {
        const
            me       = this,
            key      = [trip?.id, turbine, follow, held].join('|'),
            turbines = trip ? [...trip.turbines, ...(trip.removed ?? [])] : [],
            fit      = !turbine || turbines.includes(turbine) ? turbines : [turbine];

        if (key !== me.fitKey) {
            me.fitKey = key;
            me.widgetMap.map.fitTo(follow ? fit : null);
        }
    }

    /**
     * Keeps the map where it is for a selection: the user picked a turbine on the map itself, so it is in view, or went
     * to the whole farm with Show all. The next change of the selection fits it again
     * @param {TripModel|null} trip
     * @param {String|null} turbine
     * @param {Boolean} follow
     */
    keepView(trip, turbine, follow) {
        this.fitKey = [trip?.id, turbine, follow, false].join('|');
    }

    updatePhone(phone) {
        const { bar } = this.widgetMap ?? {};

        if (bar) {
            bar.hidden = phone;
        }
    }
}

MapPanel.initClass();
