# An app is slow

## What it means

The slowest 5% of the requests to one app have taken longer than 1 second for 10 minutes. The alert names the app.

The app still answers. One visitor in twenty waits long enough to notice, and it usually gets worse before it gets better.

## How to check

1. Open the alert's panel. It is on the App dashboard, with the app already picked: "Response time of the slowest 5%".
2. Look at "Response time of the slowest 5%, by route". One slow route is a problem in that route. Every route slow at once is a problem around the app.
3. Look at "Requests per second". More traffic than usual at the same moment means the app is busy, not broken.
4. In Grafana's Explore, pick Tempo and search for traces of this app that took longer than 1 second. The longest step in such a trace is where the time goes: most often a database query.
5. Open the Platform dashboard and look at "Processor and memory in use". A machine that is full makes every app slow.

## How to fix

| What you found                                   | What to do                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| One route is slow, and its trace shows one query | Fix the query in the product's repo: most often it needs an index, or it asks for more rows than it shows |
| Every route is slow, and the machine is full     | Follow [The host is filling up](host-is-filling-up.md)                                                    |
| Every route is slow since a new version          | Roll back to the version before. From phase 3 that is one command, followed by a revert                   |
| The traffic is higher than usual                 | Nothing is broken. If it stays that high, the app needs a higher limit or the host a bigger size          |
| The limit of 1 second is wrong for this app      | Change it in `observability/src/alerts.ts`, through a pull request that says why                          |
