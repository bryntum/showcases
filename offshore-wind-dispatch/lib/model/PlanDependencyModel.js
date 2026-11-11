import { DependencyModelEnterprise } from '@bryntum/scheduler-enterprise';

/**
 * A dependency of the scheduling project, of one of two kinds:
 *
 * - `chain`: a link that keeps a trip's legs in order, each leg starting when the one before it ends. The engine's
 *   business, not drawn (TripRendering#renderDependency)
 * - `plan`: a dependency of the plan in data/farm.json, from a trip into one stop of another trip, drawn with its
 *   `text` as its tooltip
 *
 * Learn more:
 * https://bryntum.com/docs/api/Scheduler/model/DependencyModelEnterprise
 */
export default class PlanDependencyModel extends DependencyModelEnterprise {
    static $name = 'PlanDependencyModel';

    static fields = [
        { name : 'kind', defaultValue : 'plan' },
        // What the stop waits for, "No work on T-45 until the HV circuit is isolated"
        { name : 'text', defaultValue : '' }
    ];

    get isChain() {
        return this.kind === 'chain';
    }
}
