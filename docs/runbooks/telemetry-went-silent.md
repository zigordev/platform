# Telemetry went silent

## What it means

The telemetry agent, Alloy, has reported nothing for 10 minutes. Alloy is the one door through which every log line, trace and metric leaves the machine, so while it is silent nothing else is known either: no dashboard is current, and no other alert can fire.

The apps themselves may be fine. This alert says that we would not know if they were not.

## How to check

1. Open the alert's panel. It is on the Platform dashboard: "Telemetry agents reporting". It shows 0 while the agent is silent.
2. See whether the agent runs: `docker ps --filter name=alloy`. Its status has to say `healthy`.
3. Read what it says about itself: `docker logs --tail 50 platform-alloy-1`. A line with `level=error` names the part that fails.
4. On the laptop, open `http://alloy.localhost`. Each part of its config is listed there, and a part that cannot send is red.
5. See whether the agent can reach the Docker proxy, which it needs to read the log lines: `docker ps --filter name=docker-proxy`.
6. In production, from phase 3: see whether Grafana Cloud accepts data at all, on its own status page. An agent that runs and cannot deliver looks the same from here.

## How to fix

| What you found                                  | What to do                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The agent's container is not running            | On the laptop, `pnpm local:up` starts it again. On the host, from phase 3, the deploy of the shared services does |
| The agent restarts again and again              | Its config is wrong. The log names the line. Fix `stack/compose.yaml` through a pull request                      |
| The agent runs, and its log says it cannot send | The address or the sign-in of the destination is wrong, or the destination is down                                |
| The Docker proxy is not healthy                 | The agent cannot list containers. `docker logs platform-docker-proxy-1` says why                                  |
| The whole machine is gone                       | This alert is then only the first sign. From phase 3, the check from outside fires too, and the host is rebuilt   |
