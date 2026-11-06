import {
    formatDelay, formatTimeValue, renderCarrier, renderCarrierGroup, renderCountdown, renderDockSlot, renderGps,
    renderLoad, renderStatus, renderTemperature
} from './CellRenderers.js';
import { gpsText, loadText, statusText } from '../util/Status.js';

/**
 * The column definitions of the shipment grid. Columns with `enableCellChangeFlash` flash when the simulation (or a
 * change on the dock schedule) updates their value.
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
    slotSortValue = node => node.data?.slotStart ?? Infinity;

export const shipmentColumns = [
    {
        field      : 'ref',
        headerName : 'Shipment',
        width      : 140,
        pinned     : 'left',
        // Drag a shipment by its handle onto a dock door, unless it is being unloaded or done
        rowDrag    : ({ data }) => Boolean(data) && data.status !== 'unloading' && data.status !== 'done',
        cellClass  : 'lct-ref'
    },
    {
        field                 : 'status',
        headerName            : 'Status',
        width                 : 108,
        cellRenderer          : renderStatus,
        enableCellChangeFlash : true,
        comparator            : (a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b),
        ...setFilter(statusText)
    },
    {
        field                 : 'eta',
        headerName            : 'ETA',
        width                 : 66,
        valueFormatter        : formatTimeValue,
        enableCellChangeFlash : true,
        filter                : false
    },
    {
        colId        : 'arrives',
        headerName   : 'Arrives',
        width        : 108,
        // Relative to the simulated now, refreshed on every tick. Sorts by the ETA
        valueGetter  : ({ data }) => data?.eta,
        cellRenderer : renderCountdown,
        filter       : false
    },
    {
        field                 : 'delay',
        headerName            : 'Delay',
        width                 : 82,
        type                  : 'rightAligned',
        valueFormatter        : formatDelay,
        enableCellChangeFlash : true,
        cellClassRules        : {
            'lct-delay-late' : ({ value }) => value > 30,
            'lct-delay-risk' : ({ value }) => value > 10 && value <= 30
        },
        filter : 'agNumberColumnFilter'
    },
    {
        field              : 'etaHistory',
        headerName         : 'ETA drift',
        width              : 96,
        sortable           : false,
        filter             : false,
        cellRenderer       : 'agSparklineCellRenderer',
        cellRendererParams : {
            sparklineOptions : {
                type        : 'area',
                // Mid tones, readable on light and dark
                stroke      : '#e07b39',
                fill        : 'rgb(224 123 57 / 18%)',
                strokeWidth : 1.5,
                padding     : { top : 6, bottom : 6, left : 2, right : 2 }
            }
        }
    },
    {
        field                 : 'dockName',
        headerName            : 'Dock slot',
        width                 : 120,
        cellRenderer          : renderDockSlot,
        // Flashes when the slot moves, is booked or unbooked
        valueGetter           : ({ data }) => data && (data.dockId ? `${data.dockName} ${data.slotStart}` : data.onHold ? 'hold' : ''),
        enableCellChangeFlash : true,
        comparator            : (a, b, nodeA, nodeB) => slotSortValue(nodeA) - slotSortValue(nodeB),
        filter                : 'agSetColumnFilter',
        filterParams          : { valueGetter : ({ data }) => data.dockName ?? (data.onHold ? 'On hold' : 'Unbooked') }
    },
    {
        field                 : 'temperature',
        headerName            : 'Temp',
        width                 : 92,
        type                  : 'rightAligned',
        cellRenderer          : renderTemperature,
        enableCellChangeFlash : true,
        filter                : 'agNumberColumnFilter'
    },
    {
        field        : 'gps',
        headerName   : 'GPS',
        width        : 96,
        cellRenderer : renderGps,
        ...setFilter(gpsText)
    },
    {
        field        : 'loadType',
        headerName   : 'Load',
        width        : 112,
        cellRenderer : renderLoad,
        ...setFilter(loadText)
    },
    {
        field      : 'pallets',
        headerName : 'Pallets',
        width      : 90,
        type       : 'rightAligned',
        aggFunc    : 'sum',
        filter     : 'agNumberColumnFilter'
    },
    {
        field      : 'origin',
        headerName : 'Origin',
        width      : 118,
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
        valueFormatter : formatTimeValue,
        filter         : false
    }
];

/**
 * The carrier group rows, full width: the carrier chip, its shipments, pallets and late trucks (aggregated)
 */
export const carrierGroupRows = {
    suppressCount : true,
    innerRenderer : renderCarrierGroup
};
