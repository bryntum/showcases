import { DomHelper } from '@bryntum/core-enterprise';
import { createChip } from './DragChip.js';

export const chipSelector = '.ow-team[data-team]';

/**
 * Dragging a team without a pointer. DragHelper has no keyboard drag, so the keyboard holds a team over a trip itself:
 * Enter or Space on a focused chip holds the team over the selected trip (or the first one), the arrow keys move it to
 * the previous or next trip, Enter or Space books it, and Escape or Tab puts it back. The tooltip is a live region
 * (DropTooltip), so a screen reader reads what each trip would give.
 *
 * Also what `?state=drag` and the tests use to show a team held over a trip: `showHeld()`.
 *
 * It works through the TeamDrag it belongs to, which holds the team, the preview and the tooltip.
 */
export default class KeyboardDrag {
    /**
     * @param {Object} options
     * @param {TeamDrag} options.drag
     */
    constructor({ drag }) {
        const me = this;

        me.drag    = drag;
        me.onChipKey = event => me.onChipKeyDown(event);
        me.onHeldKey = event => me.onHeldKeyDown(event);
        drag.tray.element.addEventListener('keydown', me.onChipKey);
    }

    destroy() {
        this.endHeld();
        this.drag.tray.element.removeEventListener('keydown', this.onChipKey);
    }

    // Enter or Space on a team's chip holds it over a trip
    onChipKeyDown(event) {
        const chip = (event.key === 'Enter' || event.key === ' ') && !this.drag.isDragging &&
            event.target.closest(chipSelector);

        if (chip) {
            event.preventDefault();
            this.start(chip.dataset.team);
        }
    }

    /**
     * Holds a team over the selected trip, or the first one, for the keyboard to move and drop
     * @param {String} teamId
     */
    start(teamId) {
        const
            me    = this,
            { scheduler, handler } = me.drag,
            trips = handler.dropTargets(),
            index = Math.max(0, trips.indexOf(scheduler.selectedEvents[0]));

        if (trips.length) {
            me.keyboard = { trips, index };
            me.showHeld(teamId, trips[index]);
        }
    }

    /**
     * The trips the arrows step through, read again after the forecast, which may have moved some to tomorrow
     * @param {TripModel} trip The trip the team is held over
     */
    refreshTrips(trip) {
        const { keyboard } = this;

        if (keyboard) {
            keyboard.trips = this.drag.handler.dropTargets();
            keyboard.index = keyboard.trips.indexOf(trip);
        }
    }

    // While held from the keyboard: the arrows move the team to another trip, Enter or Space books, Escape cancels,
    // Tab puts it back and moves on
    onHeldKeyDown(event) {
        const
            me   = this,
            team = me.drag.team,
            step = { ArrowRight : 1, ArrowDown : 1, ArrowLeft : -1, ArrowUp : -1 }[event.key];

        if (!team || !me.heldChip) {
            return;
        }

        if (event.key === 'Tab') {
            me.endHeld();

            return;
        }

        if (step && me.keyboard) {
            me.step(step);
        }
        else if ((event.key === 'Enter' || event.key === ' ') && me.keyboard) {
            me.book(team);
        }
        else if (event.key === 'Escape') {
            me.endHeld();
            me.focusChip(team);
        }
        else {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
    }

    // Holds the team over the previous or next trip
    step(step) {
        const
            { keyboard } = this,
            count        = keyboard.trips.length,
            // Held over a trip no longer in the list (the forecast moved it), the arrows start from either end
            from         = keyboard.index < 0 ? (step > 0 ? -1 : 0) : keyboard.index;

        if (count) {
            keyboard.index = (from + step + count) % count;
            this.holdOver(keyboard.trips[keyboard.index]);
        }
    }

    // Books the team on the trip it is held over
    book(team) {
        const
            me     = this,
            target = me.drag.handler.held?.target ?? me.keyboard.trips[me.keyboard.index];

        if (target) {
            me.drag.handler.dropTeam(team, target);
        }

        me.endHeld();
        me.focusChip(team);
    }

    // Focus back on the team's chip, or the first one once it is booked
    focusChip(teamId) {
        const { tray } = this.drag;

        (tray.chipOf(teamId) ?? tray.chips[0])?.focus();
    }

    /**
     * Shows a team held over a trip without a pointer, the chip on the trip's previewed stop. For the URL state
     * `?state=drag`, the screenshots and the tests, and for the keyboard. Escape puts the team back, as in a drag
     * @param {String} teamId
     * @param {TripModel} trip
     */
    showHeld(teamId, trip) {
        const
            me           = this,
            { team, job } = me.drag.handler.waitingTeam(teamId);

        me.drag.lift(teamId);
        me.heldChip = createChip(team, job);
        document.body.appendChild(me.heldChip);
        document.addEventListener('keydown', me.onHeldKey, true);
        me.holdOver(trip);
    }

    /**
     * Moves a team held without a pointer over a trip, the chip and the tooltip on the trip's previewed stop
     * @param {TripModel} trip
     * @returns {Promise} Resolves once the chip is placed
     */
    async holdOver(trip) {
        const
            me                     = this,
            { handler, scheduler } = me.drag;

        handler.previewDrop(me.drag.team, trip);

        if (me.keyboard) {
            scheduler.scrollEventIntoView(trip, { block : 'nearest' });
        }

        // The engine places the previewed stop first
        await scheduler.project.commitAsync();

        const
            drop  = handler.held,
            rect  = (await me.previewElement(drop?.trip))?.getBoundingClientRect(),
            point = rect ?
                { x : rect.left + rect.width / 2, y : rect.top + 8 } :
                { x : innerWidth / 2, y : innerHeight / 2 };

        // Still held over this trip, the keys may have moved on
        if (me.heldChip && handler.held === drop && drop?.target === trip) {
            DomHelper.setTranslateXY(me.heldChip, point.x - 20, point.y + 8);
            me.drag.hover(trip, point);
        }
    }

    /**
     * The element of a trip's previewed stop. The NestedEvents feature draws a changed leg on the next frame, so a stop
     * not drawn yet is waited for: the trip's next `renderEvent`, given up after half a second
     * @param {TripModel} [trip]
     * @returns {Promise<HTMLElement|null>} `null` when there is no previewed stop (a helicopter takes no team)
     */
    async previewElement(trip) {
        const
            { scheduler } = this.drag,
            leg           = trip?.legRecords.find(each => each.preview),
            element       = () => leg && !leg.isDestroyed ? scheduler.getElementFromEventRecord(leg) : null;

        if (!leg || element()) {
            return element();
        }

        await new Promise(resolve => {
            const detach = scheduler.on({
                renderEvent({ eventRecord }) {
                    if (eventRecord === trip) {
                        detach();
                        resolve();
                    }
                },
                expires : { delay : 500, alt : resolve }
            });
        });

        return element();
    }

    endHeld() {
        const me = this;

        if (me.heldChip) {
            document.removeEventListener('keydown', me.onHeldKey, true);
            me.heldChip.remove();
            me.heldChip = me.keyboard = null;
            me.drag.end();
        }
    }
}
