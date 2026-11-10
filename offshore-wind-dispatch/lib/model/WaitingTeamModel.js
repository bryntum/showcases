import { Model } from '@bryntum/core-enterprise';

/**
 * A team waiting at the port with its job, a record of DispatchState#waitingStore; removed once booked. Its ID is the
 * team's, or `<team>:<turbine>` for a team waiting again for a stop a forecast cut: a team may wait for more than one.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/data/Model
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
        // What the tray's List reads out for it
        { name : 'text', calculate : ({ team, job }) => `${team.name}, ${job.turbine} ${job.job}` }
    ];
}

WaitingTeamModel.initClass();
