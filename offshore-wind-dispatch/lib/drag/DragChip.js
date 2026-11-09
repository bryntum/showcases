import { DomHelper } from '@bryntum/core-enterprise';
import { teamChipContent } from '../TeamChip.js';

/**
 * The chip that follows the pointer while a team is dragged, or sits on the trip when the team is held from the
 * keyboard (TeamDrag, KeyboardDrag)
 */

/**
 * The team's compact chip, the proxy DragHelper drags. Its status line says what the trip under it gives (showOnChip)
 * @param {Object} team
 * @param {Object} job
 * @returns {HTMLElement}
 */
export function createChip(team, job) {
    return DomHelper.createElement({
        class    : 'ow-drag-chip',
        dataset  : { state : 'neutral' },
        children : [
            { tag : 'span', class : 'ow-drag-team', children : teamChipContent(team, job, true) },
            { tag : 'span', class : 'ow-drag-status', hidden : true, 'aria-hidden' : 'true' }
        ]
    });
}

/**
 * Shows on the drag proxy what the team held gives, from the same check as the tooltip: green and "Fits SR-1, back
 * 12:40", red and the short reason, or neutral over empty space. Only touched when it changes, so it does not flicker
 * @param {HTMLElement} chip The proxy, or the chip held from the keyboard
 * @param {Object|null} drop See DropController#previewDrop
 */
export function showOnChip(chip, drop) {
    const
        state  = drop ? (drop.result.valid ? 'valid' : 'invalid') : 'neutral',
        text   = drop?.result.short ?? '',
        status = chip?.querySelector('.ow-drag-status');

    if (!status || (chip.dataset.state === state && status.textContent === text)) {
        return;
    }

    chip.dataset.state = state;
    status.textContent = text;
    status.hidden      = !text;
}
