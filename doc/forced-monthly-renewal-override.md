# Forced Monthly Renewal Override

This document describes an optional backend-only override that realigns
legacy monthly recurring renewals to a configured calendar day and UTC
time without editing existing buckets in bulk.

## Goal

Allow operations to force monthly renewals onto a specific day and time,
for example day `28` at `03:00:00`, even when older recurring payments
and bucket expirations were created with a different monthly cadence.

## Configuration

Example entries in `sys.config`:

```erlang
{force_monthly_renewal_enabled, true},
{force_monthly_renewal_day, 28},
{force_monthly_renewal_time, {3, 0, 0}}
```

`force_monthly_renewal_time` is interpreted as UTC.

If operations need a local timezone, convert it before saving the value.
The runtime configuration itself does not store a timezone field.

## Scope

The override applies only to recurring prices and recurring alterations
with:

- `period = monthly`
- `month_day = undefined`

If a product offering price already has an explicit `month_day`, that
explicit value keeps precedence.

## Behavior

When the override is enabled:

- new monthly due dates are aligned to the configured day and UTC time
- existing stored monthly payment due dates are treated as due according
  to the forced schedule for the current cycle
- once a charge runs, the next due date is stored using the forced
  schedule

Example:

- stored recurring payment due date corresponds to the 30th
- override is day `28`, time `03:00:00` UTC
- when the current month reaches the 28th at `03:00:00` UTC, the monthly
  recurring charge becomes due even if the old stored due date would only
  expire on the 30th

## Short Months

If the configured day does not exist in a month, the renewal is clamped
to the last day of that month.

Examples for day `30`:

- February 2025 -> February 28
- February 2028 -> February 29
- April -> April 30

## Compatibility

This override is optional and backward compatible.

- when disabled, legacy monthly recurrence is unchanged
- non-monthly recurrence is unchanged
- explicit `month_day` pricing remains unchanged

## Implementation Notes

Main code paths:

- `src/ocs.erl`
- `src/ocs_scheduler.erl`
- `test/ocs_charging_SUITE.erl`

The override is applied in recurring due-date calculation rather than by
rewriting existing buckets.
