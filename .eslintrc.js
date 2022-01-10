module.exports = {
    'env': {
        'browser': true,
        'es6': true,
        'node': true
    },
    'plugins': [
        '@typescript-eslint',
        '@typescript-eslint/tslint',
        'prefer-arrow',
        'simple-import-sort',
        'rxjs',
        'rxjs-angular'
    ],
    'extends': [
        'eslint:recommended'
    ],
    'rules': {
        'arrow-body-style': 'error',
        'brace-style': [
            'error',
            '1tbs'
        ],
        'comma-dangle': 'error',
        'curly': 'error',
        'dot-notation': 'error',
        'eol-last': 'error',
        'eqeqeq': [
            'error',
            'always'
        ],
        'guard-for-in': 'error',
        'no-bitwise': 'off',
        'no-caller': 'error',
        'no-console': [
            'error',
            {
                'allow': [
                    'log',
                    'warn',
                    'dir',
                    'timeLog',
                    'assert',
                    'clear',
                    'count',
                    'countReset',
                    'group',
                    'groupEnd',
                    'table',
                    'dirxml',
                    'error',
                    'groupCollapsed',
                    'Console',
                    'profile',
                    'profileEnd',
                    'timeStamp',
                    'context'
                ]
            }
        ],
        'no-debugger': 'error',
        'no-eval': 'error',
        'no-fallthrough': 'error',
        'no-irregular-whitespace': 'error',
        'no-multiple-empty-lines': 'error',
        'no-new-wrappers': 'error',
        'no-redeclare': 'error',
        'no-restricted-imports': [
            'error',
            'rxjs/Rx'
        ],
        'no-shadow': [
            'error',
            {
                'hoist': 'all'
            }
        ],
        'no-throw-literal': 'error',
        'no-trailing-spaces': 'error',
        'no-undef-init': 'error',
        'no-unused-expressions': 'error',
        'no-unused-labels': 'error',
        'no-var': 'error',
        'one-var': [
            'error',
            'never'
        ],
        'prefer-arrow/prefer-arrow-functions': 'error',
        'prefer-const': 'error',
        'prefer-object-spread': 'error',
        'prefer-template': 'error',
        'radix': 'error',
        'spaced-comment': [
            'error',
            'always',
            {
                'markers': [
                    '/'
                ]
            }
        ],
        'use-isnan': 'error',
        'lines-between-class-members': [
            'error',
            'always',
            {
                'exceptAfterSingleLine': true
            }
        ],
        'no-template-curly-in-string': 'error',
        'no-multi-spaces': 'error',
        'keyword-spacing': 'error',
        'key-spacing': 'error',
        'no-whitespace-before-property': 'error',
        'block-spacing': 'error',
        'comma-spacing': 'error',
        'semi-spacing': 'error',
        'func-call-spacing': 'error',
        'object-curly-spacing': [
            'error',
            'always'
        ],
        'space-infix-ops': 'error',
        'space-unary-ops': 'error',
        'space-before-function-paren': [
            'error',
            'never'
        ],
        'simple-import-sort/imports': [
            'error',
            {
                groups: [
                    ['^\\u0000'],
                    ['^@?\\w'],
                    ['^[^(\\.|src/)]'],
                    ['^src/'],
                    ['^\\.']
                ]
            }
        ],
        'quotes': [
            'error',
            'single'
        ],
        'semi': [
            'error',
            'always'
        ]
    },
    'overrides': [{
        'files': ['**/*.ts', '**/*.tsx'],
        'env': {
            'browser': true,
            'es6': true,
            'node': true,
            'jasmine': true
        },
        'parser': '@typescript-eslint/parser',
        'parserOptions': {
            'project': 'tsconfig.json',
            'sourceType': 'module'
        },
        'extends': [
            'plugin:@typescript-eslint/recommended',
            'plugin:@typescript-eslint/recommended-requiring-type-checking'
        ],
        'rules': {
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/unbound-method': [
                'error',
                {
                    'ignoreStatic': true
                }
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    'argsIgnorePattern': '^_'
                }
            ],
            '@typescript-eslint/consistent-type-definitions': 'error',
            '@typescript-eslint/explicit-member-accessibility': [
                'error',
                {
                    'accessibility': 'explicit',
                    'overrides': {
                        'accessors': 'explicit',
                        'parameterProperties': 'explicit'
                    }
                }
            ],
            '@typescript-eslint/indent': 'error',
            '@typescript-eslint/member-delimiter-style': [
                'error',
                {
                    'multiline': {
                        'delimiter': 'semi',
                        'requireLast': true
                    },
                    'singleline': {
                        'delimiter': 'semi',
                        'requireLast': false
                    }
                }
            ],
            '@typescript-eslint/member-ordering': [
                'error',
                {
                    'default': {
                        'memberTypes': [
                            'static-field',
                            'public-field',
                            'instance-field',
                            'protected-field',
                            'private-field',
                            'abstract-field',
                            'constructor',
                            'public-static-method',
                            'protected-static-method',
                            'private-static-method',
                            'public-method',
                            'protected-method',
                            'private-method'
                        ]
                    }
                }
            ],
            '@typescript-eslint/no-empty-interface': 'error',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/no-misused-new': 'error',
            '@typescript-eslint/no-unnecessary-qualifier': 'error',
            '@typescript-eslint/prefer-for-of': 'error',
            '@typescript-eslint/prefer-function-type': 'error',
            '@typescript-eslint/quotes': [
                'error',
                'single'
            ],
            '@typescript-eslint/semi': [
                'error',
                'always'
            ],
            '@typescript-eslint/type-annotation-spacing': 'error',
            '@typescript-eslint/unified-signatures': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/prefer-includes': 'error',
            '@typescript-eslint/prefer-string-starts-ends-with': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/method-signature-style': [
                'error',
                'method'
            ],
            /**
             * rxjs: Add rules "rxjs/finnish" and "rxjs/suffix-subjects" when implemented
             * https://github.com/cartant/eslint-plugin-rxjs/issues/7
             */
            'rxjs/no-ignored-replay-buffer': 'error',
            'rxjs/no-ignored-observable': 'error',
            'rxjs/no-nested-subscribe': 'error',
            'rxjs/no-topromise': 'error',
            'rxjs/no-unbound-methods': 'error',
            'rxjs/no-unsafe-takeuntil': 'error',
            'rxjs/no-subject-value': 'error',
            'rxjs/no-unsafe-subject-next': 'error',
            /**
             * rxjs-angular/prefer-takeuntil: Not yet implemented
             * https://github.com/cartant/eslint-plugin-rxjs-angular
             */
            'rxjs-angular/prefer-takeuntil': 'error'
        }
    }]
};
