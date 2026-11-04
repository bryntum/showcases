import { StringHelper } from '@bryntum/core-enterprise';
import { fonts, textWidth } from '../util/TextMeasure.js';

/**
 * DomConfig building blocks of the bar anatomy shared by all three views: the layers, the title row with its chip and
 * right value, and avatars. The pixel sizes mirror bars.css, so a renderer knows what fits before the bar renders.
 */

const
    // Pixel sizes of the bar content, mirroring bars.css (14px app font). Keep in sync with the CSS they name
    px         = {
        // .ev-star, 12px icon + the 0.5em title group gap
        star        : 19,
        // .ev-delay, 2 x 0.455em padding of the 11px badge + the 0.5em title group gap
        delayChrome : 17,
        // .ev-row-title gap, between the title group and the right group
        rowGap      : 8,
        // .ev-right-group gap, between the chip and the right value
        rightGap    : 10,
        // .ev-chip, icon gap 5px, 2 x 7px padding and 2 x 1px border
        chipChrome  : 21,
        // .ev-chip-icon, the default icon width
        chipIcon    : 11,
        // .ev-value, the room around a live value
        valueChrome : 6,
        // .ev-avatar, 22px discs overlapping by 6px, + the 0.43em .ev-right padding
        avatar      : 22,
        avatarStep  : 16,
        avatarEnd   : 6
    },
    // Initials of a full name, "Jonas Lind" -> "JL"
    initialsOf = name => (name || '').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
    // Tooltip text of a person, "Jonas Lind · EV technician", HTML encoded (the shared tooltip shows `data-btip` as
    // HTML)
    personTip  = ({ name, role }) => StringHelper.encodeHtml(role ? `${name} · ${role}` : name);

export const
    /**
     * Bars end this many px before their end date, leaving air between adjacent bars. The same as --ev-bar-gap in
     * tokens.css
     */
    barGap = 4,

    /**
     * Inline padding (px) of the bar content, .ev-body in bars.css: 17px after the stripe and 14px at the end
     */
    barInset = 31,

    /**
     * Initials avatar of a person `{ name, role }`, colored by a hash of the initials into the 6 color palette defined
     * in tokens.css. Hovering it shows the name and role, using the shared tooltip (`data-btip`)
     */
    avatar = person => {
        const initials = initialsOf(person.name);

        return {
            tag     : 'span',
            class   : `ev-avatar ev-avatar-${(initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % 6}`,
            dataset : { btip : personTip(person) },
            text    : initials
        };
    },

    /**
     * The +N chip after an avatar stack, hovering it lists the hidden people
     * @param {Object[]} people The hidden people, `{ name, role }`
     */
    avatarMore = people => ({
        tag     : 'span',
        class   : 'ev-avatar ev-avatar-more',
        dataset : { btip : people.map(personTip).join('<br>') },
        text    : `+${people.length}`
    }),

    avatarsWidth = count => count ? px.avatar + (count - 1) * px.avatarStep + px.avatarEnd : 0,

    /**
     * The info chip shown on the right side of the first row of a bar
     * @param {Object} options
     * @param {String} options.text
     * @param {String} [options.icon] Font Awesome icon class, shown before the text
     * @param {DomConfig} [options.prefix] Shown instead of the icon
     * @param {Number} [options.chars] Fixed width in characters, for a live value
     * @returns {DomConfig}
     */
    chip = ({ text, icon, prefix, chars }) => ({
        tag      : 'span',
        class    : 'ev-chip',
        children : [
            prefix || (icon && { tag : 'i', class : `ev-chip-icon fa ${icon}` }),
            chars ?
                // Live value, fixed width so it does not jiggle
                { tag : 'span', class : 'ev-chip-value', style : { '--ev-chars' : chars }, text } :
                { tag : 'span', text }
        ]
    }),

    // Width of a chip, its text and icon (or battery prefix) plus its padding and border
    chipWidth = (text, iconWidth = px.chipIcon) => textWidth(text, fonts.chip) + iconWidth + px.chipChrome,

    /**
     * A live value in the right group. It gets a fixed width sized to the widest value it can show (`maxText`), so the
     * content before it does not move as the digits change
     */
    liveValue = (text, maxText) => ({
        tag   : 'span',
        class : 'ev-value',
        style : { '--ev-chars' : maxText.length },
        text
    }),

    // Width of a live value, measured for its widest text
    liveValueWidth = maxText => textWidth(maxText.replace(/\d/g, '0'), fonts.value) + px.valueChrome,

    /**
     * Shared first row: optional priority star + title + optional delay badge on the left, chip and value docked right.
     * Elements are dropped in this order as the bar narrows: right value, chip.
     */
    titleRow = ({ title, priority, delay, chipConfig, chipW, right, rightW, width }) => {
        const
            titleW    = barInset + textWidth(title, fonts.title) + (priority ? px.star : 0) +
                (delay ? textWidth(delay, fonts.delay) + px.delayChrome : 0),
            chipAt    = titleW + px.rowGap + chipW,
            rightAt   = chipAt + px.rightGap + rightW,
            showChip  = Boolean(chipConfig) && chipAt <= width,
            showRight = Boolean(right) && showChip && rightAt <= width;

        return {
            class   : 'ev-row ev-row-title',
            // Widths needed to show the chip and the right value, used when the bar is clipped by the view edge
            dataset : {
                chipAt  : Math.round(chipAt),
                rightAt : Math.round(rightAt)
            },
            children : [
                {
                    class    : 'ev-title-group',
                    children : [
                        priority && { tag : 'i', class : 'ev-star fa fa-star' },
                        { tag : 'span', class : 'ev-title', text : title },
                        delay && { tag : 'span', class : 'ev-delay', text : delay }
                    ]
                },
                (showChip || showRight) && {
                    class    : 'ev-right-group',
                    children : [
                        showChip && chipConfig,
                        showRight && { class : 'ev-right', children : [right] }
                    ]
                }
            ]
        };
    },

    /**
     * The layers shared by all bars: elapsed fill, status stripe and the content wrapper.
     */
    barLayers = ({ status, fillWidth, extraLayers = [], rows }) => [
        fillWidth > 0 && { class : 'ev-fill', style : { '--ev-elapsed' : `${fillWidth}px` } },
        ...extraLayers,
        status !== 'sched' && { class : 'ev-stripe' },
        { class : 'ev-body', children : rows }
    ];
