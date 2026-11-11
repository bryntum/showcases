import { svgNs } from '../Glyphs.js';
import { barGap } from '../bar/BarParts.js';
import { minuteMs } from '../util/Time.js';
import { fonts, textWidth } from '../util/TextMeasure.js';
import { intersectsBlock } from './BlockedTime.js';

/**
 * Gap indicators between consecutive events on a resource, drawn by the Dependencies feature: inactive dependencies
 * kept in sync with the events, and a dependency renderer turning each line into a dashed gap with a label.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Scheduler/feature/Dependencies#config-renderer
 */

const
    // Gaps narrower than this (px) are not indicated at all
    minGapPx  = 4,
    // 55m, 1h 20m, 2h
    formatGap = minutes => {
        const rest = minutes % 60;

        if (minutes < 60) {
            return `${minutes}m`;
        }

        return `${Math.floor(minutes / 60)}h${rest ? ` ${rest}m` : ''}`;
    },
    // Scheduled events only, in a stable order. Unscheduled ones would flip the dependencies between syncs
    scheduledEvents = resource => resource.events
        .filter(event => event.startDate && event.endDate)
        .sort((a, b) => a.startDate - b.startDate || String(a.id).localeCompare(String(b.id)));

export const
    /**
     * Inactive dependencies between consecutive events on each resource, drawing the gap indicators only. Committed
     * right away, so they never show up in `project.changes` or a sync
     * @param {Scheduler.view.Scheduler} view
     */
    syncGapDependencies = ({ dependencyStore, resourceStore }) => {
        const
            wanted   = new Map(),
            obsolete = [];

        resourceStore.forEach(resource => {
            const events = resource.showGaps ? scheduledEvents(resource) : [];

            for (let i = 1; i < events.length; i++) {
                // Time blocked by a die change or a breakdown is not a scheduling gap
                if (!intersectsBlock(resource, events[i - 1].endDate, events[i].startDate)) {
                    wanted.set(`${events[i - 1].id}>${events[i].id}`, [events[i - 1], events[i]]);
                }
            }
        });

        dependencyStore.forEach(dependency => {
            const key = `${dependency.fromEvent?.id}>${dependency.toEvent?.id}`;

            if (wanted.has(key)) {
                wanted.delete(key);
            }
            else {
                obsolete.push(dependency);
            }
        });

        if (obsolete.length) {
            dependencyStore.remove(obsolete);
        }

        if (wanted.size) {
            dependencyStore.add([...wanted.values()].map(([fromEvent, toEvent]) => ({ fromEvent, toEvent })));
        }

        // The dependency store holds the gap dependencies only
        if (obsolete.length || wanted.size) {
            dependencyStore.commit(true);
        }
    },

    /**
     * Dependency renderer, turns the line into a dashed line across the gap with a centered label. Uses the rendered
     * boxes, so it follows drag and resize live
     * @param {Scheduler.view.Scheduler} view
     * @param {Object} renderData The renderer's arguments
     */
    renderGap = ({ timeAxisViewModel, scenario }, { domConfig, fromBox, toBox }) => {
        // Only the dependency line itself is turned into a gap indicator
        if (domConfig.tag !== 'path') {
            return;
        }

        // Horizontal mode only, both boxes are on the same row
        const
            // Between the two boxes, also in RTL where the earlier event is on the right
            fromX      = Math.min(fromBox.right, toBox.right),
            toX        = Math.max(fromBox.x, toBox.x),
            gapPx      = toX - fromX - barGap,
            // The bars end `barGap` px before their end date. Rounded to the 5 minute snap, boxes are whole pixels
            minutes    = Math.round(gapPx / timeAxisViewModel.getDistanceForDuration(minuteMs) / 5) * 5,
            label      = formatGap(minutes),
            // Width for the widest label of the same shape, digits are tabular so it does not jiggle
            labelWidth = textWidth(label.replace(/\d/g, '0'), fonts.gap) + 14,
            // Hide everything for a gap of a few px, only the label when it does not fit
            hidden     = minutes <= 0 || gapPx < minGapPx,
            showLabel  = labelWidth <= gapPx + barGap,
            y          = Math.round(fromBox.y + fromBox.height / 2) + 0.5,
            centerX    = (fromX + toX) / 2,
            inset      = Math.min(6, gapPx / 3);

        delete domConfig.d;

        Object.assign(domConfig, {
            tag      : 'g',
            children : hidden ? [] : [
                { tag : 'path', ns : svgNs, class : 'ev-gap-line', d : `M${fromX + inset} ${y} H${toX - inset}` },
                showLabel && {
                    tag    : 'rect',
                    ns     : svgNs,
                    class  : 'ev-gap-box',
                    x      : centerX - labelWidth / 2,
                    y      : y - 9.5,
                    width  : labelWidth,
                    height : 19,
                    rx     : 4
                },
                showLabel && { tag : 'text', ns : svgNs, class : 'ev-gap-label', x : centerX, y : y + 0.5, text : label }
            ]
        });

        Object.assign(domConfig.class, {
            'ev-gap'       : 1,
            'ev-gap-tight' : minutes < scenario.tightGap
        });
    };
