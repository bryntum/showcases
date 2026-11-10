import { Panel } from '@bryntum/core-enterprise';
import { turbineIds } from '../plan/Farm.js';
// Also registers the widget types used below
import '../map/TurbineMap.js';
import { markerParts } from '../map/Turbine.js';
import { mapModel } from '../map/MapModel.js';
import { cardInfo } from '../map/TurbineCard.js';

// A turbine's map marker, small: the legend's swatches and the title's count
const
    mark     = status => `<svg class="ow-legend-mark${status ? ` ow-m-${status}` : ''}" viewBox="-8 -8 16 16" ` +
        `aria-hidden="true">${markerParts()}</svg>`,
    // The statuses of a turbine (TurbineModel#status) the legend names
    statuses = [['work', 'In work'], ['planned', 'Planned'], ['waiting', 'Waiting'], ['risk', 'At risk'],
        ['fault', 'Stopped']];

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
                // The site's card, its title and the turbine count in its header
                place : {
                    type   : 'panel',
                    cls    : 'ow-side-card',
                    flex   : 1,
                    layout : 'vbox',
                    title  : site.name,
                    tools  : {
                        count : {
                            type    : 'widget',
                            cls     : 'ow-panel-count',
                            tooltip : `${turbineIds.length} turbines`,
                            html    : `${mark()}<span>${turbineIds.length}</span>`
                        }
                    },
                    items : {
                        map    : { type : 'turbinemap', flex : 1, site, tipContent, margin : '0 16' },
                        legend : {
                            type : 'widget',
                            cls  : 'ow-map-legend',
                            html : statuses.map(([status, label]) => `<span>${mark(status)}${label}</span>`).join('')
                        }
                    }
                },
                card : { type : 'turbinecard' }
            }
        });
    }

    /**
     * @param {Object} options
     * @param {DispatchState} options.state
     * @param {TripModel[]} options.trips The trips of the day shown
     * @param {TripModel|null} options.selectedTrip
     * @param {String|null} options.turbine The held team's turbine, else the selected one
     * @param {Object|null} options.held See DropController#previewDrop
     * @param {Boolean} options.follow DispatchApp#mapFollows
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
}

MapPanel.initClass();
