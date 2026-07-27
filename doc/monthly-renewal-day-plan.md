# Monthly Fixed Renewal Day Plan

## Goal

Add support for recurring monthly charges that always target a fixed day of month, such as day 28 or day 30, without changing the current behavior of existing `recurringChargePeriod: "monthly"` entries.

## Business Rule

- Current behavior remains the default when no new monthly scheduling fields are provided.
- Fixed-day monthly behavior is activated only when the new day-of-month field is present.
- Example:
  - Day `28`: always renew on the 28th of each month.
  - Day `30`: renew on the 30th when that date exists.
  - Short months: if the configured day does not exist, renew on the last day of that month.
- February handling for day `30`:
  - Non-leap years: renew on February 28.
  - Leap years: renew on February 29.

## Proposed API Shape

Keep the existing field:

```json
{
  "priceType": "recurring",
  "recurringChargePeriod": "monthly"
}
```

Add an optional field for fixed-day monthly scheduling:

```json
{
  "priceType": "recurring",
  "recurringChargePeriod": "monthly",
  "recurringChargeDayOfMonth": 30
}
```

Rules:

- `recurringChargeDayOfMonth` is optional.
- It is valid only when `recurringChargePeriod` is `"monthly"`.
- Allowed range should be `1..31`.
- When the configured day does not exist in a month, the backend clamps to that month’s last day.

## Backend Plan

### 1. Extend REST codec

Files:

- `src/ocs_rest_res_product.erl`

Changes:

- Parse `recurringChargeDayOfMonth` into the internal price/alteration record.
- Serialize the same field back out on reads.
- Keep legacy payloads valid when the field is absent.

### 2. Extend internal validation

Files:

- `src/ocs.erl`

Changes:

- Accept monthly recurring prices and alterations with no day-of-month override.
- Accept `recurringChargeDayOfMonth` only for `monthly`.
- Validate the field as integer `1..31`.
- Reject the field for `hourly`, `daily`, `weekly`, and `yearly`.

### 3. Extend recurrence calculation

Files:

- `src/ocs.erl`

Changes:

- Preserve the current `end_period(..., monthly)` path for legacy offers.
- Add a fixed-day monthly calculation path when `recurringChargeDayOfMonth` is present.
- Fixed-day logic:
  - If the configured day has not passed yet in the current month, renew in the current month.
  - Otherwise, renew in the next month.
  - If that day does not exist, use the last day of the selected month.
- Ensure this logic is used in both direct recurring charging and overdue recurring charge catch-up flows.

### 4. Data model review

Files to inspect during implementation:

- `include/*.hrl`
- Any record definitions used for `#price{}` and `#alteration{}`

Changes:

- Add a field for monthly fixed renewal day if it does not already exist in a reusable extension point.
- Confirm all encode/decode and persistence paths carry the new field correctly.

## Web UI Plan

Files:

- `priv/www-next/src/components/PriceFormDialog.vue`
- `priv/www-next/src/components/AlterationFormDialog.vue`
- `priv/www-next/src/services/offeringMapper.ts`
- `priv/www-next/src/types/tmf.ts`

Changes:

- Keep `Recurring period` options unchanged.
- When the user selects `monthly`, show an extra field:
  - `Renewal day of month`
- Hide and clear that field for non-monthly periods.
- Send `recurringChargeDayOfMonth` only when:
  - `priceType` is `recurring`
  - `recurringChargePeriod` is `monthly`
  - a valid day was entered
- Show the configured fixed day in list/detail views where period data is already displayed.

## UX Proposal

For prices and alterations:

- `Recurring period`: `monthly`
- `Renewal day of month`: `30`

Behavior notes in helper text:

- “If the chosen day does not exist in a month, billing runs on the last day of that month.”

## Compatibility

- Existing offers with only `recurringChargePeriod: "monthly"` keep their current renewal behavior.
- Existing API clients are unaffected because the new field is optional.
- The UI should not require the new field for existing records.

## Testing Plan

### Backend

Add or update tests for:

- Legacy monthly recurrence with no fixed day.
- Fixed day `28`.
- Fixed day `30`.
- Fixed day `31`.
- February in non-leap year.
- February in leap year.
- Validation failures:
  - day `0`
  - day `32`
  - day-of-month sent with non-monthly periods

### Frontend

Add or update tests for:

- Field appears only when `monthly` is selected.
- Field is cleared when period changes away from `monthly`.
- Mapper includes `recurringChargeDayOfMonth` only for valid monthly recurring entries.
- Existing monthly entries without the field still load and save cleanly.

## Implementation Order

1. Extend the internal data model and REST codec.
2. Add backend validation.
3. Implement fixed-day monthly recurrence calculation.
4. Add/update backend tests.
5. Add the Web UI field and mapper support.
6. Add/update frontend tests.
7. Verify legacy monthly behavior is unchanged.

## Implementation Result

The implementation extended `#price{}` and `#alteration{}` directly to carry
the fixed monthly renewal day.
