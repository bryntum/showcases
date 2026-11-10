import { TabPanel } from '@bryntum/core-enterprise';

/**
 * The phone's tabs, the schedule and the map (PhoneLayout). Adds the arrow keys to the tab bar's `keyMap`: the TabBar
 * has the ARIA tab roles but not the arrow keys the ARIA tabs pattern moves between the tabs with.
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

    // The focus stays in the tab list, on the tab shown. `event.widget` is the tab bar, whose items are the tabs
    stepTab({ widget }, step) {
        const
            count = this.items.length,
            index = (this.activeIndex + step + count) % count;

        this.activeTab = index;
        widget.items[index]?.focus();
    }
}

PhoneTabs.initClass();
