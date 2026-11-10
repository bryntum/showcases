import { Panel, StringHelper } from '@bryntum/core-enterprise';
import { turbineIds } from '../plan/Farm.js';
// Also registers the widget types used below
import '../map/TurbineMap.js';
import { markerParts } from '../map/Turbine.js';
import { mapModel } from '../map/MapModel.js';
import { cardInfo } from '../map/TurbineCard.js';

/**
 * The map half of the app: the site's card (title bar, TurbineMap, legend) over the selected turbine's card.
 * `draw()` redraws both on every change, but moves the map only when the selection changed (see fit).
 */
export default class MapPanel extends Panel {
    static $name = 'MapPanel';

    static type = 'mappanel';

    static configurable = {
        // `{ port, portKm, name }`
        site : null,

        // See TurbineMap#tipContent
        tipContent : null,

        // Set by PhoneLayout. The site's title bar goes
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
     * @param {Object} options
     * @param {DispatchState} options.state
     * @param {TripModel[]} options.trips The trips of the day shown
     * @param {TripModel|null} options.selectedTrip
     * @param {String|null} options.turbine The held team's turbine, else the selected one
     * @param {Object|null} options.held See DropController#previewDrop
     * @param {Boolean} options.follow AppState#mapFollows
     */
    draw({ state, trips, selectedTrip, turbine, held, follow }) {
        const
            { map, card }         = this.widgetMap,
            model                 = mapModel({ state, trips, selectedTrip, selectedTurbine : turbine, drop : held });

        map.draw(model);
        this.fit(selectedTrip, turbine, follow && !held, Boolean(held));

        if (turbine) {
            card.draw(cardInfo({ state, trips, turbine, drop : held, selectedTrip }));
        }
    }

    // Only a change of what is shown moves the map (another trip or turbine, following or not, a team held or not): a
    // redraw of the same selection (the plan, the clock, a hover) must not undo the user's pan or zoom
    fit(trip, turbine, follow, held) {
        const
            me       = this,
            key      = [trip?.id, turbine, follow, held].join('|'),
            turbines = trip?.turbines ?? [],
            fit      = !turbine || turbines.includes(turbine) ? turbines : [turbine];

        if (key !== me.fitKey) {
            me.fitKey = key;
            me.widgetMap.map.fitTo(follow ? fit : null);
        }
    }

    // For a selection made on the map itself, or Show all: the map is already where it should be. The next change of
    // the selection fits it again
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
