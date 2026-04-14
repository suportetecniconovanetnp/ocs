# Session Reserve Policy

This document describes how OCS chooses the reservation returned to
DIAMETER Ro/Gy session requests.

## Current behavior

For `Requested-Service-Unit` explicitly sent by the peer:

- With `explicit_reserve_policy = requested`, OCS uses the requested amount
  as the base reservation.
- With `explicit_reserve_policy = fixed`, OCS ignores the peer request and
  uses `explicit_reserve_*` as the base reservation.
- OCS limits the reservation by available subscriber balance.
- In `requested` mode, OCS can optionally cap the reservation with
  `max_reserve_*`.
- In `fixed` mode, `explicit_reserve_*` is the policy value and
  `max_reserve_*` should normally stay `undefined` to avoid overlapping
  policies.

For centralized unit determination, when the peer does not send an
explicit reservation:

- OCS uses `min_reserve_octets`
- OCS uses `min_reserve_seconds`
- OCS uses `min_reserve_messages`

These values define the default reservation size OCS will try to grant.

## Configuration keys

- `min_reserve_octets`: default octet reservation when the peer does not
  send `Requested-Service-Unit`.
- `min_reserve_seconds`: default time reservation when the peer does not
  send `Requested-Service-Unit`.
- `min_reserve_messages`: default service-specific unit reservation when
  the peer does not send `Requested-Service-Unit`.
- `max_reserve_octets`: maximum octet reservation returned in a single
  grant, including explicit peer requests.
- `max_reserve_seconds`: maximum time reservation returned in a single
  grant, including explicit peer requests.
- `max_reserve_messages`: maximum service-specific unit reservation
  returned in a single grant, including explicit peer requests.
- `explicit_reserve_policy`: policy for explicit peer reservation requests.
  Supported values are `requested` and `fixed`.
- `explicit_reserve_octets`: fixed octet grant when
  `explicit_reserve_policy = fixed`.
- `explicit_reserve_seconds`: fixed time grant when
  `explicit_reserve_policy = fixed`.
- `explicit_reserve_messages`: fixed service-specific unit grant when
  `explicit_reserve_policy = fixed`.
- `session_debug_logs`: enables detailed session trace logs in
  `docker logs`.

## Decision order

For octets, the current order is:

1. If explicit request exists and `explicit_reserve_policy = requested`,
   start with `Requested-Service-Unit`.
2. If explicit request exists and `explicit_reserve_policy = fixed`,
   start with `explicit_reserve_octets`.
3. If no explicit request exists, use `min_reserve_octets`.
4. If mode is `requested` and `max_reserve_octets` is configured, cap the
   reservation at that value.
5. If subscriber balance is lower than the computed reservation, grant only
   the available balance.
6. If available balance is zero, return credit limit reached.

The same logic applies to seconds and messages with their corresponding
configuration keys.

## Examples

Example 1: explicit peer request, no cap

- `Requested-Service-Unit = 1000000`
- `max_reserve_octets = undefined`
- available balance `= 800000`
- returned grant `= 800000`

Example 2: explicit peer request with cap

- `Requested-Service-Unit = 10000000`
- `explicit_reserve_policy = requested`
- `max_reserve_octets = 5000000`
- available balance `= 9000000`
- returned grant `= 5000000`

Example 3: explicit peer request ignored by fixed policy

- `Requested-Service-Unit = 1000000`
- `explicit_reserve_policy = fixed`
- `explicit_reserve_octets = 10000000`
- available balance `= 6000000`
- returned grant `= 6000000`

Example 4: centralized reservation

- peer does not send `Requested-Service-Unit`
- `min_reserve_octets = 10000000`
- available balance `= 12000000`
- returned grant `= 10000000`

## Important note

To avoid configuration overlap, use these combinations:

- `explicit_reserve_policy = requested`
  Use peer request as the base. Optionally use `max_reserve_*` as a cap.
- `explicit_reserve_policy = fixed`
  Ignore peer request and use `explicit_reserve_*` as the base.
  In this mode, `max_reserve_*` is usually unnecessary.
- `min_reserve_*`
  Only affects sessions where the peer does not send an explicit request.
