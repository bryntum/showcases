import { Rectangle, Tooltip } from '@bryntum/core-enterprise';
import { iconConfig } from '../util/Icons.js';
import { hhmm } from '../util/Time.js';

/**
 * The content of the tooltip of a team held over a trip, as DomConfigs
 * @param {Object} drop See DropController#previewDrop
 * @param {Boolean} [keyboard] Held from the keyboard, the tooltip lists the keys
 * @returns {Object[]} DomConfig
 */
function dropTipContent({ trip, team, job, result, reach, close }, keyboard = false) {
    const
        // A vessel with no trip left to join gets a new one
        name  = trip.draft ? `a new trip, ${trip.id} from port at ${hhmm(trip.departs)}` : trip.id,
        head  = result.valid ? [iconConfig('check-circle'), { tag : 'span', text : `${job.turbine} fits on ${name}` }] :
            [iconConfig('warning'), { tag : 'span', text : `${job.turbine} does not fit on ${name}` }],
        // Each certificate with a small icon: a check in the work blue if the team holds it, a red cross if not
        certs = result.certs.map(cert => {
            const held = team.certs.includes(cert);

            return {
                tag      : 'span',
                class    : `ow-drop-cert ow-drop-cert-${held ? 'held' : 'missing'}`,
                children : [cert, iconConfig(held ? 'check' : 'x')]
            };
        }),
        rows  = [
            ['On station', `${hhmm(result.stop.from)} – ${hhmm(result.stop.to)}`],
            ['Back in port by', [{ tag : 'b', text : hhmm(result.back) }, `, window closes ${hhmm(close)}`]],
            ['Seats', `${result.seats} / ${trip.resource?.seats} PAX`],
            ['Certificates', certs]
        ].flatMap(([term, value]) => [
            { tag : 'dt', text : term },
            Array.isArray(value) ? { tag : 'dd', children : value } : { tag : 'dd', text : value }
        ]);

    return [
        { class : 'ow-drop-tip-head', children : head },
        { tag : 'dl', children : rows },
        {
            class : 'ow-drop-tip-foot',
            text  : result.valid ?
                `${trip.id} can still reach ${reach.size} turbines before ${hhmm(close)}, see the map` :
                result.reason
        },
        keyboard && {
            class    : 'ow-drop-tip-keys',
            children : [
                { tag : 'kbd', text : '←' }, ' ', { tag : 'kbd', text : '→' }, ' another trip · ',
                { tag : 'kbd', text : 'Enter' }, ' book · ', { tag : 'kbd', text : 'Esc' }, ' cancel'
            ]
        }
    ];
}

/**
 * The tooltip of a team held over a trip: a Bryntum Tooltip shown by the point the team is held at, not by hovering an
 * element. Its alignment keeps it in the viewport. It is a live region, so a screen reader reads what each trip would
 * give as the team moves from trip to trip.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip
 */
export default class DropTooltip extends Tooltip {
    static $name = 'DropTooltip';

    static type = 'droptooltip';

    static configurable = {
        cls               : 'ow-drop-tip',
        anchor            : false,
        // Shown and hidden by showDrop(), not by hovering an element
        autoShow          : false,
        hideDelay         : false,
        dismissDelay      : 0,
        // A live region, read out as the team moves from trip to trip
        role              : 'status',
        elementAttributes : { 'aria-live' : 'polite' }
    };

    /**
     * Shows what a team gives on a trip, below a point
     * @param {Object} drop See DropController#previewDrop
     * @param {{x: Number, y: Number}} point In the viewport: a one px rectangle at the pointer, or at the stop held
     * from the keyboard
     * @param {Boolean} keyboard Held from the keyboard
     */
    showDrop(drop, point, keyboard) {
        this.html = dropTipContent(drop, keyboard);
        this.element.classList.toggle('ow-drop-tip-invalid', !drop.result.valid);
        this.showBy({
            target : new Rectangle(point.x, point.y, 1, 1),
            align  : 't0-b0',
            offset : 42
        });
    }
}

DropTooltip.initClass();
