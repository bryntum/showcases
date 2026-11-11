import { carSilhouette, progressRing } from '../Glyphs.js';
import { deriveStatus, elapsedFraction, spanAt } from '../util/Time.js';
import { formatDelay, formatPercent } from '../util/Format.js';
import { hiddenWhenSmall, responsiveWidth } from '../util/Responsive.js';

/**
 * Locked columns and group headers of the Service & charging view:
 * - Bay / charger, a progress ring around the bay or charger icon (the current job's progress, or the charging
 *   session's progress towards its target state of charge) and a live value: progress, overrun, or power
 * - Vehicle, a drawn parking bay with the car in it at the simulated "now". Free and closed bays show a label
 *   instead. The model and plate are the primary cell's subtitle
 * - Group headers (Group feature on the resource `kind`) with a live occupancy summary
 *
 * Learn more:
 * https://bryntum.com/docs/api/Grid/feature/Group#config-renderer
 */

const
    groupTitles = { bay : 'Bays', charger : 'Chargers' },
    ringIcons   = { lift : 'wrench', mobile : 'van', charger : 'charger' },

    // The job or charging session on the resource at `now`, events on a resource do not overlap
    currentEvent = (resource, now) => spanAt(resource.events, now) || null,

    // Closed while blocked time covers `now`
    isClosed = (resource, now) => Boolean(spanAt(resource.timeRanges, now)),

    /**
     * Live state of a bay or charger at `now`: closed (blocked time), busy with its `current` job or session, or free
     * @returns {{ status : String, fraction : Number|null, value : String, closed : Boolean }}
     */
    resourceState = (resource, current, now, grid) => {
        if (isClosed(resource, now)) {
            return { status : 'late', fraction : null, value : 'Closed', closed : true };
        }

        if (!current) {
            // No value, the Vehicle column's tile says free. The value keeps its width, so the name does not move
            return { status : 'sched', fraction : null, value : '' };
        }

        const fraction = elapsedFraction(current, now);

        if (resource.isCharger) {
            return { status : 'focus', fraction, value : `${grid.getChargeState(current).kw} kW` };
        }

        const late = deriveStatus(current, now, current.liveStatus) === 'late';

        return {
            status : late ? 'late' : 'ok',
            fraction,
            value  : late && current.delayMinutes ? formatDelay(current.delayMinutes) : formatPercent(fraction)
        };
    },

    // "NV9 Sedan · LK 7305", the plate in a tabular face
    vehicleLine = vehicle => [
        { tag : 'span', text : vehicle.name },
        vehicle.plate && { tag : 'span', class : 'ev-plate-text', text : ` · ${vehicle.plate}` }
    ],

    /**
     * Bay / charger cell: progress ring, name, subtitle (the vehicle in it, the warning while closed, else the
     * description) and the live value
     */
    renderResource = ({ record, grid }) => {
        const
            current                             = currentEvent(record, grid.simNow),
            { status, fraction, value, closed } = resourceState(record, current, grid.simNow, grid);

        return {
            class    : { 'ev-resource' : 1, 'ev-service-resource' : 1, [`ev-status-${status}`] : 1, 'ev-flip' : grid.isFlipping(`r:${record.id}`) },
            children : [
                progressRing({ icon : ringIcons[record.type], fraction, status }),
                {
                    class    : 'ev-resource-text',
                    children : [
                        { class : 'ev-resource-name', text : record.name },
                        closed || !current ?
                            { class : { 'ev-resource-desc' : 1, 'ev-warn' : closed }, text : (closed && record.warning) || record.description } :
                            { class : 'ev-resource-desc', children : vehicleLine(current) }
                    ]
                },
                { tag : 'span', class : 'ev-service-value', text : value }
            ]
        };
    },

    /**
     * Vehicle cell, a drawn parking bay with the car in it, its charge port glowing on a charger. The status and the
     * progress are shown by the ring in the primary column. Free and closed bays show a label
     */
    renderVehicle = ({ record, grid }) => {
        const
            now     = grid.simNow,
            closed  = isClosed(record, now),
            current = currentEvent(record, now),
            flip    = grid.isFlipping(`r:${record.id}`);

        if (closed || !current) {
            return {
                class    : { 'ev-bay' : 1, 'ev-bay-closed' : closed, 'ev-bay-free' : !closed, 'ev-flip' : flip },
                children : [{ tag : 'span', class : 'ev-bay-label', text : closed ? 'Closed' : 'Free' }]
            };
        }

        return {
            class    : { 'ev-bay' : 1, 'ev-flip' : flip },
            title    : current.plate ? `${current.name} · ${current.plate}` : current.name,
            children : [
                carSilhouette({ body : current.body, paint : current.paint, charging : record.isCharger })
            ]
        };
    };

/**
 * Group header: the title, then a live occupancy summary, `3/4 busy` for the bays, `2/4 busy · 412 kW draw` for the
 * chargers
 */
export const renderServiceGroup = ({ groupRowFor, groupRecords, isFirstColumn, grid }) => {
    if (!isFirstColumn) {
        return '';
    }

    const
        now       = grid.simNow,
        resources = groupRecords.filter(record => !record.isGroupHeader && !record.isGroupFooter),
        busy      = resources.map(resource => currentEvent(resource, now)).filter(Boolean),
        draw      = groupRowFor === 'charger' ? busy.reduce((sum, event) => sum + grid.getChargeState(event).kw, 0) : null;

    return {
        class    : 'ev-group-header',
        children : [
            { tag : 'span', class : 'ev-group-title', text : groupTitles[groupRowFor] ?? groupRowFor },
            { tag : 'span', class : 'ev-group-summary', text : `${busy.length}/${resources.length} busy${draw === null ? '' : ` · ${draw} kW draw`}` }
        ]
    };
};

/**
 * Column configs
 */
export const serviceColumns = columnTitle => [
    {
        id       : 'primary',
        text     : columnTitle,
        field    : 'name',
        ...responsiveWidth(288, 170),
        cls      : 'ev-header ev-header-first',
        cellCls  : 'ev-resource-cell',
        renderer : renderResource
    },
    {
        id       : 'vehicle',
        text     : 'Vehicle',
        width    : 112,
        align    : 'center',
        cls      : 'ev-header',
        cellCls  : 'ev-live-cell',
        renderer : renderVehicle,
        ...hiddenWhenSmall
    }
];
