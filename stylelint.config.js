// The checkable parts of the Bryntum CSS style: logical directional properties (sizes stay `width` / `height`, as in
// Bryntum's own CSS) and no `!important`, plus Stylelint's error checks. Aligned colons and nesting are kept by review
export default {
    extends : ['stylelint-config-recommended'],
    plugins : ['stylelint-use-logical'],
    rules   : {
        'csstools/use-logical'      : ['always', { except : [/^(min-|max-)?(width|height)$/] }],
        'declaration-no-important'  : true,
        // Nested rules read in their own order, the rule misreads them
        'no-descending-specificity' : null
    },
    ignoreFiles : ['dist/**', 'node_modules/**']
};
