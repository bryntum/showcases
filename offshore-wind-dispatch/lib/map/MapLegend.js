import { Widget } from '@bryntum/core-enterprise';
import { markerParts } from './Turbine.js';

// The statuses of a turbine (TurbineModel#status) the legend names
const statuses = [['work', 'In work'], ['planned', 'Planned'], ['waiting', 'Waiting'], ['risk', 'At risk'],
    ['fault', 'Stopped']];

/**
 * The legend of the map: one small marker per status of a turbine, with its name
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget
 */
export default class MapLegend extends Widget {
    static $name = 'MapLegend';

    static type = 'maplegend';

    static configurable = {
        cls  : 'ow-map-legend',
        html : statuses.map(([status, label]) =>
            `<span><svg class="ow-legend-mark ow-m-${status}" viewBox="-8 -8 16 16" aria-hidden="true">${markerParts()}</svg>${label}</span>`).join('')
    };
}

MapLegend.initClass();
