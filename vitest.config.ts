import { defineConfig } from 'vitest/config';

const floor = 90;

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text'],
      thresholds: {
        lines: floor,
        functions: floor,
        branches: floor,
        statements: floor,
      },
    },
  },
});
