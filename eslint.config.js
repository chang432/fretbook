import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist'] },
  js.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Run by node rather than shipped to a browser: the publishing script and
    // the build config. Last, so these globals are the ones that apply.
    files: ['scripts/**/*.{js,mjs}', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: { sourceType: 'module' },
    },
  },
]
