/**
 * Progressive disclosure for bars and blocked time clipped by the start edge of the view: what no longer fits the
 * visible part is hidden, one layout pass per microtask after a render, scroll or resize.
 */

const
    // Blocked time shows only its icon below this visible width (px), nothing below minIconWidth
    minLabelWidth = 84,
    minIconWidth  = 20;

export default Target => class ClippedBars extends Target {
    static $name = 'ClippedBars';

    construct(config) {
        super.construct(config);

        this.on({
            horizontalScroll       : 'scheduleLayoutPass',
            renderEvent            : 'scheduleLayoutPass',
            renderTask             : 'scheduleLayoutPass',
            timelineViewportResize : 'scheduleLayoutPass',
            thisObj                : this
        });
    }

    // Coalesces the clipped bar pass, one per microtask: after the render that queued it, before the browser paints
    scheduleLayoutPass() {
        const me = this;

        if (!me.layoutPassQueued) {
            me.layoutPassQueued = true;

            queueMicrotask(() => {
                me.layoutPassQueued = false;

                if (!me.isDestroyed) {
                    me.syncClippedBars();
                }
            });
        }
    }

    /**
     * Bars clipped by the view start drop their right value, then their chip, as they narrow. Blocked time labels
     * follow the visible start edge (`--ev-clip`), then show only the icon, then nothing
     */
    syncClippedBars() {
        const
            { rtl }                                = this,
            { element }                            = this.timeAxisSubGrid,
            { left : viewLeft, right : viewRight } = element.getBoundingClientRect(),
            visible                                = ({ left, right }) =>
                Math.min(right, viewRight) - Math.max(left, viewLeft),
            // All rects are read before any class or style is written, a write between reads forces a reflow
            bars                                   = [...element.querySelectorAll('.ev-row-title')].map(row => {
                const bar = row.closest('.ev-bar');

                return { row, bar, rect : bar.getBoundingClientRect() };
            }),
            ranges                                 = [...element.querySelectorAll('.ev-range')].map(range => ({ range, rect : range.getBoundingClientRect() }));

        for (const { row, bar, rect } of bars) {
            const
                clipped      = rtl ? rect.right > viewRight : rect.left < viewLeft,
                visibleWidth = visible(rect);

            bar.classList.toggle('ev-hide-chip', clipped && visibleWidth < row.dataset.chipAt);
            bar.classList.toggle('ev-hide-right', clipped && visibleWidth < row.dataset.rightAt);
        }

        for (const { range, rect } of ranges) {
            const visibleWidth = visible(rect);

            range.classList.toggle('ev-icon-only', visibleWidth < minLabelWidth);
            range.classList.toggle('ev-label-hidden', visibleWidth < minIconWidth);
            // How far the start edge is clipped, the label is inset by it to stay in the visible part
            range.style.setProperty('--ev-clip', `${Math.max(0, Math.round(rtl ? rect.right - viewRight : viewLeft - rect.left))}px`);
        }
    }
};
