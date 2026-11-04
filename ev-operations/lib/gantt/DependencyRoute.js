/**
 * Quiet dependency lines of the Vehicle program view: dimmed once their predecessor is done, and routed down right
 * after the predecessor into the start of the successor along its own row.
 *
 * Learn more:
 * https://bryntum.com/products/gantt/docs/api/Gantt/feature/Dependencies#config-renderer
 */

const
    // Dependency route: the stub out of the predecessor, and the shortest run into the successor
    linkStub  = 8,
    linkEntry = 12;

/**
 * Dependency renderer. Dims the line once its predecessor is done (`ev-done`), and routes end-to-start lines going down
 * and right along the successor's row into its start instead of into its top. Short gaps keep Gantt's route
 * @param {ProgramGantt} view
 * @param {Object} renderData The renderer's arguments
 */
export const renderDependency = (view, { domConfig, dependencyRecord, fromBox, toBox, fromSide, toSide }) => {
    domConfig.class['ev-done'] = view.getStatus(dependencyRecord.fromTask) === 'done';

    // Gantt enters the top of the successor only for end-to-start lines going down and right. RTL intentionally keeps
    // the stock routing
    if ((fromSide === 'top' || toSide === 'top') && !view.rtl) {
        const fromRow = view.getRowFor(dependencyRecord.fromTask);

        if (!fromRow) {
            return;
        }

        const
            // Gantt passes the boxes swapped (bryntum/support#14017), the predecessor's box is the one in its row
            swapped    = !(fromBox.y >= fromRow.top && fromBox.y < fromRow.bottom),
            [from, to] = swapped ? [toBox, fromBox] : [fromBox, toBox],
            x1         = from.right,
            y1         = from.y + from.height / 2,
            x2         = to.x,
            y2         = to.y + to.height / 2,
            turn       = x1 + linkStub,
            // Corners as rounded as the feature's radius, as far as the segments allow
            r          = Math.min(view.features.dependencies.radius ?? 0, linkStub, (y2 - y1) / 2);

        if (x2 - x1 >= linkStub + linkEntry && y2 - y1 > 2 * r) {
            // From the predecessor to the successor. Gantt draws its lines the other way round, with the arrow head
            // as the start marker, so this line moves it to its end
            domConfig.d     = `M${x1},${y1} H${turn - r} a${r},${r} 0 0 1 ${r},${r} V${y2 - r} a${r},${r} 0 0 0 ${r},${r} H${x2}`;
            domConfig.style = { ...domConfig.style, markerStart : 'none', markerEnd : 'var(--b-dependency-marker)' };
        }
    }
};
