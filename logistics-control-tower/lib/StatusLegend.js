import { DomHelper, Widget } from '@bryntum/core-enterprise';
import { statusText } from './util/Status.js';

/**
 * The legend below the app: a dot per shipment status (the colours of the grid pills and the slot bars), the dashed
 * outlines of a conflict and of a tentative slot, the striped downtime, the overloaded hour of the utilization strip,
 * and the credits, linking AG Grid Enterprise to its licence terms.
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

        const item = (cls, text) => ({
            tag      : 'li',
            class    : `lct-legend-item ${cls}`,
            children : [{ tag : 'span', class : 'lct-swatch', 'aria-hidden' : 'true' }, text]
        });

        [
            {
                tag          : 'ul',
                class        : 'lct-legend-items',
                'aria-label' : 'Legend',
                children     : [
                    ...Object.entries(statusText).map(([status, text]) => item(`lct-legend-status lct-status-${status}`, text)),
                    item('lct-legend-conflict', 'Conflict'),
                    item('lct-legend-tentative', 'Tentative'),
                    item('lct-legend-downtime', 'Unavailable'),
                    item('lct-legend-busy', 'Door over 90%')
                ]
            },
            {
                class    : 'lct-legend-note',
                children : [
                    'Shipments: ',
                    { tag : 'a', href : 'https://www.ag-grid.com/license-pricing/', target : '_blank', text : 'AG Grid Enterprise' },
                    ' · Dock schedule: Bryntum Scheduler'
                ]
            }
        ].forEach(child => DomHelper.createElement({ ...child, parent : this.element }));
    }
}

StatusLegend.initClass();
