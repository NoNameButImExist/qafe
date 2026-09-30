import conventional from '@commitlint/config-conventional';

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // "deps" is used by Dependabot and has its own changelog section (release-please-config.json).
    'type-enum': [2, 'always', [...conventional.rules['type-enum'][2], 'deps']],
  },
};
