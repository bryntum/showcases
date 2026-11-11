import { Panel } from '@bryntum/core-enterprise';
import { createGrid } from 'ag-grid-community';
import { shipmentGridOptions } from './grid/ShipmentGridOptions.js';
import ShipmentTotalsPanel from './grid/ShipmentTotalsPanel.js';
import { setSparklineColors } from './grid/ShipmentColumns.js';
import { onColorSchemeChange, resolveSparklineColors } from './grid/SparklineColors.js';
import { statusText } from './util/Status.js';
import { icon } from './util/Icons.js';

/**
 * A Bryntum Panel hosting the AG Grid of inbound shipments. The panel's toolbar holds the title with the shipments
 * shown of all of them, the quick search and the carrier grouping switch, the body is AG Grid's own DOM, its status
 * bar the footer with the totals of the shown shipments. The grid is themed on the Bryntum theme's CSS variables,
 * see grid/AgGridSetup.js, so it follows light and dark mode with the rest of the app.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/widget/Panel
 * https://www.ag-grid.com/javascript-data-grid/getting-started/
 * https://www.ag-grid.com/javascript-data-grid/filter-quick/
 */
export default class ShipmentGridPanel extends Panel {
    static $name = 'ShipmentGridPanel';

    static type = 'shipmentgridpanel';

    static configurable = {
        cls     : 'lct-grid-panel',
        bodyCls : 'lct-grid-body',

        tbar : {
            cls   : 'lct-panel-bar',
            items : {
                title : {
                    type : 'widget',
                    cls  : 'lct-panel-title',
                    html : 'Inbound shipments'
                },
                count  : { type : 'widget', cls : 'lct-panel-count' },
                spacer : '->',
                search : {
                    type                 : 'textfield',
                    cls                  : 'lct-search',
                    placeholder          : 'Search shipments',
                    clearable            : true,
                    width                : '14em',
                    keyStrokeChangeDelay : 150,
                    triggers             : { search : { cls : icon('magnifying-glass'), align : 'start' } },
                    onChange             : 'up.onSearchChange'
                },
                group : {
                    type     : 'slidetoggle',
                    text     : 'Group by carrier',
                    checked  : true,
                    onChange : 'up.onGroupChange'
                }
            }
        }
    };

    /**
     * Creates the AG Grid, once the data is ready
     * @param {Object} options See grid/ShipmentGridOptions.js
     * @returns {Object} The AG Grid API, also the `gridApi` property
     */
    createGrid(options) {
        const me = this;

        me.applySparklineColors();

        const gridApi = me.gridApi = createGrid(me.contentElement, shipmentGridOptions(options));

        // The sparklines are drawn on a canvas, redrawn in the colours of the new mode
        me.stopWatchingColorScheme = onColorSchemeChange(() => {
            me.schemeFrame ??= me.requestAnimationFrame(() => {
                me.schemeFrame = null;
                me.applySparklineColors();
                gridApi.redrawRows();
            });
        });

        // Rows changed, filtered or searched: the shown count in the title, counted in a timeout after the batch, not
        // in a frame of the gliding playhead (Delayable, cancelled on destroy; not an idle callback, Safari has none).
        // The footer's totals panel follows the grid on its own
        gridApi.addEventListener('modelUpdated', () => {
            me.countIdle ??= me.setTimeout(me.refreshCount, 0);
        });

        return gridApi;
    }

    // The shipments shown of all of them, in the title
    refreshCount() {
        const { shown, total } = ShipmentTotalsPanel.count(this.gridApi);

        this.countIdle = null;
        this.widgetMap.count.html = `${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
    }

    applySparklineColors() {
        setSparklineColors(resolveSparklineColors(this.element, Object.keys(statusText)));
    }

    doDestroy() {
        this.stopWatchingColorScheme?.();
        this.gridApi?.destroy();
        super.doDestroy();
    }

    onSearchChange({ value }) {
        this.gridApi?.setGridOption('quickFilterText', value);
    }

    onGroupChange({ checked }) {
        const { gridApi } = this;

        gridApi?.setRowGroupColumns(checked ? ['carrier'] : []);
        gridApi?.setColumnsVisible(['carrier'], !checked);
    }
}

ShipmentGridPanel.initClass();
