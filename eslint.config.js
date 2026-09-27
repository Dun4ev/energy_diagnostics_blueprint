import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['apps/web/src/api/generated.ts', '**/dist/**', 'node_modules/**'] },
  js.configs.recommended, ...tseslint.configs.recommended,
  { languageOptions: { globals: { document: 'readonly', fetch: 'readonly', URL: 'readonly', Request: 'readonly' } } },
);
