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
        dry      : 'Dry',
        reefer   : 'Reefer',
        oversize : 'Oversize'
    },

    // Font Awesome icons (the Core package's build) per load type
    loadIcons = {
        dry      : 'fa fa-box',
        reefer   : 'fa fa-snowflake',
        oversize : 'fa fa-truck-ramp-box'
    },

    gpsText = {
        live    : 'Live',
        stale   : 'Stale',
        lost    : 'Lost',
        arrived : 'On site'
    };
