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
                        format    : 'HH:mm',
                        // A time refused on save (DispatchScheduler#onBeforeTripSave) is fixed by changing it. Not by
                        // the editor's own reload of the trip after the engine has calculated it
                        listeners : { change : ({ source, userAction }) => userAction && source.clearError() }
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
 * Whether a trip can be edited: one that has not left port and is not moved to tomorrow, as for dragging it
 * @param {TripModel} trip
 * @returns {Boolean}
 */
export const canEditTrip = trip => Boolean(trip.draggable) && trip.status !== 'moved' && !trip.draft;

/**
 * The editor for a trip: its ID, team and people on board as the title, a helicopter's buffers are flights
 * @param {Object} event The TaskEdit feature's beforeTaskEditShow event
 */
export function beforeTripEditShow({ taskRecord : trip, editor }) {
    const
        { preambleField, postambleField, tabs } = editor.widgetMap,
        by                                      = trip.mode === 'heli' ? 'Fly' : 'Sail';

    // The editor is reused: no error left from the trip before
    editor.widgetMap.startDateField.timeField.clearError();
    // One tab left: no tab bar
    tabs.tabBar.hidden   = true;
    editor.title         = [trip.id, trip.teamText, `${trip.pax} pax`].join(' · ');
    preambleField.label  = `${by} out`;
    postambleField.label = `${by} back`;
}
