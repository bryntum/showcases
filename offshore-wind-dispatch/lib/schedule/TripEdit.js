/**
 * The trip editor: the TaskEdit feature tuned to what a dispatcher changes on a trip, its time on station (its start).
 * The sail out and back are shown, read-only: their length follows from the distance (its preamble and postamble). The
 * rest is the plan's: the end, duration and progress are the engine's, the vessel is fixed (a trip is dragged along its
 * own row only), the legs' order and the waits are dependencies the data draws. So only the General tab, without its
 * tab bar, the trip itself as the title.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TaskEdit
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/widget/taskeditor/SchedulerGeneralTab
 */

/**
 * The TaskEdit feature's config
 * @type {Object}
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
                // Today's trips: the time only, on the 24h clock of the schedule
                startDateField   : {
                    label     : 'On station',
                    dateField : { hidden : true },
                    timeField : {
                        format        : 'HH:mm',
                        // Checked as a drag to it is, the reason shown on the field: the editor does not save an
                        // invalid time. `up.` finds the method on the Scheduler that owns the editor
                        checkValidity : 'up.checkTripTime'
                    }
                },
                // How long the sail out and back take follows from the distance to the turbines (Planner#buildLegs)
                preambleField  : { label : 'Sail out', readOnly : true },
                postambleField : { label : 'Sail back', readOnly : true }
            }
        },
        // The legs' order and the waits are drawn from the data, the constraints are the planner's
        predecessorsTab : false,
        successorsTab   : false,
        advancedTab     : false,
        notesTab        : false
    }
};

/**
 * Why a trip's time cannot be changed, as it cannot be dragged: it has left port, or is moved to tomorrow
 * @param {TripModel} trip
 * @returns {String|null}
 */
const lockedBecause = trip => trip.status === 'moved' ? 'moved to tomorrow' : (trip.draggable ? null : 'under way');

/**
 * The editor for a trip: its ID, team and people on board as the title, a helicopter's buffers are flights. Read-only
 * for a trip that cannot be moved
 * @param {Object} event The TaskEdit feature's beforeTaskEditShow event
 */
export function beforeTripEditShow({ taskRecord : trip, editor }) {
    const
        { preambleField, postambleField, tabBar } = editor.widgetMap,
        by                                        = trip.mode === 'heli' ? 'Fly' : 'Sail',
        locked                                    = lockedBecause(trip);

    // One tab left: no tab bar. The feature's `items` configure the tabs, not the tab panel, so it is hidden here
    tabBar.hidden        = true;
    // A trip under way or moved to tomorrow is shown, read-only (no Save, Delete or Cancel, the close tool stays)
    editor.readOnly      = Boolean(locked);
    editor.title         = [trip.id, trip.teamText, `${trip.shownPax} pax`, locked].filter(Boolean).join(' · ');
    preambleField.label  = `${by} out`;
    postambleField.label = `${by} back`;
}
