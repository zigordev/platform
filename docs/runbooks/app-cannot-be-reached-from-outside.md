# An app cannot be reached from outside

## What it means

Grafana Cloud calls the health address of every live product, `https://<product>.zigordev.com/health`, every 5 minutes, from Frankfurt and from London. For 5 minutes the latest call from both places has failed. The alert names the product.

A call fails when no answer comes within 10 seconds, when the certificate is wrong, or when the answer is not a success, a status from 200 to 299. `/health` itself answers 503 while a part the product cannot work without is down, so a product that runs but is not well fails the call too.

Visitors of that product cannot use it, or reach a product that says it is broken.

## How to check

1. Open the alert's panel, "Outside checks that pass, by product and place", on the Platform dashboard, in the row From outside. It shows since when, and whether both places agree.
2. Call the address yourself: `curl -sS -i https://<product>.zigordev.com/health`.

   | Answer                                       | Means                                                                                          |
   | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
   | `503`, with a part `down` in the body        | The product runs, and that part is down. The body names it, such as `db` or `topics`           |
   | `404` from Traefik                           | The product is not running, so the ingress has nowhere to send the call                        |
   | A Cloudflare error page, such as 1033 or 530 | The tunnel from Cloudflare to the host is down: the connector `cloudflared`, or the whole host |
   | No answer                                    | Cloudflare or the network in between                                                           |

3. Read each call's error in Grafana Cloud: Testing & synthetics, then Synthetics, then Checks, then the product's check. Its logs hold the error of every call.
4. Look at the other alerts. When [Telemetry went silent](telemetry-went-silent.md) fires too, the whole host is likely down.
5. Look at the product's last deploy: a deploy that failed puts the version before back, and its run on GitHub says so.

## How to fix

| What you found                        | What to do                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `503` with a part down                | Follow the alert of that part, such as [The Kafka broker is down](kafka-broker-is-down.md). A missing topic is a line in `KAFKA_SETUP` in `stack/compose.yaml`                                   |
| `404` from Traefik                    | Open a shell on the host, as `docs/cloud-first-deploy.md` says under "How to open a shell", and run `sudo docker ps --all --filter name=<product>`. The logs of a container that stopped say why |
| The tunnel is down, and the host runs | `sudo docker ps --filter name=cloudflared` on the host. The deploy of the shared services starts it again, on the next merge to `main` or by hand with the owner's yes                           |
| The host is gone                      | The host is rebuilt from code, as `docs/cloud-first-deploy.md` says. Every product comes back with it                                                                                            |
| A certificate error                   | Cloudflare serves the certificate. Run the plan of `infra/cloudflare` and compare                                                                                                                |

A product that was down for a while also shows it in its own alerts once it is back, such as errors from requests that failed.
