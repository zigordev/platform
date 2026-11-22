# 0003. The Docker proxy is socket-proxy

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

The ingress and the telemetry agent have to know which containers exist. Docker answers that through its socket, and the socket also starts containers with any privilege, so holding it is the same as owning the machine. The plan therefore puts a proxy in front of it, which lets those two services read and nothing more, and names no product for it.

Every service here runs as a user that is not root, on a read-only file system, with no capabilities and with a health check. The proxy is the one container that touches the socket, so it should meet those rules more than any other. Both candidates were read on their own pages on 2026-11-22.

## Decision

The Docker proxy is `wollomatic/socket-proxy`, pinned to an exact version.

- It refuses every request by default. `compose.yaml` allows `GET` on the version, the containers, their log lines, the events and the networks, and `HEAD` on the ping. No other method is allowed.
- It answers only the ingress and the agent, by name.
- It runs as user 65534 in the group that owns the socket, on a read-only file system, with no capabilities.
- It sits on a network of its own that has no way out.

## Consequences

- A flaw in the ingress or in the agent cannot start, stop or change a container.
- The proxy has its own health check, and writes JSON lines, so it is watched like any app.
- The allow-list is one regular expression that we keep. A new version of Traefik or Alloy that asks Docker something new is refused until the list allows it, and the proxy's log names the refused request.
- The group that owns the socket differs between Docker Desktop and the host, so it is a setting of `compose.local.yaml` and, later, of `compose.production.yaml`.
- The project is smaller than its best-known alternative: 489 stars against 2,900 on 2026-11-22. It is written in Go with no dependency, and its licence is MIT.

## Alternatives considered

- **Tecnativa/docker-socket-proxy.** The most widely used, built on HAProxy, under the Apache 2.0 licence. Its own page asks for a privileged container, it has no health check, and it publishes no exact version tags, only moving ones.
- **linuxserver/socket-proxy.** The same idea on nginx, in an image that starts as root with an init system of its own.
- **Mount the socket read-only into the ingress and the agent.** Read-only applies to the file, not to what Docker does when asked through it. Both services would hold the whole machine.
