import { projectTestConfig } from '@zigordev/test/vitest';
import { defineProject } from 'vitest/config';

export default defineProject(
  projectTestConfig({ name: 'unit', globalSetup: ['test/postgres-global-setup.ts'] })
);
