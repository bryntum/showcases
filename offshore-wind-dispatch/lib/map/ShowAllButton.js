import { Button } from '@bryntum/core-enterprise';

/**
 * Back to the whole farm, on the map. The map shows it only while it is zoomed or fitted to a trip
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Button
 */
export default class ShowAllButton extends Button {
    static $name = 'ShowAllButton';

    static type = 'showallbutton';

    static configurable = {
        cls       : 'ow-map-whole',
        rendition : 'elevated',
        text      : 'Show all',
        hidden    : true
    };
}

ShowAllButton.initClass();
