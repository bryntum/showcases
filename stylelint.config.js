// The checkable parts of the Bryntum CSS style: logical directional properties (sizes stay `width` / `height`, as in
// Bryntum's own CSS) and no `!important`, plus Stylelint's error checks. Aligned colons and nesting are kept by review
export default {
    extends : ['stylelint-config-recommended'],
    rules   : {
        // Longhands only: shorthands would change how RTL mirrors, overflow-block / -inline lack Chrome support
        'property-layout-mappings' : ['flow-relative', {
            ignoreProperties : [/^(min-|max-)?(width|height)$/, /^(padding|margin|inset)$/, /^overflow-[xy]$/]
        }],
        // property-layout-mappings checks property names only, these are the physical keyword values
        'declaration-property-value-disallowed-list' : { '/^(float|clear|text-align)$/' : ['/^(left|right)$/'] },
        'declaration-no-important'                   : true,
        // Nested rules read in their own order, the rule misreads them
        'no-descending-specificity'                  : null
    },
    ignoreFiles : ['dist/**', 'node_modules/**']
};
