import { ProjectModelEnterprise } from '@bryntum/scheduler-enterprise';
import PlanDependencyModel from './PlanDependencyModel.js';
import TripModel from './TripModel.js';
import VesselModel from './VesselModel.js';
import VesselRangeModel from './VesselRangeModel.js';

/**
 * The Day view's project. It also holds the teams by ID, so a trip finds the names and headcount of its teams through
 * its own project (TripModel#pax, TripRendering#teamText), and lets one change of the plan be placed at a time
 * (`runChange`).
 *
 * Learn more:
 * https://bryntum.com/docs/api/Scheduler/model/ProjectModelEnterprise
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

    /**
     * Runs a change of the plan, one at a time: a booking, a re-plan on a new forecast or its undo, a trip dragged or
     * edited. While the engine places one, `changePending` is true and any other is refused
     * @param {Function} change Changes the plan, may return a Promise
     * @returns {Promise<*>} What `change` returns, `false` when another change is pending
     */
    async runChange(change) {
        const me = this;

        if (me.changePending) {
            return false;
        }

        me.changePending = true;

        try {
            return await change();
        }
        finally {
            me.changePending = false;
        }
    }
}

DispatchProject.initClass();
