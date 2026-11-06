import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

// Bryntum code style, formatting rules through @stylistic. `const me = this` is applied by hand
export default [
    {
        ignores : ['dist/', 'node_modules/', 'test-results/', 'playwright-report/']
    },
    js.configs.recommended,
    {
        files           : ['**/*.js'],
        languageOptions : {
            ecmaVersion : 2022,
            sourceType  : 'module',
            globals     : globals.browser
        },
        plugins : {
            '@stylistic' : stylistic
        },
        rules : {
            // Bryntum style: 4 spaces, single quotes, aligned colons (`key : value`)
            '@stylistic/indent'        : ['error', 4, { SwitchCase : 1, VariableDeclarator : 1, ignoredNodes : ['TemplateLiteral'] }],
            '@stylistic/quotes'        : ['error', 'single', { avoidEscape : true, allowTemplateLiterals : 'always' }],
            '@stylistic/semi'          : ['error', 'always'],
            '@stylistic/no-extra-semi' : 'error',
            '@stylistic/brace-style'   : ['error', 'stroustrup', { allowSingleLine : false }],
            '@stylistic/key-spacing'   : ['error', {
                multiLine  : { beforeColon : true, afterColon : true, align : 'colon' },
                singleLine : { beforeColon : true, afterColon : true }
            }],
            '@stylistic/comma-dangle'                : ['error', 'never'],
            '@stylistic/comma-spacing'               : ['error', { before : false, after : true }],
            '@stylistic/arrow-spacing'               : ['error', { before : true, after : true }],
            '@stylistic/keyword-spacing'             : ['error', { before : true, after : true }],
            '@stylistic/space-before-blocks'         : ['error', 'always'],
            '@stylistic/space-before-function-paren' : ['error', 'never'],
            '@stylistic/space-infix-ops'             : 'error',
            '@stylistic/object-curly-spacing'        : ['error', 'always'],
            '@stylistic/array-bracket-spacing'       : ['error', 'never'],
            '@stylistic/computed-property-spacing'   : ['error', 'never'],
            '@stylistic/quote-props'                 : ['error', 'as-needed'],
            '@stylistic/no-multiple-empty-lines'     : ['error', { max : 1, maxBOF : 0, maxEOF : 1 }],
            // Strings hold SVG path data and URLs, which are not wrapped
            '@stylistic/max-len'                     : ['error', {
                code                   : 120,
                ignoreUrls             : true,
                ignoreStrings          : true,
                ignoreTemplateLiterals : true,
                ignoreRegExpLiterals   : true
            }],
            '@stylistic/no-trailing-spaces' : 'error',
            '@stylistic/linebreak-style'    : ['error', 'unix'],
            '@stylistic/operator-linebreak' : ['error', 'after', { overrides : { '?' : 'after', ':' : 'after' } }],
            'no-duplicate-imports'          : 'error',
            'no-eval'                       : 'error',
            'no-new'                        : 'error',
            'no-restricted-globals'         : ['error', 'event', 'self'],
            'no-self-compare'               : 'error',
            'no-throw-literal'              : 'error',
            'no-unreachable-loop'           : 'error',
            'no-unused-vars'                : ['error', { args : 'none' }],
            'prefer-const'                  : 'error',
            yoda                            : ['error', 'never', { onlyEquality : true }],
            // Keeps the showcases readable: small functions, shallow nesting, files of one responsibility
            'max-lines-per-function'        : ['warn', { max : 60, skipBlankLines : true, skipComments : true }],
            'max-lines'                     : ['warn', { max : 400, skipBlankLines : true, skipComments : true }],
            complexity                      : ['warn', 12],
            'max-depth'                     : ['warn', 4]
        }
    },
    {
        // Mixin factories wrap a whole class in one arrow function, which the rule would count as one function
        files : [
            'ev-operations/lib/SimulatedView.js',
            'ev-operations/lib/simulation/*.js',
            'ev-operations/lib/gantt/SlipTracking.js',
            'logistics-control-tower/lib/schedule/DockBooking.js'
        ],
        rules : {
            'max-lines-per-function' : 'off'
        }
    },
    {
        files           : ['vite.config.js', 'eslint.config.js', 'playwright.config.js', 'tests/**/*.js'],
        languageOptions : {
            globals : globals.node
        }
    }
];
