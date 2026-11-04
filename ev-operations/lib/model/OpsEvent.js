import { EventModelEnterprise } from '@bryntum/scheduler-enterprise';
import { minuteMs } from '../util/Time.js';

// Steps of a service job, `{ name, weight }`
const serviceSteps = [
    { name : 'Check-in', weight : 1 },
    { name : 'Diagnose', weight : 1.2 },
    { name : 'Repair', weight : 2 },
    { name : 'QA', weight : 0.8 }
];

/**
 * A production batch, service job or charging session. The `type` field decides how it is rendered.
 */
export default class OpsEvent extends EventModelEnterprise {
    static $name = 'OpsEvent';

    static fields = [
        // 'batch', 'service' or 'charge'
        'type',
        // Live status, 'ok', 'focus' or 'late'. Done and scheduled are derived from the simulated time
        'status',
        { name : 'priority', type : 'boolean' },
        { name : 'delayMinutes', type : 'number' },
        // Production batch
        'model',
        { name : 'units', type : 'number', defaultValue : 0 },
        { name : 'fpy', type : 'number', defaultValue : 100 },
        // Service job. The technician's full name, the people section of the data has their role
        'job',
        { name : 'technician', defaultValue : '' },
        // Service job, and the charging session linked to it (loaner or post-service charge)
        'repairOrder',
        // Vehicle, `body` picks the silhouette ('sedan', 'liftback', 'crossover', 'suv' or 'pickup'), `paint` a paint
        // token in service.css
        'body',
        'paint',
        { name : 'plate', defaultValue : '' },
        // Charging session
        { name : 'socStart', type : 'number', defaultValue : 20 },
        { name : 'socEnd', type : 'number', defaultValue : 80 },
        'purpose',
        { name : 'durationUnit', defaultValue : 'minute' }
    ];

    get liveStatus() {
        return this.status || (this.type === 'charge' ? 'focus' : 'ok');
    }

    // Units per hour of a production batch
    get jobsPerHour() {
        return Math.round((this.units ?? 0) / ((this.endDate - this.startDate) / (60 * minuteMs)));
    }

    // Steps of a service job, for its step pipeline
    get serviceSteps() {
        return serviceSteps;
    }
}
