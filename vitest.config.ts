import { workspaceTestConfig } from '@zigordev/test/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  workspaceTestConfig({
    projects: ['vitest.unit.config.ts', 'vitest.local.config.ts'],
    sources: ['src'],
  })
);
