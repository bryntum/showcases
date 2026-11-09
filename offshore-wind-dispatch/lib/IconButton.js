import { Button } from '@bryntum/core-enterprise';
import { icon } from './util/Icons.js';

/**
 * A Button with one of the showcase's inline SVG icons (lib/util/Icons.js) in its icon slot: the Button's `icon` is a
 * CSS class (an icon font), the SVGs are drawn in `currentColor` to follow the button's text.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Button#config-icon
 */
export default class IconButton extends Button {
    static $name = 'IconButton';

    static type = 'iconbutton';

    static configurable = {
        /**
         * The icon's name, see Icons.js
         * @config {String}
         */
        svg : null,

        // The class gives the Button its icon element, the SVG goes into it
        icon : 'ow-button-svg'
    };

    afterConstruct() {
        super.afterConstruct();

        if (this.svg) {
            this.iconElement.innerHTML = icon(this.svg);
        }
    }
}

IconButton.initClass();
