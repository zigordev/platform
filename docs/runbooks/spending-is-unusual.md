# Spending is unusual

## What it means

AWS sends this alert itself, not Grafana, by email to the address in `/platform/ALERT_EMAIL`. `infra/bootstrap` sets up three emails:

| Email                                                        | Sent when                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| From the budget `platform-monthly`, for the forecast         | AWS forecasts that the month will cost more than $45                     |
| From the budget `platform-monthly`, for the spending         | The month has cost more than $45                                         |
| From cost anomaly detection, `Default-Services-Subscription` | One service's spending jumps by $5 or more against its usual, once a day |

On 2026-11-26 the platform cost about $36 a month: the host, a t4g.medium, $26.86; its public IP address $3.65; the disks $2.64; the keys $2; and small amounts for the backups and the email. Toolkit's [record 0001](https://github.com/zigordev/toolkit/blob/main/docs/adr/0001-production-runs-on-aws-sized-small.md) says the budget moves with each step up, and the owner chose $45 on 2026-11-26, after the host stepped up to a t4g.medium.

So more than $45 means something new costs money, or something grew.

## How to check

1. Open AWS's console, in Billing and Cost Management, then Bills. It lists this month's spending by service. Cost Explorer shows it by service and by day. Both are free to look at in the console.
2. Compare it with the list above. The usual causes: a second server left running, more snapshots than the 7 that Data Lifecycle Manager keeps, a bigger disk, data sent out of AWS, or a service nobody planned.
3. For an email from anomaly detection, its link opens the anomaly in Cost Explorer, with the service and the kind of use.
4. Find which stack holds a resource: every resource made by code carries the tags `managed-by = opentofu` and `stack`, in the console's Resource Groups and Tag Editor.

## How to fix

| What you found                                             | What to do                                                                                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A step up the owner approved, such as a bigger host        | Move the budget with it: `monthly_budget_usd` in `infra/bootstrap/locals.tf`, through a pull request. The bootstrap is applied from the laptop, after the owner has seen its plan and said yes |
| A resource made by code that nobody needs any more         | Remove it from its stack through a pull request. Its apply waits for the owner's approval                                                                                                      |
| A resource without the tag `managed-by = opentofu`         | It was made by hand. The owner decides whether it goes, or is written into the code                                                                                                            |
| A jump that a planned job explains, such as a host rebuild | Nothing. Note it, so the next email of the same kind is understood                                                                                                                             |
