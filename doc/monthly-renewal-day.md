# Monthly Fixed Renewal Day

This document describes the implemented support for recurring monthly
charges with a fixed day of month, such as day `28` or day `30`.

## Summary

OCS now supports two monthly recurring behaviors:

- Legacy monthly recurrence
- Fixed-day monthly recurrence

Legacy monthly recurrence remains the default and is unchanged for
existing offers.

Fixed-day monthly recurrence is enabled only when the API payload
includes `recurringChargeDayOfMonth`.

## API behavior

The existing recurring period field is unchanged:

```json
{
  "priceType": "recurring",
  "recurringChargePeriod": "monthly"
}
```

To enable fixed-day monthly recurrence, send:

```json
{
  "priceType": "recurring",
  "recurringChargePeriod": "monthly",
  "recurringChargeDayOfMonth": 30
}
```

The same field is supported on:

- `productOfferingPrice`
- `productOfferPriceAlteration`

Example with an alteration:

```json
{
  "name": "Monthly package",
  "productOfferingPrice": [
    {
      "name": "Subscription fee",
      "priceType": "recurring",
      "recurringChargePeriod": "monthly",
      "recurringChargeDayOfMonth": 30,
      "price": {
        "taxIncludedAmount": 10,
        "currencyCode": "USD"
      },
      "productOfferPriceAlteration": {
        "name": "Allowance",
        "priceType": "recurring",
        "recurringChargePeriod": "monthly",
        "recurringChargeDayOfMonth": 30,
        "unitOfMeasure": "10g",
        "price": {
          "taxIncludedAmount": 0,
          "currencyCode": "USD"
        }
      }
    }
  ]
}
```

## Validation rules

- `recurringChargeDayOfMonth` is optional.
- It is valid only when `recurringChargePeriod = "monthly"`.
- Allowed values are `1..31`.
- If `recurringChargeDayOfMonth` is present for `hourly`, `daily`,
  `weekly`, or `yearly`, the offer is rejected by backend validation.

## Renewal calculation

When `recurringChargeDayOfMonth` is not present:

- OCS keeps the existing monthly logic.
- Existing offers continue to renew exactly as before.

When `recurringChargeDayOfMonth` is present:

- OCS moves to the next monthly cycle.
- OCS attempts to use the configured calendar day.
- If that day does not exist in the target month, OCS uses that month’s
  last day.

This rule applies both to:

- next due date tracking in product recurring payments
- allowance bucket expiration created by recurring prices or recurring
  alterations

## February and leap years

Example for `recurringChargeDayOfMonth = 30`:

- January -> February in a non-leap year: renew on February 28
- January -> February in a leap year: renew on February 29
- March -> April: renew on April 30
- July -> August: renew on August 30

Important:

- OCS does not move day `30` to day `31` in 31-day months
- OCS only clamps downward when the configured day does not exist

## Web UI behavior

In `priv/www-next`, the recurring period selector is unchanged.

When the user selects:

- `Price type = Recurring`
- `Recurring period = monthly`

the UI now shows:

- `Renewal day of month`

UI rules:

- the field is shown only for monthly recurring entries
- the field is cleared automatically when period changes away from
  `monthly`
- the field is sent to the API only when it is valid

In listing and detail views, monthly fixed-day entries are rendered as:

- `monthly (day 30)`

## Backward compatibility

This implementation is backward compatible.

- Existing offers that only use `recurringChargePeriod = "monthly"`
  keep legacy behavior.
- Existing API clients do not need to send the new field.
- Existing UI records without the field still load and save correctly.

## Implementation notes

Main backend changes:

- `include/ocs.hrl`
- `src/ocs.erl`
- `src/ocs_rest_res_product.erl`

Main frontend changes:

- `priv/www-next/src/types/tmf.ts`
- `priv/www-next/src/services/offeringMapper.ts`
- `priv/www-next/src/components/PriceFormDialog.vue`
- `priv/www-next/src/components/AlterationFormDialog.vue`
- `priv/www-next/src/components/OfferingFormDialog.vue`
- `priv/www-next/src/views/OfferingDetailView.vue`

## Tests

Coverage added for:

- frontend mapper serialization/parsing of
  `recurringChargeDayOfMonth`
- backend charging behavior for fixed-day monthly allowance creation
- backend recurring date calculation for February and leap-year cases

The implementation plan that preceded the code changes is documented in:

- `doc/monthly-renewal-day-plan.md`
