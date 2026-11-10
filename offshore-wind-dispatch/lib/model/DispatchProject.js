import { ProjectModelEnterprise } from '@bryntum/scheduler-enterprise';
import PlanDependencyModel from './PlanDependencyModel.js';
import TripModel from './TripModel.js';
import VesselModel from './VesselModel.js';
import VesselRangeModel from './VesselRangeModel.js';

/**
 * The Day view's project. It also holds the teams by ID, so a trip finds the names and headcount of its teams through
 * its own project (TripModel#pax, TripRendering#teamText).
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

        // The no-go and ghost ranges and the now line are derived anew on each change (DispatchScheduler#syncRanges):
        // `syncDataOnLoad` updates the records that stay instead of replacing them
        resourceTimeRangeStore : { syncDataOnLoad : true },
        timeRangeStore         : { syncDataOnLoad : true },

        // Undo of a forecast's re-plan (ForecastPlanner): recorded as one transaction, not automatically
        stm : { autoRecord : false },

        // DispatchState#teams
        teams : null
    };
}

DispatchProject.initClass();
