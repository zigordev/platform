import { describe, expect, it } from 'vitest';
import { readConfig } from './config.ts';

describe('readConfig', () => {
  it('points at the local platform when nothing is set', () => {
    expect(readConfig({})).toEqual({
      PLATFORM_DATABASE_URL: 'postgresql://postgres@127.0.0.1:5432/postgres',
      PLATFORM_APPS_DIR: 'apps',
      LOG_LEVEL: 'info',
    });
  });

  it('takes the values it is given', () => {
    expect(
      readConfig({
        PLATFORM_DATABASE_URL: 'postgresql://admin@db.internal:5432/postgres',
        PLATFORM_APPS_DIR: '/srv/platform/apps',
        LOG_LEVEL: 'debug',
      })
    ).toEqual({
      PLATFORM_DATABASE_URL: 'postgresql://admin@db.internal:5432/postgres',
      PLATFORM_APPS_DIR: '/srv/platform/apps',
      LOG_LEVEL: 'debug',
    });
  });

  it('refuses a database URL that is not a URL', () => {
    expect(() => readConfig({ PLATFORM_DATABASE_URL: 'not a url' })).toThrow(
      /PLATFORM_DATABASE_URL/
    );
  });

  it('reads the process environment when given none', () => {
    expect(readConfig().PLATFORM_APPS_DIR).toEqual(expect.any(String));
  });
});
