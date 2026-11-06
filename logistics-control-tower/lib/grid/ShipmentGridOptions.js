import LateCountPanel from './LateCountPanel.js';
import { carrierGroupRows, shipmentColumns } from './ShipmentColumns.js';
import { agTheme } from './AgGridSetup.js';

/**
 * The AG Grid options of the shipment grid: row ids, selection, grouping by carrier, row styling by status, the
 * context menu and the status bar.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/grid-options/
 * https://www.ag-grid.com/javascript-data-grid/grouping-group-rows/
 * https://www.ag-grid.com/javascript-data-grid/row-styles/#row-class-rules
 * https://www.ag-grid.com/javascript-data-grid/context-menu/
 * https://www.ag-grid.com/javascript-data-grid/data-update-high-frequency/
 */

/**
 * The shipment grid's context menu: book, unbook and expedite the shipment of the row
 * @param {Object} actions `{ book, unbook, expedite }`, each called with a shipment id
 * @returns {Function} AG Grid `getContextMenuItems`
 */
function contextMenu(actions) {
    return ({ node }) => {
        const data = node?.data;

        if (!data) {
            return [];
        }

        const
            started = data.status === 'unloading' || data.status === 'done',
            item    = (name, icon, action, disabled) => ({
                name,
                disabled,
                icon   : `<i class="fa fa-${icon}" aria-hidden="true"></i>`,
                action : () => actions[action](data.id)
            });

        return [
            item('Book dock', 'calendar-plus', 'book', started || Boolean(data.dockId)),
            item('Unbook', 'calendar-xmark', 'unbook', started || !data.dockId),
            item('Expedite', 'bolt', 'expedite', started)
        ];
    };
}

/**
 * @param {Object} options
 * @param {Object[]} options.rowData The rows, ShipmentModel#toRow()
 * @param {Object} options.context Shared with the renderers, holds the simulated `now`
 * @param {Object} options.actions `{ book, unbook, expedite }` for the context menu
 * @returns {Object} AG Grid options
 */
export function shipmentGridOptions({ rowData, context, actions }) {
    return {
        theme         : agTheme,
        rowData,
        context,
        columnDefs    : shipmentColumns,
        defaultColDef : {
            // The filter button stays, the column menu is left out
            suppressHeaderMenuButton : true,
            sortable                 : true,
            resizable                : true,
            filter                   : 'agTextColumnFilter'
        },
        // Dock slot as wide as its badges, the conflict warning included
        autoSizeStrategy           : { type : 'fitCellContents', colIds : ['dockName'] },
        getRowId                   : ({ data }) => data.id,
        // Live updates are batched by AG Grid (asyncTransactionWaitMillis), see GridSync
        asyncTransactionWaitMillis : 60,
        cellFlashDuration          : 700,
        cellFadeDuration           : 900,
        rowSelection               : {
            mode                 : 'singleRow',
            checkboxes           : false,
            enableClickSelection : true
        },
        groupDisplayType            : 'groupRows',
        groupRowRendererParams      : carrierGroupRows,
        groupDefaultExpanded        : 1,
        animateRows                 : false,
        cacheQuickFilter            : true,
        // A drag onto the dock schedule books a slot, the grid itself does not reorder
        suppressMoveWhenRowDragging : true,
        rowClassRules               : {
            'lct-row-late'    : ({ data }) => data?.status === 'late' || Boolean(data?.slaBreach),
            'lct-row-at-risk' : ({ data }) => data?.status === 'at-risk',
            'lct-row-on-time' : ({ data }) => data?.status === 'on-time',
            'lct-row-done'    : ({ data }) => data?.status === 'done'
        },
        getContextMenuItems : contextMenu(actions),
        statusBar           : {
            statusPanels : [
                { statusPanel : 'agTotalRowCountComponent', align : 'left' },
                { statusPanel : 'agFilteredRowCountComponent', align : 'left' },
                { statusPanel : 'agSelectedRowCountComponent', align : 'left' },
                { statusPanel : LateCountPanel, key : 'lateCount', align : 'right' }
            ]
        }
    };
}
