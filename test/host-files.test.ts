import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../host/root', import.meta.url));
const scripts = join(root, 'usr/local/sbin');
const units = join(root, 'etc/systemd/system');
const setup = readFileSync(join(scripts, 'platform-setup'), 'utf8');

function filesIn(dir: string, suffix = ''): string[] {
  return readdirSync(dir).filter(
    (name) => name.endsWith(suffix) && statSync(join(dir, name)).isFile()
  );
}

describe('the files of the host', () => {
  it.each(filesIn(scripts))('%s is a bash script that parses and can run', (name) => {
    const path = join(scripts, name);
    expect(readFileSync(path, 'utf8').startsWith('#!/usr/bin/env bash\nset -euo pipefail\n')).toBe(
      true
    );
    expect(statSync(path).mode & 0o111).not.toBe(0);
    expect(spawnSync('bash', ['-n', path]).status).toBe(0);
  });

  it.each(filesIn(units, '.timer'))('%s has its service, and the setup switches it on', (timer) => {
    const service = timer.replace(/\.timer$/, '.service');
    expect(filesIn(units)).toContain(service);
    expect(setup).toMatch(new RegExp(`systemctl enable --now .*${timer.replace('.', '\\.')}`));
  });

  it('runs every ExecStart that names a script of the host from /usr/local/sbin', () => {
    for (const unit of filesIn(units)) {
      const text = readFileSync(join(units, unit), 'utf8');
      for (const match of text.matchAll(/^ExecStart=(\/usr\/local\/sbin\/\S+)/gm)) {
        expect(filesIn(scripts)).toContain(match[1]?.replace('/usr/local/sbin/', ''));
      }
    }
  });

  it('keeps every Docker volume on the data disk, and Docker waits for it', () => {
    const dropIn = readFileSync(join(units, 'docker.service.d/data-disk.conf'), 'utf8');
    expect(dropIn).toContain('RequiresMountsFor=/var/lib/docker/volumes');
    const volumes = readFileSync(join(units, 'var-lib-docker-volumes.mount'), 'utf8');
    expect(volumes).toContain('What=/srv/data/docker-volumes');
    expect(volumes).toContain('Requires=srv-data.mount');
    const disk = readFileSync(join(units, 'srv-data.mount'), 'utf8');
    expect(disk).toContain('What=/dev/disk/by-label/platform-data');
    expect(disk).toContain('Requires=platform-data-disk.service');
  });

  it("takes Docker from Docker's own repository, one major version at a time", () => {
    const source = readFileSync(join(root, 'etc/apt/sources.list.d/docker.sources'), 'utf8');
    expect(source).toContain('URIs: https://download.docker.com/linux/ubuntu');
    expect(source).toContain('Signed-By: /etc/apt/keyrings/docker.asc');
    const pins = readFileSync(join(root, 'etc/apt/preferences.d/docker'), 'utf8');
    expect(pins).toContain('Pin: version 5:29.*');
    expect(setup).toContain('docker-ce docker-ce-cli containerd.io docker-compose-plugin');
  });

  it("installs the security updates and Docker's own updates by itself", () => {
    const updates = readFileSync(
      join(root, 'etc/apt/apt.conf.d/52platform-unattended-upgrades'),
      'utf8'
    );
    expect(updates).toContain('APT::Periodic::Unattended-Upgrade "1";');
    expect(updates).toMatch(/"origin=Docker,archive=\$\{distro_codename\}";/);
    expect(updates).toContain('Unattended-Upgrade::Automatic-Reboot "true";');
  });

  it('keeps container logs small, and the containers running while Docker updates itself', () => {
    const daemon = JSON.parse(readFileSync(join(root, 'etc/docker/daemon.json'), 'utf8'));
    expect(daemon['live-restore']).toBe(true);
    expect(daemon['log-driver']).toBe('local');
    expect(daemon['log-opts']).toEqual({ 'max-size': '10m', 'max-file': '5' });
  });

  it('closes the SSH server, so a shell arrives through AWS Systems Manager only', () => {
    expect(setup).toContain('systemctl mask ssh.service ssh.socket');
  });

  it('installs what a deploy needs: git, jq, the AWS CLI from its snap, and docker-rollout at one commit', () => {
    expect(setup).toMatch(/docker-compose-plugin git jq$/m);
    expect(setup).toContain('snap install aws-cli --classic --channel=v2/stable');
    expect(setup).toMatch(
      /rollout_url="https:\/\/raw\.githubusercontent\.com\/wowu\/docker-rollout\/[0-9a-f]{40}\/docker-rollout"/
    );
    expect(setup).toMatch(/rollout_sha256="[0-9a-f]{64}"/);
    expect(setup).toContain('"$plugins/docker-rollout"');
  });

  it('brings back the recorded deploys once Docker runs, and the setup switches that on', () => {
    const unit = readFileSync(join(units, 'platform-redeploy.service'), 'utf8');
    expect(unit).toContain('ExecStart=/usr/local/sbin/platform-deploy --redeploy-recorded');
    expect(unit).toContain('Requires=docker.service');
    expect(unit).toContain('After=network-online.target docker.service');
    expect(setup).toContain('systemctl enable --now platform-redeploy.service');
  });

  it('marks the end of the setup before it brings deploys back, so a deploy that arrives early waits for it', () => {
    const marker = setup.indexOf('> /var/lib/platform/setup-done');
    expect(marker).toBeGreaterThan(setup.indexOf('docker-compose-plugin git jq'));
    expect(marker).toBeLessThan(setup.indexOf('systemctl enable --now platform-redeploy.service'));
  });
});
