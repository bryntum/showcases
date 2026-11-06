import { icon } from './Icons.js';

/**
 * Shipment statuses and load types, shared by the grid, the schedule and the KPI bar.
 */

export const
    // Display order: in transit, then at the site
    statusText = {
        'on-time' : 'On time',
        'at-risk' : 'At risk',
        late      : 'Late',
        yard      : 'At yard',
        unloading : 'Unloading',
        done      : 'Done'
    },

    loadText = {
        dry    : 'Dry',
        reefer : 'Reefer'
    },

    // Icon classes per load type, see Icons.js
    loadIcons = {
        dry    : icon('cube'),
        reefer : icon('snowflake')
    },

    gpsText = {
        live    : 'Live',
        stale   : 'Stale',
        lost    : 'Lost',
        arrived : 'On site'
    };
