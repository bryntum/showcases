import { Container, StringHelper } from '@bryntum/core-enterprise';
import { icon } from './util/Icons.js';
import { duration } from './util/Time.js';

// "T-34 fault", "T-02 annual service"
const jobText = ({ turbine, job, short }, fault) => `${turbine} ${fault ? 'fault' : (short ?? job).toLowerCase()}`;

/**
 * The crews waiting at the port, in the header: a title over a List of DispatchState#waitingStore, a card per team.
 * Each card is a drag source of TeamDrag, which finds it by its `data-team`. Its certificates and full job are in its
 * tooltip, so the card stays two short lines.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/List
 */
export default class TeamTray extends Container {
    static $name = 'TeamTray';

    static type = 'teamtray';

    static configurable = {
        port : null,

        // WaitingTeamModel records
        store : null,

        // The ID of the team dragged: its card stays in the tray, dimmed
        lifted : null,

        cls    : 'ow-tray',
        layout : { type : 'hbox', align : 'center' },
        items  : {
            head : {
                type   : 'container',
                cls    : 'ow-tray-head',
                layout : 'vbox',
                items  : {
                    title : { type : 'widget', cls : 'ow-tray-title' },
                    hint  : { type : 'widget', cls : 'ow-tray-hint', html : 'Drag onto a trip' }
                }
            },
            empty : { type : 'widget', cls : 'ow-tray-empty', html : 'Every team has a trip' },
            // Only shown: no selection, no keyboard navigation, no scrolling of its own
            list  : {
                type            : 'list',
                cls             : 'ow-crews',
                itemCls         : 'ow-crew',
                navigator       : false,
                itemsFocusable  : false,
                scrollable      : null,
                isSelectable    : () => false,
                itemTpl         : 'up.cardHtml',
                tooltipTemplate : ({ team, job }) =>
                    `${team.techs} technicians, ${team.certs.join(', ')} · ${job.turbine} ${job.job}`
            }
        }
    };

    // Two short lines that never wrap: "Team F · 2" over "T-34 fault · 48 min"
    cardHtml({ id, team, job, fault }) {
        const cls = `ow-team${fault ? ' ow-team-fault' : ''}${id === this.lifted ? ' ow-team-lifted' : ''}`;

        return StringHelper.xss`<div class="${cls}" data-team="${id}"><span class="ow-team-crew">` +
            `${icon('users')}</span>` + StringHelper.xss`<span class="ow-team-text">
                <span class="ow-team-name"><b>${team.name}</b> · ${team.techs}</span>
                <span class="ow-team-job">${jobText(job, fault)} · ${duration(job.minutes)}</span>
            </span></div>`;
    }

    updateStore(store) {
        const me = this;

        me.widgetMap.list.store = store;
        me.detachListeners('store');
        store?.ion({ name : 'store', change : 'updatePort', thisObj : me });
        me.updatePort();
    }

    // The title counts the teams
    updatePort() {
        const
            { title, hint, empty } = this.widgetMap ?? {},
            count                  = this.store?.count ?? 0;

        if (!title) {
            return;
        }

        title.html   = `Crews waiting at ${StringHelper.encodeHtml(this.port ?? 'the port')} · ${count}`;
        hint.hidden  = !count;
        empty.hidden = Boolean(count);
    }

    // On the card itself, not by redrawing the list: the drag holds the card's element
    updateLifted(lifted) {
        this.element?.querySelectorAll('.ow-team[data-team]').forEach(card =>
            card.classList.toggle('ow-team-lifted', card.dataset.team === lifted));
    }
}

TeamTray.initClass();
