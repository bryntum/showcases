import { formatTime } from '../util/Time.js';
import { icon } from '../util/Icons.js';

/**
 * The dock slot badge: the door and the slot start, red with a warning when unloading ends after the due time, or the
 * booking state (unbooked, on hold). A component renderer, updated in place as the slot is booked, moved or unbooked.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/
 */
export default class DockSlotCellRenderer {
    init(params) {
        const me = this;

        me.eGui    = document.createElement('span');
        me.warning = document.createElement('i');

        me.warning.className = icon('warning');
        me.warning.setAttribute('aria-hidden', 'true');
        me.refresh(params);
    }

    getGui() {
        return this.eGui;
    }

    refresh({ data }) {
        const { eGui } = this;

        if (data.dockId) {
            eGui.className   = `lct-badge lct-badge-booked${data.slaBreach ? ' lct-badge-breach' : ''}`;
            eGui.textContent = `${data.dockId} · ${formatTime(data.slotStart)}`;
        }
        else {
            eGui.className   = `lct-badge lct-badge-${data.onHold ? 'hold' : 'none'}`;
            eGui.textContent = data.onHold ? 'On hold' : 'Unbooked';
        }

        if (data.dockId && data.slaBreach) {
            eGui.title = `Unloading ends after the due time, ${formatTime(data.dueBy)}`;
            eGui.append(this.warning);
        }
        else {
            eGui.removeAttribute('title');
        }

        return true;
    }
}
