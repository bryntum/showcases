import { StringHelper } from '@bryntum/core-enterprise';
import DockPlanner from '../simulation/DockPlanner.js';
import { formatMinutes, formatTime, minuteMs } from '../util/Time.js';
import { loadIcons, shipmentNumber, statusText } from '../util/Status.js';
import { icon } from '../util/Icons.js';

const
    // Above this share of door time taken an hour reads as overloaded
    busyShare     = 0.9,
    // What a slot bar needs around its number, in px, see renderSlot(): 1px borders and 5px padding, 2px padding when
    // compact, 2px to spare as the rendered bar can be a pixel narrower than its computed width. An icon with its gap
    // takes 21px, an icon alone fits from 28px
    roomyFrame    = 14,
    compactFrame  = 8,
    iconWidth     = 21,
    iconOnlyWidth = 28,
    // A mini slot (too short for its number): a status icon, then the delay where it fits. Icon 14px, gap 3px, 2px
    // padding either side, 2px to spare
    miniIcon      = 14,
    miniFrame     = 9,
    statusIcons   = {
        'on-time' : 'truck',
        'at-risk' : 'clock',
        late      : 'warning',
        yard      : 'map-pin',
        unloading : 'tray-arrow-down',
        done      : 'check'
    },
    // The number in the meta line's 11px instead of 13px, the next step down
    smallRatio    = 11 / 13,
    // The widest number, 10888 in bold 13px, until the font is there to measure them
    widestNumber  = 40,
    textWidths  = new Map(),
    measure       = new OffscreenCanvas(1, 1).getContext('2d');

// The width of a text in the bars' font (schedule.css), bold 13px for a number, 11px for the short text of a mini slot,
// measured once per text and font with the web font
function textWidth(text, font = '700 13px', fallback = widestNumber) {
    const key = `${font} ${text}`;
    let width = textWidths.get(key);

    if (width === undefined) {
        measure.font = `${font} ${getComputedStyle(document.body).fontFamily}`;

        if (!document.fonts.check(measure.font, text)) {
            return fallback;
        }

        textWidths.set(key, width = Math.ceil(measure.measureText(text).width));
    }

    return width;
}

/**
 * The dock schedule's cells, bars, utilization strip and tooltip, plain functions returning DomConfigs, or encoded HTML
 * (`StringHelper.xss`) where a string is expected. Classes are styled in resources/schedule.css.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Grid/column/Column#config-renderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/mixin/SchedulerEventRendering#config-eventRenderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Summary#config-renderer
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/StringHelper#function-xss-static
 */

/**
 * The dock door column: an icon for its capability, the door name and its zone
 * @param {Object} renderData
 * @returns {Object} DomConfig
 */
export function renderDock({ record }) {
    return {
        class    : `lct-dock lct-load-${record.capability}`,
        children : [
            {
                class    : 'lct-dock-icon',
                children : [{ tag : 'i', class : loadIcons[record.capability], 'aria-hidden' : 'true' }]
            },
            {
                class    : 'lct-dock-text',
                children : [
                    { class : 'lct-dock-name', text : record.name },
                    { class : 'lct-dock-zone', text : record.zone }
                ]
            }
        ]
    };
}

/**
 * A slot bar, never an empty box. As wide as it gets: an icon for the exceptions only (a reefer load, an expedited
 * truck, an unloaded one), the shipment number, below it the pallets, the delay of a truck at risk or late, or that it
 * waits at the yard. Narrower, the number alone, then the icon alone, then a slim bar of the same tint. Tinted
 * by status, outlined dashed when it ends after its due time (a conflict), a lighter dashed box while tentative
 * @param {Object} renderData
 * @returns {Object[]} DomConfig
 */
export function renderSlot({ eventRecord, renderData }) {
    const
        { status, loadType, expedited, pallets, name, delayMinutes, slaBreach, tentative } = eventRecord,
        { width }  = renderData,
        number     = shipmentNumber(name),
        text       = textWidth(number),
        // Dry loads are the default, they need no marker
        iconName   = status === 'done' ? 'check' : expedited ? 'lightning' : loadType === 'reefer' ? 'snowflake' : null,
        // The number before an icon alone, with less padding where it is tight, then in the meta line's smaller size
        fullText   = width >= text + compactFrame,
        smallText  = !fullText && width >= Math.ceil(text * smallRatio) + compactFrame,
        showText   = fullText || smallText,
        showIcon   = Boolean(iconName) &&
            (width >= text + roomyFrame + iconWidth || (!showText && width >= iconOnlyWidth));

    Object.assign(renderData.cls, {
        'lct-slot'               : 1,
        [`lct-status-${status}`] : 1,
        'lct-slot-breach'        : slaBreach,
        'lct-slot-tentative'     : tentative,
        'lct-slot-compact'       : showText && width < text + roomyFrame,
        'lct-slot-small'         : smallText,
        'lct-slot-icon-only'     : showIcon && !showText,
        'lct-slot-mini'          : !showText && !showIcon
    });

    if (!showText && !showIcon) {
        return renderMiniSlot(status, delayMinutes, width);
    }

    return [
        showIcon ? { tag : 'i', class : `lct-slot-icon ${icon(iconName)}`, 'aria-hidden' : 'true' } : null,
        showText ? {
            class    : 'lct-slot-text',
            children : [
                // The number only, the full reference is in the tooltip
                { class : 'lct-slot-ref', text : number },
                // No room for a second line beside a number this small
                smallText ? null : slotMeta(status, pallets, delayMinutes)
            ]
        } : null
    ];
}

// A slot too short for its number: an icon for its status in the middle of the box, and the delay of a truck at risk or
// late where that fits too. A bare pallet count would read as anything, it is in the tooltip
function renderMiniSlot(status, delay, width) {
    const
        short     = status === 'late' || status === 'at-risk' ? formatMinutes(delay, true) : null,
        showShort = short && width >= miniIcon + miniFrame + textWidth(short, '600 11px', Infinity);

    return [
        { tag : 'i', class : `lct-slot-icon ${icon(statusIcons[status])}`, 'aria-hidden' : 'true' },
        showShort ? { class : 'lct-slot-short', text : short } : null
    ];
}

// The second line of a slot bar
function slotMeta(status, pallets, delay) {
    if (status === 'late' || status === 'at-risk') {
        return { class : 'lct-slot-meta', text : formatMinutes(delay, true) };
    }

    if (status === 'yard') {
        return { class : 'lct-slot-meta', text : 'At yard' };
    }

    // A crate and the count, read out as "19 pallets"
    return {
        class        : 'lct-slot-meta lct-slot-pallets',
        title        : `${pallets} pallets`,
        'aria-label' : `${pallets} pallets`,
        children     : [{ tag : 'i', class : icon('package'), 'aria-hidden' : 'true' }, String(pallets)]
    };
}

/**
 * The utilization strip, the Summary feature's renderer for one tick of the time axis: the share of the doors' time
 * taken in it, by the slots with the turnaround after them, and by downtime, as a bar. Orange above 90%. Downtime
 * counts as taken, not as capacity removed: the bar tells how much door time is left for trucks
 * @param {Object} context
 * @param {Date} context.startDate
 * @param {Date} context.endDate
 * @param {SlotModel[]} context.events The slots in the tick
 * @param {Scheduler.data.ResourceStore} context.resourceStore The doors
 * @returns {String} HTML
 */
export function renderUtilization({ startDate, endDate, events, resourceStore }) {
    const
        start   = startDate.getTime(),
        end     = endDate.getTime(),
        gap     = DockPlanner.TURNAROUND * minuteMs,
        overlap = (from, to) => Math.max(0, Math.min(end, to) - Math.max(start, from)),
        slots   = events.reduce((sum, slot) => sum + overlap(slot.startDate.getTime(), slot.plannedEnd + gap), 0),
        down    = resourceStore.records.reduce((sum, door) => door.timeRanges.reduce((doorSum, range) =>
            doorSum + overlap(range.startDate.getTime(), range.endDate.getTime()), sum), 0),
        share   = Math.min(1, (slots + down) / ((end - start) * (resourceStore.count || 1))),
        percent = Math.round(share * 100);

    return `<div class="lct-util-bar${share > busyShare ? ' lct-util-over' : ''}" style="block-size: ${percent}%" ` +
        `data-btip="${formatTime(startDate)}–${formatTime(endDate)} · ${percent}% busy"></div>`;
}

/**
 * The slot tooltip, the shipment behind it
 * @param {ShipmentModel} shipment
 * @param {SlotModel} slot
 * @returns {String} HTML, encoded
 */
export function slotTip(shipment, slot) {
    return StringHelper.xss`
        <div class="lct-tip">
            <header>
                <strong>${shipment.ref}</strong>
                <span class="lct-pill lct-status-${shipment.status}">${statusText[shipment.status]}</span>
            </header>
            <dl>
                <dt>Carrier</dt><dd>${shipment.carrier}</dd>
                <dt>From</dt><dd>${shipment.origin}</dd>
                <dt>Load</dt><dd>${shipment.pallets} pallets, ${shipment.loadType}</dd>
                <dt>ETA</dt><dd>${formatTime(shipment.eta)} (planned ${formatTime(shipment.plannedEta)})</dd>
                <dt>Slot</dt><dd>${formatTime(slot.startDate)} – ${formatTime(slot.plannedEnd)}</dd>
                <dt>Due by</dt><dd class="${slot.slaBreach ? 'lct-tip-breach' : ''}">${formatTime(slot.dueBy)}</dd>
            </dl>
        </div>`;
}
