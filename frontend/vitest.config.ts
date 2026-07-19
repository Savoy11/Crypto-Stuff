import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest ran without a config until now, which worked only because every test
// so far imported relatively. Anything importing `@/…` — the alias used
// throughout src — failed to resolve. Mirror the tsconfig path mapping so tests
// and the app agree.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
