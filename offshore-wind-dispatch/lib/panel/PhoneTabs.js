import { TabPanel } from '@bryntum/core-enterprise';

/**
 * The tabs of a phone, where the schedule and the map are one tab each (DispatchApp#updatePhone). The TabPanel gives
 * the tab list, its roles and the switching, and this class adds the arrow keys through the tab bar's `keyMap`: the
 * TabBar has the tab roles but no arrow keys, the ARIA tabs pattern moves between the tabs with them.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/TabPanel
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/mixin/KeyMap
 */
export default class PhoneTabs extends TabPanel {
    static $name = 'PhoneTabs';

    static type = 'phonetabs';

    static configurable = {
        cls    : 'ow-tabs',
        flex   : 1,
        hidden : true,
        tabBar : {
            cls    : 'ow-tab-bar',
            keyMap : {
                ArrowLeft  : 'up.previousTab',
                ArrowRight : 'up.nextTab'
            }
        }
    };

    previousTab(event) {
        this.stepTab(event, -1);
    }

    nextTab(event) {
        this.stepTab(event, 1);
    }

    // Shows the previous or next tab, and the focus stays in the tab list, on the tab shown. `event.widget` is the tab
    // bar, whose items are the tabs
    stepTab({ widget }, step) {
        const
            count = this.items.length,
            index = (this.activeIndex + step + count) % count;

        this.activeTab = index;
        widget.items[index]?.focus();
    }
}

PhoneTabs.initClass();
