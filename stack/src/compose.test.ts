import { describe, expect, it } from 'vitest';
import { model, type Service } from '../test/model.ts';

const everywhere = model(['compose.yaml']);
const laptop = model(['compose.yaml', 'compose.local.yaml']);
const withJobs = model(['compose.yaml', 'compose.local.yaml'], 'push');

const services = Object.entries(laptop.services);
const socket = '/var/run/docker.sock';

function seconds(period: string | undefined): number {
  const match = /^(\d+)s$/.exec(period ?? '');
  return match === null ? Number.NaN : Number(match[1]);
}

function flags(service: Service | undefined): string[] {
  return (service?.command ?? []).map((argument) => argument.split('=')[0] ?? '');
}

describe('the shared services', () => {
  it('are five on the laptop, and the three that run everywhere are among them', () => {
    expect(Object.keys(laptop.services).sort()).toEqual([
      'alloy',
      'docker-proxy',
      'lgtm',
      'mailpit',
      'traefik',
    ]);
    expect(Object.keys(everywhere.services).sort()).toEqual(['alloy', 'docker-proxy', 'traefik']);
  });

  it('form one project with one name, wherever the files are started from', () => {
    expect(laptop.name).toBe('platform');
    expect(everywhere.name).toBe('platform');
  });

  it('share one network that apps join by its fixed name', () => {
    expect(laptop.networks.zigordev).toEqual(expect.objectContaining({ name: 'zigordev' }));
    expect(laptop.networks.zigordev?.internal).toBeUndefined();
  });
});

describe.each(services)('%s', (name, service) => {
  it('is pinned to one exact version', () => {
    expect(service.image).toMatch(/^[\w./-]+:v?\d+\.\d+\.\d+$/);
  });

  it('has a health check', () => {
    expect(service.healthcheck?.test?.[0]).toBe('CMD');
    expect(service.healthcheck?.test?.length).toBeGreaterThan(1);
  });

  it('has a memory limit and a CPU limit', () => {
    expect(Number(service.mem_limit)).toBeGreaterThan(0);
    expect(service.cpus).toBeGreaterThan(0);
  });

  it('runs under an init, can gain no privilege, holds no capability, and gets at most 30 seconds to stop', () => {
    expect(service.init).toBe(true);
    expect(service.security_opt).toEqual(['no-new-privileges:true']);
    expect(service.cap_drop).toEqual(['ALL']);
    expect(seconds(service.stop_grace_period)).toBeGreaterThan(0);
    expect(seconds(service.stop_grace_period)).toBeLessThanOrEqual(30);
  });

  it('has no fixed container name', () => {
    expect(service.container_name).toBeUndefined();
  });

  if (name === 'lgtm') {
    it('is the one exception to the two rules below: it is six programs in one container, and it runs on the laptop only', () => {
      expect(service.user).toBeUndefined();
      expect(service.read_only).toBeUndefined();
      expect(everywhere.services.lgtm).toBeUndefined();
    });
  } else {
    it('runs as a user that is not root', () => {
      expect(service.user).toMatch(/^[1-9]\d*:\d+$/);
    });

    it('has a read-only file system', () => {
      expect(service.read_only).toBe(true);
    });
  }

  if (name === 'docker-proxy') {
    it('is the only service that mounts the Docker socket, and it cannot write to it', () => {
      expect(service.volumes).toEqual([
        expect.objectContaining({ type: 'bind', source: socket, target: socket, read_only: true }),
      ]);
    });
  } else {
    it('does not mount the Docker socket', () => {
      const sources = (service.volumes ?? []).map((mount) => mount.source);
      expect(sources).not.toContain(socket);
    });
  }

  if (name === 'traefik') {
    it('is the only service with a published port: port 80, on this laptop itself and nowhere else', () => {
      expect(service.ports).toEqual([
        expect.objectContaining({ host_ip: '127.0.0.1', published: '80', target: 8080 }),
        expect.objectContaining({ host_ip: '::1', published: '80', target: 8080 }),
      ]);
    });
  } else {
    it('publishes no port', () => {
      expect(service.ports).toBeUndefined();
    });
  }
});

describe('the Docker proxy', () => {
  const proxy = laptop.services['docker-proxy'];

  it('answers only the two services that have to know which containers exist', () => {
    expect(proxy?.command).toContain('-allowfrom=traefik,alloy');
  });

  it('lets them read, and offers no way to change anything', () => {
    const allowed = flags(proxy).filter((flag) => flag.startsWith('-allow'));
    expect(allowed.sort()).toEqual(['-allowGET', '-allowHEAD', '-allowfrom', '-allowhealthcheck']);
  });

  it('lets them read containers, their logs, events and networks, and nothing with a secret in it', () => {
    const get = (proxy?.command ?? []).find((argument) => argument.startsWith('-allowGET='));
    expect(get).toBe(
      '-allowGET=/v1\\..{1,2}/(version|info|events.*|containers/json.*|containers/[^/]+/json|containers/[^/]+/logs.*|networks.*)'
    );
  });

  it('sits on a network of its own, which has no way out', () => {
    expect(Object.keys(proxy?.networks ?? {})).toEqual(['docker']);
    expect(laptop.networks.docker).toEqual(
      expect.objectContaining({ name: 'zigordev-docker', internal: true })
    );
  });

  it('is reached only by the ingress and the agent', () => {
    const members = services
      .filter(([, service]) => Object.keys(service.networks ?? {}).includes('docker'))
      .map(([name]) => name);
    expect(members.sort()).toEqual(['alloy', 'docker-proxy', 'traefik']);
  });
});

describe('the ingress', () => {
  const traefik = laptop.services.traefik;

  it('learns the routes from Docker through the proxy, and routes nothing that did not ask for it', () => {
    expect(traefik?.environment).toEqual(
      expect.objectContaining({
        TRAEFIK_PROVIDERS_DOCKER: 'true',
        TRAEFIK_PROVIDERS_DOCKER_ENDPOINT: 'tcp://docker-proxy:2375',
        TRAEFIK_PROVIDERS_DOCKER_EXPOSEDBYDEFAULT: 'false',
        TRAEFIK_PROVIDERS_DOCKER_NETWORK: 'zigordev',
      })
    );
  });

  it('drops a header whose name only imitates another one', () => {
    expect(traefik?.environment?.TRAEFIK_GLOBAL_ALIASHEADERSSTRATEGY).toBe('delete');
  });

  it('reports its own numbers to the agent, and calls no one else', () => {
    expect(traefik?.environment).toEqual(
      expect.objectContaining({
        TRAEFIK_METRICS_OTLP: 'true',
        TRAEFIK_METRICS_OTLP_HTTP_ENDPOINT: 'http://alloy:4318/v1/metrics',
        TRAEFIK_GLOBAL_CHECKNEWVERSION: 'false',
        TRAEFIK_GLOBAL_SENDANONYMOUSUSAGE: 'false',
      })
    );
  });

  it('shows its own pages on the laptop only', () => {
    expect(traefik?.environment?.TRAEFIK_API).toBe('true');
    expect(everywhere.services.traefik?.environment?.TRAEFIK_API).toBeUndefined();
  });
});

describe('the telemetry agent', () => {
  const config = laptop.services.alloy?.environment?.ALLOY_CONFIG ?? '';

  it('carries the same config on the laptop and everywhere else', () => {
    expect(config.length).toBeGreaterThan(500);
    expect(everywhere.services.alloy?.environment?.ALLOY_CONFIG).toBe(config);
  });

  it('holds no dollar sign in that config, which Compose would read as a variable', () => {
    expect(config).not.toContain('$');
  });

  it('learns where to send the data from its settings, so only the settings differ', () => {
    expect(config).toContain('endpoint = sys.env("OTLP_DESTINATION")');
    expect(config).toContain('url = sys.env("LOKI_DESTINATION")');
    expect(config).not.toContain('lgtm');
    expect(everywhere.services.alloy?.environment?.OTLP_DESTINATION).toBeUndefined();
    expect(laptop.services.alloy?.environment).toEqual(
      expect.objectContaining({
        OTLP_DESTINATION: 'http://lgtm:4318',
        LOKI_DESTINATION: 'http://lgtm:3100/loki/api/v1/push',
      })
    );
  });

  it('reads the logs of the containers on the two platform networks, and of no other container', () => {
    expect(config).toContain('values = ["zigordev", "zigordev-docker"]');
    expect(config.match(/host\s+= sys\.env\("DOCKER_HOST"\)/g)).toHaveLength(2);
    expect(laptop.services.alloy?.environment?.DOCKER_HOST).toBe('tcp://docker-proxy:2375');
  });

  it('looks for new containers every 5 seconds, so that a short job is not missed', () => {
    expect(config).toContain('refresh_interval = "5s"');
  });

  it('reads the machine through three mounts that it cannot write to', () => {
    const mounts = (laptop.services.alloy?.volumes ?? []).filter((mount) => mount.type === 'bind');
    expect(mounts).toEqual([
      expect.objectContaining({ source: '/proc', target: '/host/proc', read_only: true }),
      expect.objectContaining({ source: '/sys', target: '/host/sys', read_only: true }),
      expect.objectContaining({ source: '/', target: '/host/root', read_only: true }),
    ]);
    expect(everywhere.services.alloy?.volumes).toEqual(laptop.services.alloy?.volumes);
  });

  it('keeps only the machine series that a dashboard or an alert uses', () => {
    expect(config).toContain(
      'regex         = "alloy_build_info;;|node_cpu_seconds_total;idle;|node_memory_(MemTotal|MemAvailable)_bytes;;|node_filesystem_(size|avail)_bytes;;(ext4|xfs)"'
    );
    expect(config).toContain('action        = "keep"');
  });

  it('reports its own heartbeat as alloy, and the machine as host', () => {
    expect(config).toContain('replacement   = "alloy"');
    expect(config).toContain('replacement   = "host"');
  });

  it('lifts the trace id out of a log line, so that the line links to its trace and the trace to its lines', () => {
    expect(config).toContain('forward_to = [loki.process.containers.receiver]');
    expect(config).toContain('expressions = { trace_id = "traceId" }');
    expect(config).toContain('stage.structured_metadata {');
    expect(config).toContain('values = { trace_id = "" }');
  });

  it('names each log line by the service that wrote it', () => {
    expect(config).toContain(
      'source_labels = ["__meta_docker_container_label_com_docker_compose_service"]'
    );
    expect(config).toContain('target_label  = "service_name"');
  });
});

describe('the job that pushes the dashboards and the alert rules', () => {
  const job = withJobs.services.gcx;

  it('is not one of the services: it runs once, on request, and ends', () => {
    expect(laptop.services.gcx).toBeUndefined();
    expect(job?.profiles).toEqual(['push']);
    expect(job?.healthcheck).toBeUndefined();
  });

  it('is boxed in like a service', () => {
    expect(job?.image).toMatch(/^grafana\/gcx:v\d+\.\d+\.\d+$/);
    expect(job?.user).toBe('65532:65532');
    expect(job?.init).toBe(true);
    expect(job?.read_only).toBe(true);
    expect(job?.cap_drop).toEqual(['ALL']);
    expect(job?.security_opt).toEqual(['no-new-privileges:true']);
    expect(Number(job?.mem_limit)).toBeGreaterThan(0);
    expect(job?.cpus).toBeGreaterThan(0);
    expect(job?.ports).toBeUndefined();
  });

  it('reads the files beside the compose files, and cannot change them', () => {
    expect(job?.volumes).toEqual([
      expect.objectContaining({ type: 'bind', target: '/resources', read_only: true }),
    ]);
    expect(job?.volumes?.[0]?.source).toMatch(/\/observability$/);
    expect(job?.command).toEqual([
      'resources',
      'push',
      '--path',
      '/resources',
      '--on-error',
      'abort',
    ]);
  });

  it('pushes to the local Grafana, reports nothing to its maker, and keeps no sign-in', () => {
    expect(job?.environment).toEqual(
      expect.objectContaining({
        GRAFANA_SERVER: 'http://lgtm:3000',
        GCX_TELEMETRY: 'disabled',
        GCX_KEYCHAIN: 'off',
      })
    );
  });
});

describe('what only the laptop has', () => {
  it('stays out of the file that runs everywhere: no published port and no local address', () => {
    const text = JSON.stringify(everywhere);
    expect(text).not.toContain('.localhost');
    expect(text).not.toContain('"published"');
  });

  it('gives a local address to each service that has a page', () => {
    const rules = services.flatMap(([, service]) =>
      Object.entries(service.labels ?? {})
        .filter(([label]) => label.endsWith('.rule'))
        .map(([, rule]) => rule)
    );
    expect(rules.sort()).toEqual([
      'Host(`alloy.localhost`)',
      'Host(`grafana.localhost`)',
      'Host(`mail.localhost`)',
      'Host(`traefik.localhost`)',
    ]);
  });

  it('keeps the data of the local Grafana in a volume, and the mail in memory', () => {
    expect(laptop.services.lgtm?.volumes).toEqual([
      expect.objectContaining({ type: 'volume', source: 'lgtm-data', target: '/data' }),
    ]);
    expect(laptop.services.mailpit?.volumes).toBeUndefined();
  });
});
