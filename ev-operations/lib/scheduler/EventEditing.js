import { editorDrawer } from '../TimeSpanEditing.js';
import { intersectsBlock } from './BlockedTime.js';

/**
 * Editing events of the scheduler views in the TaskEdit drawer: the editor config with fields per event type, and the
 * rules a save must follow, the same as dragging (same resource, inside the day, no overlap, not into blocked time).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TaskEdit
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel#config-drawer
 */

const
    // Editor fields shown per event type, the others are hidden while editing that type
    editorFields = {
        batch   : ['modelField', 'unitsField', 'fpyField', 'delayField', 'priorityField'],
        service : ['plateField', 'jobField', 'technicianField', 'repairOrderField', 'priorityField'],
        charge  : ['plateField', 'socStartField', 'socEndField', 'purposeField', 'priorityField']
    },
    typeFields   = Object.values(editorFields).flat(),
    editorTitles = { batch : 'Production batch', service : 'Service job', charge : 'Charging session' };

export const
    /**
     * The `taskEdit` feature config. A click selects, double-click or Enter edits in a drawer docked to the end of the
     * viewport. The enterprise tier uses TaskEdit (EventEdit is replaced by it)
     */
    taskEditConfig = {
        editorConfig : editorDrawer,
        items        : {
            generalTab : {
                labelPosition : 'above',
                items         : {
                    // Time only, like dragging: events stay on their resource
                    resourcesField   : false,
                    percentDoneField : false,
                    effortField      : false,
                    durationField    : false,
                    // The tab lays its fields out in two grid columns, date and time need both
                    startDateField   : { cls : 'ev-editor-wide' },
                    endDateField     : { cls : 'ev-editor-wide' },
                    // Production batch. Required fields block the save when cleared, the bars render while editing
                    modelField       : { type : 'text', name : 'model', label : 'Model', weight : 110 },
                    unitsField       : { type : 'number', name : 'units', label : 'Units', min : 1, required : true, weight : 500 },
                    fpyField         : { type : 'number', name : 'fpy', label : 'FPY %', required : true, min : 0, max : 100, step : 0.1, format : '0.0#', weight : 510 },
                    delayField       : { type : 'number', name : 'delayMinutes', label : 'Delay (min)', min : 0, weight : 520 },
                    // Service job and charging session
                    plateField       : { type : 'text', name : 'plate', label : 'Plate', weight : 105 },
                    jobField         : { type : 'text', name : 'job', label : 'Job', required : true, weight : 110 },
                    // Items from the people in the data, see showTypeFields()
                    technicianField  : { type : 'combo', name : 'technician', label : 'Technician', items : [], editable : false, weight : 500 },
                    repairOrderField : { type : 'text', name : 'repairOrder', label : 'Repair order', weight : 510 },
                    // Charging session
                    socStartField    : { type : 'number', name : 'socStart', label : 'SoC start %', required : true, min : 0, max : 100, weight : 500 },
                    socEndField      : { type : 'number', name : 'socEnd', label : 'SoC end %', required : true, min : 0, max : 100, weight : 510 },
                    purposeField     : { type : 'combo', name : 'purpose', label : 'Purpose', items : ['Delivery', 'Fleet', 'Loaner', 'Post-service'], editable : false, weight : 520 },
                    priorityField    : { type : 'slidetoggle', name : 'priority', label : 'Priority', weight : 600 }
                }
            },
            predecessorsTab : false,
            successorsTab   : false,
            advancedTab     : false,
            notesTab        : false
        }
    },

    /**
     * Shows the fields of the edited event's type only, and titles the editor by the type
     * @param {Scheduler.widget.TaskEditor} editor
     * @param {String} type The event `type`
     * @param {String[]} people Full names, the technician choices
     */
    showTypeFields = (editor, type, people) => {
        const
            { widgetMap } = editor,
            shown         = editorFields[type] || [];

        editor.title = editorTitles[type] || 'Event';

        if (widgetMap.technicianField) {
            widgetMap.technicianField.items = people;
        }

        typeFields.forEach(ref => {
            if (widgetMap[ref]) {
                widgetMap[ref].hidden = !shown.includes(ref);
            }
        });
    },

    /**
     * Why the event cannot move to the passed dates (the rules of dragging), `null` when it can
     * @param {Scheduler.view.Scheduler} view
     * @param {Scheduler.model.EventModel} eventRecord
     * @param {Date} startDate
     * @param {Date} endDate
     * @returns {String|null}
     */
    getInvalidRangeReason = (view, eventRecord, startDate, endDate) => {
        const { resource } = eventRecord;

        if (!startDate || !endDate || endDate <= startDate) {
            return 'End must be after start';
        }

        if (startDate < view.startDate || endDate > view.endDate) {
            return 'Outside of the shown day';
        }

        if (intersectsBlock(resource, startDate, endDate)) {
            return `Overlaps blocked time on ${resource.name}`;
        }

        if (!view.isDateRangeAvailable(startDate, endDate, eventRecord, resource)) {
            return `Overlaps another event on ${resource.name}`;
        }

        return null;
    };
