export default {
  extends: [
    'stylelint-config-standard',
    'stylelint-config-recommended-vue',
    'stylelint-config-recommended-scss',
    'stylelint-config-recess-order',
  ],
  overrides: [
    {
      files: ['**/*.{html,vue}'],
      customSyntax: 'postcss-html',
    },
    {
      files: ['**/*.scss'],
      customSyntax: 'postcss-scss',
    },
  ],
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'at-root',
          'apply',
          'custom-variant',
          'debug',
          'each',
          'else',
          'error',
          'extend',
          'for',
          'forward',
          'function',
          'include',
          'if',
          'layer',
          'mixin',
          'responsive',
          'return',
          'screen',
          'tailwind',
          'use',
          'variants',
          'warn',
          'while',
        ],
      },
    ],
    'no-descending-specificity': null,
    'no-empty-source': null,
    'scss/at-rule-no-unknown': null,
    'scss/load-partial-extension': null,
    'scss/operator-no-newline-after': null,
    'scss/operator-no-unspaced': null,
    'selector-class-pattern': null,
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['deep', 'global', 'slotted'],
      },
    ],
  },
  root: true,
};
