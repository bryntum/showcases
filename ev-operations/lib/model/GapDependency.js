import { DependencyModelEnterprise } from '@bryntum/scheduler-enterprise';

/**
 * Dependencies are used to draw the gap indicator between two consecutive events on the same resource. They are
 * inactive, so they do not affect scheduling.
 */
export default class GapDependency extends DependencyModelEnterprise {
    static $name = 'GapDependency';

    static fields = [
        { name : 'active', type : 'boolean', defaultValue : false }
    ];
}
