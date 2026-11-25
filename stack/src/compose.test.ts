import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { model, type Service } from '../test/model.ts';

const everywhere = model(['compose.yaml']);
const laptop = model(['compose.yaml', 'compose.local.yaml']);
const withJobs = model(['compose.yaml', 'compose.local.yaml'], 'push');
const withSetup = model(['compose.yaml', 'compose.local.yaml'], 'setup');
const production = model(['compose.yaml', 'compose.production.yaml']);

const productionText = readFileSync(new URL('../compose.production.yaml', import.meta.url), 'utf8');
const productionSecrets = readFileSync(
  new URL('../.env.production.example', import.meta.url),
  'utf8'
);

const services: [string, Service][] = Object.entries(laptop.services);
const connector = production.services.cloudflared;
const boxed: [string, Service][] =
  connector === undefined ? services : [...services, ['cloudflared', connector]];
const socket = '/var/run/docker.sock';

function seconds(period: string | undefined): number {
  const match = /^(\d+)s$/.exec(period ?? '');
  return match === null ? Number.NaN : Number(match[1]);
}

function flags(service: Service | undefined): string[] {
  return (service?.command ?? []).map((argument) => argument.split('=')[0] ?? '');
}

describe('the shared services', () => {
  it("are six on the laptop and five in production, the four that run everywhere among them, beside Kafka's job", () => {
    expect(Object.keys(laptop.services).sort()).toEqual([
      'alloy',
      'docker-proxy',
      'kafka',
      'lgtm',
      'mailpit',
      'traefik',
    ]);
    expect(Object.keys(everywhere.services).sort()).toEqual([
      'alloy',
      'docker-proxy',
      'kafka',
      'kafka-setup',
      'traefik',
    ]);
    expect(Object.keys(production.services).sort()).toEqual([
      'alloy',
      'cloudflared',
      'docker-proxy',
      'kafka',
      'kafka-setup',
      'traefik',
    ]);
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

describe.each(boxed)('%s', (name, service) => {
  it('is pinned to one exact version and its digest', () => {
    expect(service.image).toMatch(/^[\w./-]+:v?\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  });

  it('comes back by itself when the host restarts, unless someone stopped it', () => {
    expect(service.restart).toBe('unless-stopped');
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
    it('publishes port 80, on this laptop itself and nowhere else', () => {
      expect(service.ports).toEqual([
        expect.objectContaining({ host_ip: '127.0.0.1', published: '80', target: 8080 }),
        expect.objectContaining({ host_ip: '::1', published: '80', target: 8080 }),
      ]);
    });
  } else if (name === 'kafka') {
    it('publishes only the listener for an app that runs outside a container, on this laptop itself', () => {
      expect(service.ports).toEqual([
        expect.objectContaining({ host_ip: '127.0.0.1', published: '9094', target: 9094 }),
        expect.objectContaining({ host_ip: '::1', published: '9094', target: 9094 }),
      ]);
      expect(everywhere.services.kafka?.ports).toBeUndefined();
    });
  } else if (name === 'alloy') {
    it('publishes only its OTLP port for HTTP, on this laptop itself, for an app that runs outside a container', () => {
      expect(service.ports).toEqual([
        expect.objectContaining({ host_ip: '127.0.0.1', published: '4318', target: 4318 }),
      ]);
      expect(everywhere.services.alloy?.ports).toBeUndefined();
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

  it('runs in the group that owns the socket: 0 on Docker Desktop, and the one it is told elsewhere', () => {
    expect(proxy?.user).toBe('65534:0');
    const local = readFileSync(new URL('../compose.local.yaml', import.meta.url), 'utf8');
    expect(local).toMatch(/^ {4}user: "65534:\$\{DOCKER_SOCKET_GROUP:-0\}"$/m);
    expect(productionText).toMatch(/^ {4}user: "65534:\$\{DOCKER_SOCKET_GROUP\}"$/m);
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
    for (const line of [
      'OTLP_USERNAME: ${GRAFANA_STACK_ID}',
      'OTLP_PASSWORD: ${GRAFANA_ALLOY_TOKEN}',
      'LOKI_DESTINATION: ${GRAFANA_LOKI_URL}/loki/api/v1/push',
      'LOKI_USERNAME: ${GRAFANA_LOKI_USER}',
      'LOKI_PASSWORD: ${GRAFANA_ALLOY_TOKEN}',
    ]) {
      expect(productionText).toContain(`      ${line}\n`);
    }
    expect(production.services.alloy?.environment?.ALLOY_CONFIG).toBe(config);
  });

  it("adds Grafana Cloud's OTLP path in production, because the stack's stored address has none and the gateway answers 404 without it", () => {
    expect(productionText).toContain('      OTLP_DESTINATION: ${GRAFANA_OTLP_URL}/otlp\n');
  });

  it("reads each container's memory from the host's file in production, and finds no file on the laptop", () => {
    expect(config).toContain('set_collectors = ["cpu", "meminfo", "filesystem", "textfile"]');
    expect(config).toContain('directory = sys.env("TEXTFILE_DIRECTORY")');
    expect(laptop.services.alloy?.environment?.TEXTFILE_DIRECTORY).toBe('/tmp');
    expect(production.services.alloy?.environment?.TEXTFILE_DIRECTORY).toBe(
      '/host/root/var/lib/platform/metrics'
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

  it("keeps only the machine series that a dashboard or an alert uses, the backups' results among them", () => {
    expect(config).toContain(
      'regex         = "alloy_build_info;;|node_cpu_seconds_total;idle;|node_memory_(MemTotal|MemAvailable)_bytes;;|node_filesystem_(size|avail)_bytes;;(ext4|xfs)|container_(memory_working_set|spec_memory_limit)_bytes;;|platform_backup_(last_success_timestamp_seconds|size_bytes);;|platform_restore_test_(last_success_timestamp_seconds|tables);;|probe_success;;"'
    );
    expect(config).toContain('action        = "keep"');
  });

  it("lets the four results of the host's backup script through, and no other series of theirs", () => {
    const pattern = /regex {9}= "(alloy_build_info[^"]+)"/.exec(config)?.[1] ?? '';
    const kept = (series: string) => new RegExp(`^(?:${pattern})$`).test(series);
    for (const name of [
      'platform_backup_last_success_timestamp_seconds',
      'platform_backup_size_bytes',
      'platform_restore_test_last_success_timestamp_seconds',
      'platform_restore_test_tables',
    ]) {
      expect(kept(`${name};;`), name).toBe(true);
    }
    expect(kept('platform_backup_duration_seconds;;')).toBe(false);
    expect(kept('container_memory_working_set_bytes;;')).toBe(true);
  });

  it('reports its own heartbeat as alloy, and the machine as host', () => {
    expect(config).toContain('replacement   = "alloy"');
    expect(config).toContain('replacement   = "host"');
  });

  it("checks that the Kafka broker answers on its port, and reports it as kafka, without signing in, so a broker that is down never stops the agent's start", () => {
    expect(config).toContain('prometheus.exporter.blackbox "kafka" {');
    expect(config).toContain('config = "{ modules: { tcp: { prober: tcp, timeout: 5s } } }"');
    expect(config).toContain('address = "kafka:9092"');
    expect(config).toContain('prometheus.exporter.blackbox.kafka.targets,');
    expect(config).toContain('regex         = "integrations/blackbox/kafka"');
    expect(config).toContain('replacement   = "kafka"');
    expect(config).not.toContain('prometheus.exporter.kafka');
    expect(config).not.toContain('sasl');
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

describe('the Kafka broker', () => {
  const broker = everywhere.services.kafka;
  const settings = broker?.environment ?? {};

  it('signs every client in with SCRAM-SHA-512, and lets a user do only what a rule allows, as records 0039 and 0041 of toolkit say', () => {
    expect(settings.KAFKA_SASL_ENABLED_MECHANISMS).toBe('SCRAM-SHA-512');
    expect(settings.KAFKA_SASL_MECHANISM_INTER_BROKER_PROTOCOL).toBe('SCRAM-SHA-512');
    expect(settings.KAFKA_AUTHORIZER_CLASS_NAME).toBe(
      'org.apache.kafka.metadata.authorizer.StandardAuthorizer'
    );
    expect(settings.KAFKA_ALLOW_EVERYONE_IF_NO_ACL_FOUND).toBe('false');
    expect(settings.KAFKA_SUPER_USERS).toBe('User:admin;User:setup;User:ANONYMOUS');
  });

  it('keeps its controller port inside its own container, because the controller signs in as the unnamed user', () => {
    expect(settings.KAFKA_LISTENERS).toBe('SASL_PLAINTEXT://:9092,CONTROLLER://localhost:9093');
    expect(settings.KAFKA_CONTROLLER_QUORUM_VOTERS).toBe('1@localhost:9093');
    expect(settings.KAFKA_LISTENER_SECURITY_PROTOCOL_MAP).toBe(
      'CONTROLLER:PLAINTEXT,SASL_PLAINTEXT:SASL_PLAINTEXT'
    );
  });

  it('is one node that is broker and controller at once, and never makes a topic on its first use', () => {
    expect(settings.KAFKA_PROCESS_ROLES).toBe('broker,controller');
    expect(settings.KAFKA_AUTO_CREATE_TOPICS_ENABLE).toBe('false');
    expect(settings.KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR).toBe('1');
  });

  it('formats its storage once, with the users admin and setup, before the image starts it', () => {
    const script = broker?.command?.join(' ') ?? '';
    expect(script).toContain('kafka-storage.sh format --ignore-formatted');
    expect(script).toContain(
      '--add-scram "SCRAM-SHA-512=[name=admin,password=$${KAFKA_ADMIN_PASSWORD}]"'
    );
    expect(script).toContain(
      '--add-scram "SCRAM-SHA-512=[name=setup,password=$${KAFKA_SETUP_PASSWORD}]"'
    );
    expect(script).toContain('exec /etc/kafka/docker/run');
  });

  it('keeps its data in a volume, and its heap well inside its memory limit', () => {
    expect(broker?.volumes).toEqual([
      expect.objectContaining({
        type: 'volume',
        source: 'kafka-data',
        target: '/var/lib/kafka/data',
      }),
    ]);
    expect(settings.KAFKA_HEAP_OPTS).toBe('-Xms512m -Xmx512m');
    expect(Number(broker?.mem_limit)).toBe(1024 * 1024 * 1024);
  });

  it('writes only to its data, its generated settings and /tmp, and runs without JMX', () => {
    expect(broker?.tmpfs).toEqual([
      '/tmp',
      '/opt/kafka/config:uid=1000,gid=1000',
      '/opt/kafka/logs:uid=1000,gid=1000',
    ]);
    expect(settings.KAFKA_JMX_OPTS).toBe(' ');
  });

  it('takes throwaway passwords on the laptop, and the secrets of the host in production', () => {
    expect(laptop.services.kafka?.environment).toEqual(
      expect.objectContaining({
        KAFKA_ADMIN_PASSWORD: 'local-only-admin',
        KAFKA_SETUP_PASSWORD: 'local-only-setup',
      })
    );
    expect(productionText).toContain('KAFKA_ADMIN_PASSWORD: ${KAFKA_ADMIN_PASSWORD}');
    expect(productionText).toContain('KAFKA_SETUP_PASSWORD: ${KAFKA_SETUP_PASSWORD}');
  });

  it('gives an app outside a container a listener of its own on the laptop, and has none in production', () => {
    const local = laptop.services.kafka?.environment ?? {};
    expect(local.KAFKA_ADVERTISED_LISTENERS).toBe(
      'SASL_PLAINTEXT://kafka:9092,EXTERNAL://localhost:9094'
    );
    expect(local.KAFKA_LISTENER_SECURITY_PROTOCOL_MAP).toContain('EXTERNAL:SASL_PLAINTEXT');
    expect(production.services.kafka?.environment?.KAFKA_ADVERTISED_LISTENERS).toBe(
      'SASL_PLAINTEXT://kafka:9092'
    );
  });
});

describe("the job that sets up Kafka's topics, users and rules", () => {
  const job = everywhere.services['kafka-setup'];
  const script = job?.command?.join(' ') ?? '';

  it('runs once, after the broker is healthy, as a job that the deploy runs on the host', () => {
    expect(job?.labels).toEqual({ 'com.zigordev.job': 'migrate' });
    expect(job?.restart).toBe('no');
    expect(job?.depends_on?.kafka?.condition).toBe('service_healthy');
    expect(job?.healthcheck).toBeUndefined();
  });

  it('waits for the command on the laptop, outside the wait for health checks', () => {
    expect(laptop.services['kafka-setup']).toBeUndefined();
    expect(withSetup.services['kafka-setup']?.profiles).toEqual(['setup']);
  });

  it('is boxed in like a service, on the image of the broker', () => {
    expect(job?.image).toBe(everywhere.services.kafka?.image);
    expect(job?.user).toBe('1000:1000');
    expect(job?.init).toBe(true);
    expect(job?.read_only).toBe(true);
    expect(job?.cap_drop).toEqual(['ALL']);
    expect(job?.security_opt).toEqual(['no-new-privileges:true']);
    expect(Number(job?.mem_limit)).toBeGreaterThan(0);
    expect(job?.cpus).toBeGreaterThan(0);
    expect(job?.ports).toBeUndefined();
  });

  it('signs in as the user setup, and gives each user the password named after it', () => {
    expect(script).toContain('username=\\"setup\\" password=\\"$${KAFKA_SETUP_PASSWORD}\\"');
    expect(script).toContain('KAFKA_PASSWORD_');
    expect(script).toContain('is not set, so the user');
  });

  it('only adds topics, users and rules, so a run never deletes data', () => {
    expect(script).toContain('--create --if-not-exists');
    expect(script).not.toContain('--delete');
    expect(script).not.toContain('--remove');
  });

  it('takes the password of the user setup from the secrets of the host in production', () => {
    expect(productionText).toMatch(
      /kafka-setup:\n\s+environment:\n\s+KAFKA_SETUP_PASSWORD: \$\{KAFKA_SETUP_PASSWORD\}/
    );
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
    expect(job?.image).toMatch(/^grafana\/gcx:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
    expect(job?.restart).toBe('no');
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

describe('what only production has', () => {
  it("runs the connector of Cloudflare's tunnel there only, beside the ingress, once the ingress is healthy", () => {
    expect(laptop.services.cloudflared).toBeUndefined();
    expect(everywhere.services.cloudflared).toBeUndefined();
    expect(Object.keys(connector?.networks ?? {})).toEqual(['zigordev']);
    expect(connector?.depends_on?.traefik?.condition).toBe('service_healthy');
  });

  it('runs the tunnel with its token, and checks itself through the ready address of its own metrics', () => {
    expect(connector?.command).toEqual([
      'tunnel',
      '--metrics',
      '0.0.0.0:2000',
      '--grace-period',
      '20s',
      'run',
    ]);
    expect(productionText).toContain('      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}\n');
    expect(connector?.healthcheck?.test).toEqual([
      'CMD',
      'cloudflared',
      'tunnel',
      '--metrics',
      '127.0.0.1:2000',
      'ready',
    ]);
  });

  it('names every secret it reads in .env.production.example, and nothing more', () => {
    const used = new Set(
      [...productionText.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map((match) => match[1])
    );
    used.delete('DOCKER_SOCKET_GROUP');
    const named = productionSecrets
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/=$/, ''));
    expect([...used].sort()).toEqual([...named].sort());
  });

  it('publishes no port and has no local address', () => {
    const text = JSON.stringify(production);
    expect(text).not.toContain('.localhost');
    expect(text).not.toContain('"published"');
  });
});
