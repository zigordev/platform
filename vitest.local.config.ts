import { projectTestConfig } from '@zigordev/test/vitest';
import { defineProject } from 'vitest/config';

const { test } = projectTestConfig({ name: 'local-stack', include: ['test/local-stack.test.ts'] });

export default defineProject({ test: { ...test, testTimeout: 150_000 } });
