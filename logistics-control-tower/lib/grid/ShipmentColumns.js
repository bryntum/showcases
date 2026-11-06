import {
    formatDelay, formatTimeValue, renderCarrier, renderCarrierGroup, renderGps, renderLoad
} from './CellRenderers.js';
import DockSlotCellRenderer from './DockSlotCellRenderer.js';
import EtaCellRenderer from './EtaCellRenderer.js';
import StatusCellRenderer from './StatusCellRenderer.js';
import TemperatureCellRenderer from './TemperatureCellRenderer.js';
import { gpsText, loadText, statusText } from '../util/Status.js';

/**
 * The column definitions of the shipment grid. Columns with `enableCellChangeFlash` flash when the simulation (or a
 * change on the dock schedule) updates their value. GPS, load, pallets, origin and the planned ETA are hidden to start
 * with, they can be shown from the column tool panel or the API.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/column-definitions/
 * https://www.ag-grid.com/javascript-data-grid/flashing-cells/
 * https://www.ag-grid.com/javascript-data-grid/filter-set/
 * https://www.ag-grid.com/javascript-data-grid/sparklines-overview/
 */

const
    // A set filter listing the display texts of a keyed value
    setFilter = labels => ({
        filter       : 'agSetColumnFilter',
        filterParams : {
            // Every status, also those no row has yet
            values         : Object.keys(labels),
            valueFormatter : ({ value }) => labels[value] ?? value
        }
    }),
    // Status order for sorting, in transit first, then on site
    statusOrder = Object.keys(statusText),
    // Booked slots by start, unbooked last
    slotSortValue = node => node.data?.slotStart ?? Infinity,
    // The dock slot cell is refreshed and flashed when its value changes: the slot moves, is booked or unbooked, or a
    // resize makes it end after the due time
    dockSlotValue = ({ data }) => data &&
        (data.dockId ? `${data.dockName} ${data.slotStart} ${data.slaBreach}` : data.onHold ? 'hold' : ''),
    // One series array per history and status, so a status change alone gives the cell a new value and redraws its
    // line in the new colour, and an unchanged row keeps its array (AG Grid compares by reference)
    driftSeries   = new WeakMap(),
    drift         = ({ etaHistory, status }) => {
        let byStatus = driftSeries.get(etaHistory);

        if (!byStatus) {
            driftSeries.set(etaHistory, byStatus = new Map([[status, etaHistory]]));
        }

        if (!byStatus.has(status)) {
            byStatus.set(status, etaHistory.slice());
        }

        return byStatus.get(status);
    },
    // The sparkline renderer per status, a thin line and no area, made once: the selector returns the same object
    // for every cell of a status. The colours are set from the theme, see setSparklineColors()
    sparklines    = Object.fromEntries(Object.keys(statusText).map(status => [status, {
        component : 'agSparklineCellRenderer',
        params    : {
            sparklineOptions : {
                type        : 'line',
                strokeWidth : 1.25,
                marker      : { enabled : false },
                padding     : { top : 12, bottom : 12, left : 2, right : 2 }
            }
        }
    }]));

// The visible columns share the room the grid has to spare, each in proportion to its `flex` (its natural width), up
// to its `maxWidth`. Below the sum of their `minWidth`s the grid scrolls
export const shipmentColumns = [
    {
        field      : 'ref',
        headerName : 'Shipment',
        width      : 124,
        pinned     : 'left',
        // Drag a shipment by its handle onto a dock door, unless it is being unloaded or done
        rowDrag    : ({ data }) => Boolean(data) && data.status !== 'unloading' && data.status !== 'done',
        cellClass  : 'lct-ref'
    },
    {
        field                 : 'status',
        headerName            : 'Status',
        flex                  : 114,
        minWidth              : 114,
        maxWidth              : 150,
        cellRenderer          : StatusCellRenderer,
        enableCellChangeFlash : true,
        comparator            : (a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b),
        ...setFilter(statusText)
    },
    {
        field                 : 'eta',
        headerName            : 'ETA',
        flex                  : 158,
        minWidth              : 158,
        maxWidth              : 210,
        // The time and how long until arrival (or since), relative to the simulated now, refreshed on every tick
        cellRenderer          : EtaCellRenderer,
        enableCellChangeFlash : true,
        filter                : false
    },
    {
        field                 : 'delay',
        headerName            : 'Delay',
        flex                  : 68,
        minWidth              : 68,
        maxWidth              : 96,
        valueFormatter        : formatDelay,
        enableCellChangeFlash : true,
        cellClassRules        : {
            'lct-delay-late' : ({ value }) => value > 30,
            'lct-delay-risk' : ({ value }) => value > 10 && value <= 30
        },
        filter : 'agNumberColumnFilter'
    },
    {
        colId                : 'drift',
        headerName           : 'ETA drift',
        // The largest share of any room to spare, a longer line reads better
        flex                 : 160,
        minWidth             : 84,
        maxWidth             : 260,
        sortable             : false,
        filter               : false,
        valueGetter          : ({ data }) => data && drift(data),
        // A line coloured by status, the selector runs again when the value changes
        cellRendererSelector : ({ data }) => sparklines[data.status]
    },
    {
        field                 : 'dockName',
        headerName            : 'Dock slot',
        // Fits the widest badge, a conflict with its warning
        width                 : 122,
        cellRenderer          : DockSlotCellRenderer,
        valueGetter           : dockSlotValue,
        enableCellChangeFlash : true,
        comparator            : (a, b, nodeA, nodeB) => slotSortValue(nodeA) - slotSortValue(nodeB),
        filter                : 'agSetColumnFilter',
        // One entry per door and booking state. The set filter sorts its entries with the column's comparator unless
        // it has its own, which gets the values only
        filterValueGetter     : ({ data }) => data.dockName ?? (data.onHold ? 'On hold' : 'Unbooked'),
        filterParams          : { comparator : (a, b) => a.localeCompare(b) }
    },
    {
        field                 : 'temperature',
        headerName            : 'Temp',
        // As wide as −17.3 °C, the numbers line up on the right
        width                 : 87,
        type                  : 'rightAligned',
        cellRenderer          : TemperatureCellRenderer,
        enableCellChangeFlash : true,
        filter                : 'agNumberColumnFilter'
    },
    {
        field        : 'gps',
        headerName   : 'GPS',
        width        : 96,
        hide         : true,
        cellRenderer : renderGps,
        ...setFilter(gpsText)
    },
    {
        field        : 'loadType',
        headerName   : 'Load',
        width        : 112,
        hide         : true,
        cellRenderer : renderLoad,
        ...setFilter(loadText)
    },
    {
        field      : 'pallets',
        headerName : 'Pallets',
        width      : 90,
        hide       : true,
        type       : 'rightAligned',
        aggFunc    : 'sum',
        filter     : 'agNumberColumnFilter'
    },
    {
        field      : 'origin',
        headerName : 'Origin',
        width      : 118,
        hide       : true,
        filter     : 'agSetColumnFilter'
    },
    {
        field        : 'carrier',
        headerName   : 'Carrier',
        width        : 170,
        rowGroup     : true,
        hide         : true,
        cellRenderer : renderCarrier,
        filter       : 'agSetColumnFilter'
    },
    {
        field   : 'late',
        hide    : true,
        aggFunc : 'sum'
    },
    {
        field          : 'plannedEta',
        headerName     : 'Planned',
        width          : 84,
        hide           : true,
        valueFormatter : formatTimeValue,
        filter         : false
    }
];

/**
 * Sets the line colour of the sparklines per status, see SparklineColors.js. Rows drawn after it use them
 * @param {Object<String,String>} colors By status
 */
export function setSparklineColors(colors) {
    Object.entries(sparklines).forEach(([status, { params }]) => {
        params.sparklineOptions.stroke = colors[status];
    });
}

/**
 * The carrier group rows, full width: the carrier chip, its shipments, pallets and late trucks (aggregated)
 */
export const carrierGroupRows = {
    suppressCount : true,
    innerRenderer : renderCarrierGroup
};
