/**
 * Column configs for the views' responsive levels: `small` below 700px wide, `large` above, see SimulatedView.
 * On a phone the primary column narrows and the secondary ones hide, so the timeline stays visible.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Grid/view/mixin/GridResponsive
 */

export const
    // Shown from the `large` level only
    hiddenWhenSmall = { responsiveLevels : { small : { hidden : true }, '*' : { hidden : false } } },

    // The column `width`, `smallWidth` at the `small` level
    responsiveWidth = (width, smallWidth) => ({
        width,
        responsiveLevels : { small : { width : smallWidth }, '*' : { width } }
    });
