import { Rectangle, Tooltip } from '@bryntum/core-enterprise';
import { iconConfig } from '../util/Icons.js';
import { hhmm } from '../util/Time.js';

// `drop` is DropController#previewDrop's result
function dropTipContent({ trip, team, job, result, reach, close }) {
    const
        name  = trip.draft ? `a new trip, ${trip.id} from port at ${hhmm(trip.departs)}` : trip.id,
        head  = result.valid ? [iconConfig('check-circle'), { tag : 'span', text : `${job.turbine} fits on ${name}` }] :
            [iconConfig('warning'), { tag : 'span', text : `${job.turbine} does not fit on ${name}` }],
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
        }
    ];
}

/**
 * The tooltip of a team held over a trip, shown by the point the team is held at rather than by hovering an element.
 * It is a live region, so a screen reader reads what each trip would give as the team moves from trip to trip.
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
        autoShow          : false,
        hideDelay         : false,
        dismissDelay      : 0,
        role              : 'status',
        elementAttributes : { 'aria-live' : 'polite' }
    };

    // `point` is in the viewport
    showDrop(drop, point) {
        this.html = dropTipContent(drop);
        this.element.classList.toggle('ow-drop-tip-invalid', !drop.result.valid);
        this.showBy({
            target : new Rectangle(point.x, point.y, 1, 1),
            align  : 't0-b0',
            offset : 42
        });
    }
}

DropTooltip.initClass();
