import { http, getList, rangeHeader, encodePath, type PagedResult } from './http';
import type { Characteristic, Resource } from '@/types/tmf';

/*
 * Tariff CRUD — mirrors the legacy Polymer components under
 * priv/www/src/sig-{rate,period,roaming}-table-* and
 * priv/www/src/sig-tariff-{rate,period,roaming}-*.
 *
 * Data model (from TMF resourceInventoryManagement v1):
 *
 *   TABLE (parent #resource, spec ids 1/5/7)
 *     ├── name           (e.g. "intl-rates")
 *     ├── description
 *     └── resourceSpecification.id = 1|5|7
 *
 *   ROW (child #resource, spec ids 2/6/8)
 *     ├── resourceSpecification.id = 2|6|8
 *     ├── resourceRelationship[]   (type "contained" → parent table)
 *     └── resourceCharacteristic[]
 *           ├── { name: "prefix", value: "44" }
 *           ├── { name: "description", value: "UK" }
 *           └── {...per-kind fields: rate / periodInitial+rateInitial+… / tariff }
 *
 * The row spec id determines the expected characteristic names. Callers
 * own that knowledge — this module only handles the CRUD plumbing.
 */

const BASE = '/resourceInventoryManagement/v1/resource';
const SPEC_HREF = (id: string) =>
  `/resourceCatalogManagement/v2/resourceSpecification/${id}`;
const REL_HREF = (id: string) =>
  `/resourceInventoryManagement/v1/resourceRelationship/${id}`;

/**
 * Vaadin-style filter expression for row characteristic prefixes.
 * Legacy component composes filters of shape
 *   `"[{resourceCharacteristic.prefix.like=[44%]}]"`
 * joining multiple clauses on `,]`.
 */
function buildRowFilter(prefix: string | undefined): string | undefined {
  if (!prefix) return undefined;
  return `"[{resourceCharacteristic.prefix.like=[${prefix}%]}]"`;
}

/** JSON-Patch op for the PATCH /resource/{id} row-update flow. */
export interface JsonPatchOp {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: unknown;
}

export interface TariffRowInput {
  /** Row characteristics — `prefix`, `description`, plus kind-specific fields. */
  characteristics: Characteristic[];
}

export interface TariffTableRef {
  id: string;
  name: string;
}

export const tariffsApi = {
  /**
   * List the tariff tables of a given kind (parent resources only).
   * The backend expects `resourceSpecification.id` filtering on the
   * table spec id (1 for rate, 5 for period, 7 for roaming).
   */
  listTables(
    tableSpecId: string,
    start = 0,
    end = 99,
  ): Promise<PagedResult<Resource>> {
    return getList<Resource>(BASE, {
      headers: rangeHeader(start, end),
      params: { 'resourceSpecification.id': tableSpecId },
    });
  },

  /**
   * Create a new tariff table. Legacy posts a minimal body containing
   * `name`, optional `description`, and the resourceSpecification ref.
   * The backend creates the underlying GTT behind the scenes — there's
   * nothing else to pre-populate.
   */
  createTable(
    tableSpecId: string,
    payload: { name: string; description?: string },
  ): Promise<Resource> {
    const body: Partial<Resource> = {
      name: payload.name,
      description: payload.description,
      resourceSpecification: {
        id: tableSpecId,
        href: SPEC_HREF(tableSpecId),
      },
    };
    return http.post<Resource>(BASE, body).then((r) => r.data);
  },

  deleteTable(id: string): Promise<void> {
    return http.delete(`${BASE}/${encodePath(id)}`).then(() => undefined);
  },

  /**
   * List rows of a given table. Requires both the row spec id
   * (2/6/8) and the parent table name (matched case-sensitive).
   * The optional `prefix` filter is server-side via the Vaadin
   * filter expression.
   */
  listRows(
    rowSpecId: string,
    tableName: string,
    {
      start = 0,
      end = 49,
      prefix,
    }: { start?: number; end?: number; prefix?: string } = {},
  ): Promise<PagedResult<Resource>> {
    const params: Record<string, string> = {
      'resourceSpecification.id': rowSpecId,
      'resourceRelationship.resource.name': tableName,
    };
    const filter = buildRowFilter(prefix);
    if (filter) params['filter'] = filter;
    return getList<Resource>(BASE, {
      headers: rangeHeader(start, end),
      params,
    });
  },

  /**
   * Add a new row to `table`. Builds the `resourceRelationship` that
   * ties the row to its parent and attaches the kind-specific
   * characteristics passed in by the caller.
   */
  createRow(
    rowSpecId: string,
    rowSpecName: string,
    table: TariffTableRef,
    input: TariffRowInput,
  ): Promise<Resource> {
    const body: Partial<Resource> = {
      resourceCharacteristic: input.characteristics,
      resourceRelationship: [
        {
          relationshipType: 'contained',
          resource: {
            id: table.id,
            href: REL_HREF(table.id),
            name: table.name,
          },
        },
      ],
      resourceSpecification: {
        id: rowSpecId,
        href: SPEC_HREF(rowSpecId),
        name: rowSpecName,
      },
    };
    return http.post<Resource>(`${BASE}/`, body).then((r) => r.data);
  },

  /**
   * PATCH an existing row with a JSON-Patch array. The legacy UI builds
   * per-characteristic operations (`replace` for existing values,
   * `add` with path `/resourceCharacteristic/-` for new ones) — the
   * caller decides the granularity and we just ship the array.
   */
  patchRow(id: string, ops: JsonPatchOp[]): Promise<Resource> {
    return http
      .patch<Resource>(`${BASE}/${encodePath(id)}`, ops, {
        headers: { 'Content-Type': 'application/json-patch+json' },
      })
      .then((r) => r.data);
  },

  deleteRow(id: string): Promise<void> {
    return http.delete(`${BASE}/${encodePath(id)}`).then(() => undefined);
  },
};

/* ------------------------------------------------------------------ *
 * Helpers for working with Characteristic arrays on a Resource
 * ------------------------------------------------------------------ */

/** Read a characteristic value by name as string, or undefined. */
export function charString(r: Resource, name: string): string | undefined {
  const c = r.resourceCharacteristic?.find((x) => x.name === name);
  if (!c || c.value == null) return undefined;
  return String(c.value);
}

/** Read a characteristic value as number, or undefined when unparseable. */
export function charNumber(r: Resource, name: string): number | undefined {
  const raw = charString(r, name);
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Build the JSON-Patch ops to migrate an existing row's characteristics
 * from `current` → `next`. Compares names: matches get a `replace` when
 * the value differs; new names get an `add` with path
 * `/resourceCharacteristic/-`; removed names get a `remove`.
 */
export function diffCharacteristics(
  current: Characteristic[] | undefined,
  next: Characteristic[],
): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  const existing = current ?? [];
  const byName = new Map(existing.map((c, i) => [c.name, { idx: i, value: c.value }]));
  const seen = new Set<string>();
  for (const c of next) {
    seen.add(c.name);
    const entry = byName.get(c.name);
    if (!entry) {
      ops.push({
        op: 'add',
        path: '/resourceCharacteristic/-',
        value: { name: c.name, value: c.value },
      });
    } else if (entry.value !== c.value) {
      ops.push({
        op: 'replace',
        path: `/resourceCharacteristic/${entry.idx}/value`,
        value: c.value,
      });
    }
  }
  // Remove ones that no longer appear. Iterate from high index to low so
  // the path indices remain valid as we splice.
  const toRemove: number[] = [];
  existing.forEach((c, i) => {
    if (!seen.has(c.name)) toRemove.push(i);
  });
  toRemove
    .sort((a, b) => b - a)
    .forEach((i) => ops.push({ op: 'remove', path: `/resourceCharacteristic/${i}` }));
  return ops;
}
