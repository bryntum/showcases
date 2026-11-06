import { DomHelper, Widget } from '@bryntum/core-enterprise';
import { statusText } from './util/Status.js';

/**
 * The legend below the app: a swatch per shipment status (the colours of the grid pills and the slot bars), the
 * conflict outline, a hint on drag and drop, and the third-party note for AG Grid.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget
 */
export default class StatusLegend extends Widget {
    static $name = 'StatusLegend';

    static type = 'statuslegend';

    static configurable = {
        cls : 'lct-legend'
    };

    construct(config) {
        super.construct(config);

        [
            {
                tag          : 'ul',
                class        : 'lct-legend-items',
                'aria-label' : 'Shipment statuses',
                children     : [
                    ...Object.entries(statusText).map(([status, text]) => ({
                        tag      : 'li',
                        class    : `lct-legend-item lct-status-${status}`,
                        children : [{ tag : 'span', class : 'lct-swatch', 'aria-hidden' : 'true' }, text]
                    })),
                    {
                        tag      : 'li',
                        class    : 'lct-legend-item lct-legend-conflict',
                        children : [{ tag : 'span', class : 'lct-swatch', 'aria-hidden' : 'true' }, 'Conflict: ends after due time']
                    }
                ]
            },
            {
                class : 'lct-legend-hint',
                text  : 'Drag a shipment onto a door to book it, right-click for more'
            },
            {
                class    : 'lct-legend-note',
                children : [
                    'Grid by ',
                    { tag : 'a', href : 'https://www.ag-grid.com/license-pricing/', target : '_blank', text : 'AG Grid Enterprise' },
                    ', separately licensed'
                ]
            }
        ].forEach(child => DomHelper.createElement({ ...child, parent : this.element }));
    }
}

StatusLegend.initClass();
