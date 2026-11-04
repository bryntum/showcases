import { clamp } from '../util/Time.js';
import { fonts, textWidth } from '../util/TextMeasure.js';

/**
 * The step pipeline of service jobs and program phases: one track per stage, filled from the overall progress, and the
 * name of the current stage for the detail panel.
 */

// .ev-step-label in bars.css, the gap between step labels
const stepGap = 8;

/**
 * Builds a step pipeline, `stages` is an array of `{ name, weight }`. Each step fills based on the overall progress.
 * Without stages there is no pipeline, the current step is then derived from the status only.
 * @returns {{ domConfig : DomConfig|null, current : String }}
 */
export const stepPipeline = (stages, fraction, status, availableWidth) => {
    const
        total      = stages.reduce((sum, { weight }) => sum + weight, 0),
        labelWidth = stages.reduce((sum, { name }) => sum + textWidth(name, fonts.step) + stepGap, 0),
        showLabels = labelWidth <= availableWidth;

    let
        accumulated = 0,
        current     = '';

    const children = stages.map(({ name, weight }) => {
        const
            from     = accumulated / total,
            to       = (accumulated += weight) / total,
            progress = clamp((fraction - from) / (to - from)),
            active   = progress > 0 && progress < 1;

        if (active) {
            current = name;
        }

        return {
            class : {
                'ev-step'          : 1,
                'ev-step-active'   : active,
                'ev-step-complete' : progress >= 1
            },
            style    : { '--ev-weight' : weight },
            children : [
                showLabels && { tag : 'span', class : 'ev-step-label', text : name },
                {
                    tag      : 'span',
                    class    : 'ev-track',
                    children : [{ tag : 'span', class : 'ev-track-fill', style : { '--ev-fill' : progress } }]
                }
            ]
        };
    });

    if (status === 'done') {
        current = 'Complete';
    }
    else if (status === 'sched') {
        current = 'Not started';
    }
    else if (!current) {
        current = stages.at(-1)?.name ?? 'In progress';
    }

    return {
        current,
        domConfig : stages.length ? { class : 'ev-steps', children } : null
    };
};
