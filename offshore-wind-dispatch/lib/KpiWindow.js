import { Container, ProgressBar } from '@bryntum/core-enterprise';
import { duration, hhmm } from './util/Time.js';

/**
 * The one big thing on the screen: when the crew transfer vessels' weather window closes, and a thin countdown from
 * the start of the day to the close (a Bryntum ProgressBar, the time gone filled in) with how long is left under it.
 * When a forecast closes the window earlier the old time stays beside it, struck through.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/ProgressBar
 */
export default class KpiWindow extends Container {
    static $name = 'KpiWindow';

    static type = 'kpiwindow';

    static configurable = {
        cls    : 'ow-window',
        layout : { type : 'hbox', align : 'center' },
        items  : {
            heading   : { type : 'widget', cls : 'ow-window-heading' },
            countdown : {
                type   : 'container',
                cls    : 'ow-window-countdown',
                layout : 'default',
                items  : {
                    bar : {
                        type      : ProgressBar.type,
                        cls       : 'ow-window-bar',
                        color     : null,
                        ariaLabel : 'Time gone of the CTV weather window'
                    },
                    left : { type : 'widget', cls : 'ow-window-left' }
                }
            }
        }
    };

    /**
     * Shows the window
     * @param {Object} values
     * @param {Number} values.opens When the day's window opens, the start of the countdown
     * @param {Number} values.now
     * @param {Number} values.closes When the CTV window closes
     * @param {Number} [values.was] When it closed before the latest forecast
     */
    draw({ opens, now, closes, was }) {
        const
            me                    = this,
            { heading, bar, left } = me.widgetMap,
            moved                 = was != null && was !== closes,
            text                  = closes > now ? `${duration(closes - now)} left` : 'Closed';

        me.toggleCls('ow-window-short', moved);
        heading.html = [
            { tag : 'small', text : 'CTV weather window' },
            { tag : 'b', text : `Closes ${hhmm(closes)}` },
            moved ? { tag : 'em', text : `was ${hhmm(was)}` } : null
        ];

        Object.assign(bar, {
            max       : closes - opens,
            value     : Math.min(Math.max(now - opens, 0), closes - opens),
            label     : hhmm(opens),
            valueText : hhmm(closes)
        });
        left.html = text;
    }
}

KpiWindow.initClass();
