# The host is filling up

## What it means

The machine that runs the containers is short of memory or of disk: its memory is more than 85% in use, or one of its disks more than 80%.

Nothing has failed yet. A machine with no memory left starts stopping containers, and a full disk stops the databases from writing, so this is the alert to act on before one of those happens.

On the laptop "the host" is the small Linux machine inside Docker Desktop, so the alert can show there too. It means Docker's own disk or memory is nearly full.

## How to check

1. Open the alert's panel. It is on the Platform dashboard: "Processor and memory in use". Beside it, "Disk in use" shows each disk.
2. See which container uses the memory: `docker stats --no-stream`. It lists each container with its use and its limit.
3. See what uses the disk: `docker system df`. It lists images, containers, volumes and the build cache, each with what can be freed.
4. On the host, from phase 3: open a shell through AWS Systems Manager and run the same two commands there, and `df -h` for the disks.

## How to fix

| What you found                                          | What to do                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| One container is at its memory limit                    | Look for a leak in that app first. Raise its limit in its compose file only when its need is real  |
| Every container is within its limit, and memory is full | The limits add up to more than the machine has. Lower one, or step the host up to the next size    |
| Old images fill the disk                                | `docker image prune` removes the ones no container uses. On the host a timer does this every night |
| The build cache fills the disk, on the laptop           | `docker builder prune` empties it. It only costs the next build some time                          |
| A database volume fills the disk                        | That is real data. Give the data disk more room, through a pull request in this repo from phase 3  |
| The local Grafana fills the disk, on the laptop         | `pnpm local:reset` empties its stores                                                              |

Never remove a volume to make room. A volume is the data.
