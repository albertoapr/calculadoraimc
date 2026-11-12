import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'amplify/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: { parserOptions: { parser: tseslint.parser }, globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', navigator: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly', HTMLElement: 'readonly', HTMLDivElement: 'readonly', Element: 'readonly', Event: 'readonly', PointerEvent: 'readonly', MouseEvent: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], '@typescript-eslint/no-explicit-any': 'error', 'no-undef': 'off' },
  },
)
