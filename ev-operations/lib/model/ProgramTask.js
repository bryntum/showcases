import { TaskModelEnterprise } from '@bryntum/gantt-enterprise';

/**
 * A phase in the vehicle program, or a group of phases (Design, Validation...)
 */
export default class ProgramTask extends TaskModelEnterprise {
    static $name = 'ProgramTask';

    static fields = [
        // Shown in the tree column, the bars show the name
        'phase',
        // Shown in the chip
        'scope',
        // Full names, the people section of the data has their roles
        { name : 'owners', type : 'array', defaultValue : [] },
        // Sub stages, [{ name, weight }]
        { name : 'stages', type : 'array', defaultValue : [] },
        { name : 'priority', type : 'boolean' },
        // Stage gate passed when the phase completes, G1-G5
        'gate',
        // Schedule slip (days) at the last six weekly snapshots, oldest first. The latest one is replaced by the live
        // variance from the baseline. For a phase finished before the snapshot point, the six weeks up to its end
        { name : 'slipHistory', type : 'array', defaultValue : [] }
    ];

    // Baseline end, used for the slip zone, the variance and the "at risk" status. Parents use the latest baseline
    // end of their children
    get baselineEndDate() {
        if (this.isParent) {
            return this.children.reduce((latest, child) => {
                const end = child.baselineEndDate;

                return end && (!latest || end > latest) ? end : latest;
            }, null);
        }

        return this.baselines?.first?.endDate;
    }
}
