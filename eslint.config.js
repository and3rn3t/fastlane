// Extends the shared @and3rn3t/eslint-config with fastlane-specific rules.
import and3rn3t from '@and3rn3t/eslint-config'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  ...and3rn3t,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: jsxA11y.configs.recommended.rules,
  },
]
