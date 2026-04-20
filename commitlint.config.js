module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow longer subject lines (default is 72)
    'header-max-length': [2, 'always', 100],
    // Scope is optional
    'scope-empty': [0],
  },
};
