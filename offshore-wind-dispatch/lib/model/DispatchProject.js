import { ProjectModelEnterprise } from '@bryntum/scheduler-enterprise';
import PlanDependencyModel from './PlanDependencyModel.js';
import TripModel from './TripModel.js';
import VesselModel from './VesselModel.js';
import VesselRangeModel from './VesselRangeModel.js';

/**
 * The Day view's project, the ProjectModelEnterprise whose scheduling engine places the trips, which also holds the
 * teams: a trip finds the names and the headcount of the teams on board through its own project (TripModel#pax,
 * TripRendering#teamText)
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ProjectModelEnterprise
 */
export default class DispatchProject extends ProjectModelEnterprise {
    static $name = 'DispatchProject';

    static configurable = {
        eventModelClass             : TripModel,
        resourceModelClass          : VesselModel,
        dependencyModelClass        : PlanDependencyModel,
        resourceTimeRangeModelClass : VesselRangeModel,

        // Undo of a forecast's re-plan (ForecastPlanner): recorded as one transaction, not automatically
        stm : { autoRecord : false },

        /**
         * The teams by ID (DispatchState#teams)
         * @config {Map<String,Object>}
         */
        teams : null
    };
}

DispatchProject.initClass();
