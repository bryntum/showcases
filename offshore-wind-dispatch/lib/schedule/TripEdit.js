import { paxText, teamText } from './TripRendering.js';

/**
 * The trip editor, the TaskEdit feature cut down to the one thing a dispatcher changes: the time on station (the
 * trip's start). Everything else follows from the plan: the end and duration are the engine's, the sail out and back
 * the distance's, the legs' order and waits the data's. TaskEdit owns the edit's transaction: the legs are laid out
 * inside it, before its Save commits (DispatchScheduler#onBeforeTripSave), not in a transaction of their own.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Scheduler/feature/TaskEdit
 * https://bryntum.com/docs/api/Scheduler/widget/taskeditor/SchedulerGeneralTab
 */

export const tripEdit = {
    items : {
        generalTab : {
            items : {
                // The trip has no name of its own: it is in the editor's title
                nameField        : false,
                // A trip stays on its vessel
                resourcesField   : false,
                // Calculated by the engine from the legs
                endDateField     : false,
                durationField    : false,
                percentDoneField : false,
                effortField      : false,
                // The time only: a trip stays on its day
                startDateField   : {
                    label     : 'On station',
                    dateField : { hidden : true },
                    timeField : {
                        format        : 'HH:mm',
                        // Checked as a drag to it would be. `up.` finds the method on the Scheduler that owns the
                        // editor
                        checkValidity : 'up.checkTripTime'
                    }
                },
                // Their length follows from the distance to the turbines (Planner#buildLegs)
                preambleField  : { label : 'Sail out', readOnly : true },
                postambleField : { label : 'Sail back', readOnly : true }
            }
        },
        // The legs' order and the waits come from the data, the constraints are the planner's
        predecessorsTab : false,
        successorsTab   : false,
        advancedTab     : false,
        notesTab        : false
    },
    // Planning against the weather moves trips, it does not remove them
    editorConfig : {
        bbar : {
            items : {
                deleteButton : false
            }
        }
    }
};

/**
 * The beforeTaskEditShow listener: the trip as the title, a helicopter's buffers named as flights, read-only for a trip
 * under way
 * @param {Object} event The TaskEdit feature's beforeTaskEditShow event
 */
export function beforeTripEditShow({ taskRecord : trip, editor }) {
    const
        { preambleField, postambleField, tabBar } = editor.widgetMap,
        by                                        = trip.mode === 'heli' ? 'Fly' : 'Sail',
        locked                                    = !trip.draggable;

    // One tab left: no tab bar. The feature's `items` configure the tabs, not the tab panel, so it is hidden here
    tabBar.hidden        = true;
    // Read-only hides Save, Delete and Cancel, the close tool stays
    editor.readOnly      = locked;
    editor.title         = [trip.id, teamText(trip), paxText(trip), locked && 'under way'].filter(Boolean).join(' · ');
    preambleField.label  = `${by} out`;
    postambleField.label = `${by} back`;
}
