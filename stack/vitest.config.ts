import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'stack',
    include: ['src/**/*.test.ts'],
  },
});
