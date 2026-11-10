/**
 * Moves the app's two halves, the schedule and the map, between the container that shows them side by side and the
 * phone's tab panel (PhoneTabs), where each is a tab. The widgets stay the app's, only their parent changes.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container#function-add
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/TabPanel
 */
export default class PhoneLayout {
    /**
     * @param {Object} options
     * @param {Core.widget.Container} options.main Shows the halves side by side
     * @param {Core.widget.TabPanel} options.tabs Shows them as tabs on a phone
     * @param {Core.widget.Widget[]} options.halves The schedule and the map, in tab order
     * @param {Core.widget.Widget[]} options.views The widgets with a `phone` config of their own
     */
    constructor({ main, tabs, halves, views }) {
        Object.assign(this, { main, tabs, halves, views });
    }

    /**
     * Shows the halves as tabs on a phone, side by side otherwise
     * @param {Boolean} phone
     */
    apply(phone) {
        const
            { main, tabs, halves, views } = this,
            [schedule, map]               = halves,
            home                          = phone ? tabs : main;

        views.forEach(view => view.phone = phone);
        map.flex  = phone ? 1 : null;
        map.width = phone ? null : 400;

        // The new home shown first: added to a hidden container, the halves would stay rendered where they were
        tabs.hidden = !phone;
        main.hidden = phone;

        if (schedule.parent !== home) {
            // The tab panel that took them leaves them in the side-by-side container's items, so back there they are
            // removed from both and added again for their elements to move
            if (!phone) {
                tabs.remove(...halves);
                main.remove(...halves);
            }

            home.add(halves);
            // A tab panel shows one of them, side by side both
            halves.forEach(half => half.hidden = false);
        }
    }

    /**
     * Shows the schedule's or the map's tab
     * @param {String} tab `schedule` or `map`
     */
    showTab(tab) {
        this.tabs.activeTab = tab === 'map' ? 1 : 0;
    }

    /**
     * The tab a half stands for
     * @param {Core.widget.Widget} half
     * @returns {String} `schedule` or `map`
     */
    tabOf(half) {
        return half && half === this.halves[1] ? 'map' : 'schedule';
    }
}
