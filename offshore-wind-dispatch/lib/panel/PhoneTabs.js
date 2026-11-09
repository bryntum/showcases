import { TabPanel } from '@bryntum/core-enterprise';

/**
 * The tabs of a phone, where the schedule and the map are one tab each (DispatchApp#updatePhone). The TabPanel gives
 * the tab list, its roles and the switching, and this class adds the arrow keys: the TabBar has the tab roles but no
 * arrow keys (Core/widget/TabBar), the ARIA tabs pattern moves between the tabs with them.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/TabPanel
 */
export default class PhoneTabs extends TabPanel {
    static $name = 'PhoneTabs';

    static type = 'phonetabs';

    static configurable = {
        cls    : 'ow-tabs',
        flex   : 1,
        hidden : true,
        tabBar : { cls : 'ow-tab-bar' }
    };

    afterConstruct() {
        super.afterConstruct();

        this.tabBar.element.addEventListener('keydown', event => this.onTabKey(event));
    }

    // Left and right move to the previous or next tab and show it, as in the ARIA tabs pattern
    onTabKey(event) {
        const
            me    = this,
            step  = { ArrowLeft : -1, ArrowRight : 1 }[event.key],
            count = me.items.length;

        if (step) {
            const index = (me.activeIndex + step + count) % count;

            event.preventDefault();
            me.activeTab = index;
            // The focus stays in the tab list, on the tab shown
            requestAnimationFrame(() => me.tabBar.element.querySelectorAll('[role="tab"]')[index]?.focus());
        }
    }
}

PhoneTabs.initClass();
