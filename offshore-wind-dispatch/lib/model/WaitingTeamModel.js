import { Model } from '@bryntum/core-enterprise';

/**
 * A team waiting at the port for a trip, with its job: a record of the dispatch state's `waitingStore`, which the
 * team tray shows a chip per record of (TeamTray). Booked on a trip, it is removed from the store. Its ID is the
 * team's, or `<team>:<turbine>` for a team waiting again for a stop a forecast cut from its trip: a team may wait
 * for more than one.
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
        // Its turbine is stopped
        { name : 'fault', type : 'boolean' }
    ];
}

WaitingTeamModel.initClass();
