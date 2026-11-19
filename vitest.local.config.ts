import { projectTestConfig } from '@zigordev/test/vitest';
import { defineProject } from 'vitest/config';

export default defineProject(
  projectTestConfig({ name: 'local-stack', include: ['test/local-stack.test.ts'] })
);
