/**
 * Editing shared by the three views: the TaskEdit drawer and the Shift + arrow key nudge of the selected bar.
 *
 * Learn more:
 * https://bryntum.com/products/gantt/docs/api/Core/widget/Panel#config-drawer
 * https://bryntum.com/products/gantt/docs/api/Core/widget/mixin/KeyMap
 */

/**
 * The `editorConfig` of the TaskEdit feature: a drawer docked to the end of the viewport. Its own autoClose would hide
 * it on an outside click without ending the edit, the editor cancels on focus out instead. Bars are not created or
 * removed in this demo, so there is no delete button
 */
export const editorDrawer = {
    drawer : { autoClose : false },
    cls    : 'ev-editor',
    bbar   : { items : { deleteButton : false } }
};

/**
 * Plain arrow keys move the focus between bars, Shift + arrow keys move the selected bar one step in time. The view
 * implements `nudge(steps)`, returning `true` when the bar moved
 */
export default Target => class TimeSpanEditing extends Target {
    static $name = 'TimeSpanEditing';

    static configurable = {
        keyMap : {
            'Shift+ArrowLeft'  : 'nudgeEarlier',
            'Shift+ArrowRight' : 'nudgeLater'
        }
    };

    nudgeEarlier() {
        return this.nudge(-1);
    }

    nudgeLater() {
        return this.nudge(1);
    }
};
