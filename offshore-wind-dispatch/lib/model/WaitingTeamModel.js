import { Model } from '@bryntum/core-enterprise';

/**
 * A team waiting at the port with its job, a record of DispatchState#waitingStore; removed once booked. Its ID is the
 * team's, or `<team>:<turbine>` for a team waiting again for a stop a forecast cut: a team may wait for more than one.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/data/Model
 */
export default class WaitingTeamModel extends Model {
    static $name = 'WaitingTeamModel';

    static fields = [
        // The team, `{ id, name, techs, certs }`
        { name : 'team', type : 'object' },
        // Its job, `{ turbine, job, type, minutes, certs }`
        { name : 'job', type : 'object' },
        // The turbine is stopped
        { name : 'fault', type : 'boolean' },
        // Screen state for the tray's card, not data: dragged (`lifted`), its booking being placed by the engine
        // (`pending`). Not persisted, which also keeps them out of the forecast's undo history (the STM records no
        // change of a `persist : false` field)
        { name : 'lifted', type : 'boolean', persist : false },
        { name : 'pending', type : 'boolean', persist : false },
        // What the tray's List reads out for it
        { name : 'text', calculate : ({ team, job }) => `${team.name}, ${job.turbine} ${job.job}` }
    ];
}

WaitingTeamModel.initClass();
