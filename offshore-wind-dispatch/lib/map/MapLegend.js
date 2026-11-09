import { Widget } from '@bryntum/core-enterprise';
import { markerParts } from './Turbine.js';

const statuses = [['ow-m-work', 'In work'], ['ow-m-planned', 'Planned'], ['ow-m-waiting', 'Waiting'],
    ['ow-m-risk', 'At risk'], ['ow-m-fault', 'Stopped']];

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
        html : statuses.map(([cls, label]) =>
            `<span><svg class="ow-legend-mark ${cls}" viewBox="-8 -8 16 16" aria-hidden="true">${markerParts()}</svg>${label}</span>`).join('')
    };
}

MapLegend.initClass();
