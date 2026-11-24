import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repos = readFileSync(new URL('../infra/github/repos.tf', import.meta.url), 'utf8');

function block(resource: string): string {
  const start = repos.indexOf(`resource "${resource}"`);
  return repos.slice(start, repos.indexOf('\n}\n', start) + 2);
}

describe('the GitHub settings of a new repo', () => {
  it('turn on the vulnerability alerts before the setting that GitHub refuses without them', () => {
    expect(block('github_repository_dependabot_security_updates')).toContain(
      'depends_on = [github_repository_vulnerability_alerts.alerts]'
    );
  });
});
