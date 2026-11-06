import { Container } from '@bryntum/core-enterprise';
import { icon } from './util/Icons.js';

// Simulated minutes per tick, by button
const speeds = { speed1 : 1, speed5 : 5, speed15 : 15 };

/**
 * The speed of the simulation, a button making a truck run late, and play / pause, bound to a Simulator through its
 * `simulator` config. Follows the
 * simulator's `playStateChange` event, so the button also flips when the simulation pauses on its own (end of the
 * timeline, hidden tab). Play keeps one width for both labels (toolbar.css).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/ButtonGroup
 */
export default class SimulationControls extends Container {
    static $name = 'SimulationControls';

    static type = 'simulationcontrols';

    static configurable = {
        /**
         * The simulator the controls drive
         * @config {Simulator}
         */
        simulator : null,

        cls    : 'lct-controls',
        layout : 'hbox',

        items : {
            speed : {
                type        : 'buttongroup',
                cls         : 'lct-speed',
                rendition   : 'padded',
                toggleGroup : true,
                items       : {
                    speed1  : { text : '1×', pressed : true, tooltip : '1 simulated minute per tick', onToggle : 'up.onSpeedToggle' },
                    speed5  : { text : '5×', tooltip : '5 simulated minutes per tick', onToggle : 'up.onSpeedToggle' },
                    speed15 : { text : '15×', tooltip : '15 simulated minutes per tick', onToggle : 'up.onSpeedToggle' }
                }
            },
            // Secondary, Play / Pause is the one primary button
            delay : {
                type      : 'button',
                cls       : 'lct-delay',
                rendition : 'text',
                icon      : icon('lightning'),
                text      : 'Simulate delay',
                tooltip   : 'Makes a truck with a booked slot run 30 to 75 minutes late',
                onAction  : 'up.onDelayClick'
            },
            play : {
                type      : 'button',
                cls       : 'lct-play',
                rendition : 'filled',
                icon      : icon('pause'),
                text      : 'Pause',
                onAction  : 'up.onPlayClick'
            }
        }
    };

    updateSimulator(simulator) {
        const me = this;

        me.detachSimulatorListeners?.();
        me.detachSimulatorListeners = simulator?.on({
            playStateChange : 'syncButtons',
            thisObj         : me
        });

        me.syncButtons();
    }

    onPlayClick() {
        this.simulator.toggle();
    }

    onDelayClick() {
        this.simulator.simulateDelay();
    }

    onSpeedToggle({ source, pressed }) {
        if (pressed) {
            this.simulator.speed = speeds[source.ref];
        }
    }

    syncButtons() {
        const
            { simulator, widgetMap } = this,
            { play }                 = widgetMap,
            running                  = simulator?.isRunning;

        if (play && simulator) {
            Object.assign(play, {
                text      : running ? 'Pause' : 'Play',
                icon      : icon(running ? 'pause' : 'play'),
                rendition : running ? 'filled' : 'tonal'
            });
        }
    }
}

SimulationControls.initClass();
