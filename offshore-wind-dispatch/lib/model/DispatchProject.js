import { ProjectModelEnterprise } from '@bryntum/scheduler-enterprise';

/**
 * The Day view's project, the ProjectModelEnterprise whose scheduling engine places the trips, which also holds the
 * teams: a trip finds the names and the headcount of the teams on board through its own project (TripModel#teamText,
 * TripModel#pax)
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ProjectModelEnterprise
 */
export default class DispatchProject extends ProjectModelEnterprise {
    static $name = 'DispatchProject';

    static configurable = {
        /**
         * The teams by ID (DispatchState#teams)
         * @config {Map<String,Object>}
         */
        teams : null
    };
}

DispatchProject.initClass();
