export default {
  extends: ['stylelint-config-standard', 'stylelint-config-recommended-vue'],
  ignoreFiles: ['**/dist/**', '**/node_modules/**'],
  rules: {
    'selector-class-pattern': null,
  },
};
