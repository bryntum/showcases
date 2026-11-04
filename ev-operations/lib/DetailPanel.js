import { Widget } from '@bryntum/core-enterprise';

/**
 * A stat tile of the panel, for the `stats` of a detail
 * @param {String} label
 * @param {String} value
 * @returns {{ label : String, value : String }}
 */
export const stat = (label, value) => ({ label, value });

/**
 * Panel below the timeline with live details of the selected event / task, open while `detail` is set. The close
 * button fires `close`. Uses `compose()`, which re-renders when a config it reads changes.
 *
 * Learn more:
 * https://bryntum.com/products/gantt/docs/api/Core/widget/Widget#function-compose
 */
export default class DetailPanel extends Widget {
    static $name = 'DetailPanel';

    static type = 'detailpanel';

    static configurable = {
        /**
         * `{ title, status, statusLabel, where, stats : [{ label, value }] }`, or `null` to close the panel
         * @prp {Object}
         */
        detail : null
    };

    updateDetail(detail) {
        // Keep rendering the last detail while the panel slides closed
        if (detail) {
            this.shownDetail = detail;
        }
    }

    compose() {
        const
            { detail } = this,
            shown      = detail || this.shownDetail;

        return {
            class : {
                'ev-detail'      : 1,
                'ev-detail-open' : Boolean(detail)
            },
            'aria-hidden' : !detail,
            children      : {
                inner : {
                    class    : 'ev-detail-inner',
                    // Keyed children are reference elements, compose() only wires listeners on those
                    children : shown ? {
                        summary : {
                            class    : `ev-detail-summary ev-status-${shown.status}`,
                            children : [
                                {
                                    class    : 'ev-detail-heading',
                                    children : [
                                        { tag : 'span', class : 'ev-detail-swatch' },
                                        { tag : 'span', class : 'ev-detail-title', text : shown.title }
                                    ]
                                },
                                {
                                    class    : 'ev-detail-meta',
                                    children : [
                                        { tag : 'span', class : 'ev-detail-status', text : shown.statusLabel },
                                        { tag : 'span', text : shown.where }
                                    ]
                                }
                            ]
                        },
                        stats : {
                            class    : 'ev-detail-stats',
                            children : shown.stats.map(({ label, value }) => ({
                                class    : 'ev-detail-stat',
                                children : [
                                    { tag : 'span', class : 'ev-detail-stat-label', text : label },
                                    { tag : 'span', class : 'ev-detail-stat-value', text : value }
                                ]
                            }))
                        },
                        closeButton : {
                            tag          : 'button',
                            class        : 'ev-detail-close fa fa-chevron-down',
                            'aria-label' : 'Hide details',
                            title        : 'Hide details',
                            tabIndex     : detail ? 0 : -1,
                            listeners    : {
                                click : 'onCloseClick'
                            }
                        }
                    } : null
                }
            }
        };
    }

    onCloseClick() {
        this.trigger('close');
    }
}

DetailPanel.initClass();
