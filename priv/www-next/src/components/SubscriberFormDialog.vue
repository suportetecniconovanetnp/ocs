<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { subscribersApi, catalogApi, productsApi, balanceApi } from '@/services';
import {
  buildServicePayload,
  buildProductPayload,
  buildCreditQuantity,
  buildCreditValidFor,
  emptySubscriberForm,
  parseSubscriber,
  LIFECYCLE_STATES,
  type SubscriberForm,
} from '@/services/subscriberMapper';

// Keep LIFECYCLE_STATES imported — the template derives lifecycleLabels
// from it in the <script setup> block.
import { useNotificationsStore } from '@/stores/notifications';
import { useAsyncResource } from '@/composables/useAsyncResource';
import type { Service, ProductOffering, Product } from '@/types/tmf';

interface Props {
  subscriber?: Service | null;
}

const props = withDefaults(defineProps<Props>(), { subscriber: null });
const emit = defineEmits<{ saved: [Service] }>();

const open = ref(false);
const saving = ref(false);
const tab = ref<'product' | 'auth' | 'authz' | 'credit'>('product');
const showAkaPassword = ref(false);
const showPassword = ref(false);
const form = ref<SubscriberForm>(emptySubscriberForm());
const notifications = useNotificationsStore();

const isEdit = computed(() => Boolean(props.subscriber));

// Lazy-load the catalog when the dialog first opens so the Product Offering
// dropdown is populated without blocking the subscriber list.
const offerings = useAsyncResource<ProductOffering[]>(
  async () => {
    const list = await catalogApi.listOfferings(0, 99);
    return list.items;
  },
  false,
);

const offeringItems = computed(() => [
  { title: '— None (use existing product ID) —', value: '' },
  ...(offerings.data.value ?? []).map((o) => ({ title: o.name, value: o.id })),
]);

const offeringHint = computed(() => {
  if (offerings.loading.value) return 'Loading offerings…';
  if (form.value.product.existingProductId) {
    return 'Disabled because an existing product is picked below';
  }
  if (offerings.error.value) {
    return 'Offering catalog unavailable. Type the product offering ID manually.';
  }
  return 'Pick an offering or type its ID. On save, a new product is created for this subscriber.';
});

// Lazy-loaded product inventory for the edit-mode "Change product" dropdown.
// Same wide-page strategy as ProductsView — the Vaadin `id.like` filter
// crashes on hyphens, so we fetch a generous page and filter client-side.
const PRODUCTS_FETCH_SIZE = 500;
const products = useAsyncResource<Product[]>(
  async () => {
    const list = await productsApi.list(0, PRODUCTS_FETCH_SIZE - 1);
    return list.items;
  },
  false,
);

/**
 * Opt-in flag for listing products that are already bound to other
 * subscribers (shared/family-plan configuration). Hidden behind a toggle
 * because it isn't the common path — the Polymer UI explicitly said
 * "A Service may be associated with at most one Product instance"
 * (sig-product-add.js:111). The backend's rating engine handles it
 * correctly (bucket sticky_write locks serialise concurrent debits —
 * ocs_rating.erl:188), but throughput degrades under heavy load due to
 * product-record deadlock retries, and there is no SigScale test coverage
 * for this topology, so we don't surface it by default.
 */
const showSharedProducts = ref(false);

const productDropdownItems = computed(() => {
  const currentId = form.value.product.currentProductId;
  const myId = props.subscriber?.id ?? '';
  return (products.data.value ?? [])
    .filter((p) => {
      if (showSharedProducts.value) return true;
      // Default filter: product is free, OR it's this subscriber's own.
      const realizing = (p.realizingService ?? []).map((s) => s.id);
      if (realizing.length === 0) return true;
      if (p.id === currentId) return true;
      return realizing.includes(myId);
    })
    .map((p) => {
      const realizing = (p.realizingService ?? []).map((s) => s.id);
      let tag: string;
      if (p.id === currentId) tag = 'currently linked to this subscriber';
      else if (realizing.length === 0) tag = 'free';
      else if (realizing.includes(myId)) tag = 'current';
      else tag = `shared with ${realizing.join(', ')}`;
      const offering = p.productOffering?.name ?? p.productOffering?.id ?? '—';
      // Deliberately no `disabled` — Vuetify 3's autocomplete can be cranky
      // about per-item disabled state depending on density/variant. The
      // save logic already skips no-op swaps.
      return {
        title: `${p.id}  ·  ${offering}  ·  ${tag}`,
        value: p.id,
      };
    });
});

/**
 * How many products are hidden by the default filter. Used to advertise
 * the opt-in toggle when the user might want to know there's more.
 */
const hiddenProductCount = computed(() => {
  if (showSharedProducts.value) return 0;
  const currentId = form.value.product.currentProductId;
  const myId = props.subscriber?.id ?? '';
  return (products.data.value ?? []).filter((p) => {
    const realizing = (p.realizingService ?? []).map((s) => s.id);
    if (realizing.length === 0) return false;
    if (p.id === currentId) return false;
    return !realizing.includes(myId);
  }).length;
});

// The product currently selected in the "Change product" dropdown — used
// to render the "Realizing services" preview card.
const selectedProduct = computed<Product | undefined>(() => {
  const id = form.value.product.existingProductId;
  if (!id) return undefined;
  return products.data.value?.find((p) => p.id === id);
});

// When the picked product is already bound to other subscribers, the
// save will produce a "shared plan" configuration: multiple services
// drawing from the same bucket pool. This is a legitimate operational
// pattern (family plans) rather than a bug — bucket debits are atomic
// via sticky_write locks (ocs_rating.erl:188), each service has its own
// Diameter session state, and reservations are keyed by {SessionId,
// service_id, charging_key} so concurrent sessions don't stomp each
// other. The info message below surfaces this fact so the operator
// knows what they're signing up for; no alarmist warning.
const sharePlanInfo = computed(() => {
  const p = selectedProduct.value;
  if (!p) return '';
  const me = props.subscriber?.id;
  const others = (p.realizingService ?? []).map((s) => s.id).filter((id) => id !== me);
  if (others.length === 0) return '';
  const label = others.length === 1 ? 'subscriber' : 'subscribers';
  return `This product is already linked to ${label} [${others.join(', ')}]. Saving will share the product's buckets between all ${others.length + 1} subscribers — consumption is debited from the same pool (family/shared-plan behaviour). Each subscriber still has its own authentication and Diameter sessions; only the balance is shared.`;
});

/**
 * Show the shared "pick an existing product" block.
 *   - Create mode: always, so the user can browse even before toggling.
 *     (Becomes effectively disabled when an offering is picked — see
 *     the cross-disable logic on the offering dropdown below.)
 *   - Edit mode: only when the user flips the "Change product" switch.
 */
const showAttachBlock = computed(() => !isEdit.value || form.value.product.switchProduct);

// Cross-exclusion: picking an offering in create mode means "create a
// brand new product" and the attach dropdown becomes a no-op. We keep
// existingProductId reactively cleared to prevent a stale selection
// from silently leaking through to the save call.
watch(
  () => form.value.product.offeringId,
  (offering) => {
    if (offering && form.value.product.existingProductId && !isEdit.value) {
      form.value.product.existingProductId = '';
    }
  },
);
watch(
  () => form.value.product.existingProductId,
  (existing) => {
    if (existing && form.value.product.offeringId && !isEdit.value) {
      form.value.product.offeringId = '';
    }
  },
);

// Whether the old product is a candidate for auto-deletion after swap.
// True when: we're swapping to a different product AND the old product
// had no other realizingService beyond this subscriber.
const oldProductWouldOrphan = computed(() => {
  if (!isEdit.value || !form.value.product.switchProduct) return false;
  const oldId = form.value.product.currentProductId;
  const newId = form.value.product.existingProductId;
  if (!oldId || oldId === newId) return false;
  const old = products.data.value?.find((p) => p.id === oldId);
  if (!old) return false;
  const others = (old.realizingService ?? [])
    .map((s) => s.id)
    .filter((id) => id !== props.subscriber?.id);
  return others.length === 0;
});

// Widen the readonly LIFECYCLE_STATES to string[] for the v-select items.
const lifecycleLabels = computed<string[]>(() => LIFECYCLE_STATES.map((l) => l.label));

watch(
  () => props.subscriber,
  (next) => {
    form.value = next ? parseSubscriber(next) : emptySubscriberForm();
  },
  { immediate: true },
);

function show() {
  form.value = props.subscriber ? parseSubscriber(props.subscriber) : emptySubscriberForm();
  tab.value = 'product';
  open.value = true;
  // Shared-plan view is opt-in per dialog session.
  showSharedProducts.value = false;
  if (!offerings.data.value) void offerings.reload();
  // Fetch product inventory on every open — used by the "pick an existing
  // product" dropdown in both create and edit modes. Kicked off here (not
  // lazily on toggle) so the dropdown never renders empty while the XHR
  // is still in flight.
  if (!products.data.value) void products.reload();
}

function validate(): string | null {
  if (!isEdit.value) {
    const hasOffering = !!form.value.product.offeringId;
    const hasExistingProduct = !!form.value.product.existingProductId;
    if (!hasOffering && !hasExistingProduct) {
      tab.value = 'product';
      return 'Pick a product offering or enter an existing product ID.';
    }
    if (!form.value.auth.generateIdentity && !form.value.auth.identity) {
      tab.value = 'auth';
      return 'Identity is required (or tick "Generate").';
    }
  }
  return null;
}


async function save() {
  const err = validate();
  if (err) {
    notifications.warning(err);
    return;
  }
  saving.value = true;
  try {
    let result: Service;

    if (isEdit.value) {
      // --- Update path: three independent steps (merge-patch for
      // characteristics → JSON-patch for product swap → balance adjustment).
      // Each is wrapped so a partial-success scenario still leaves the user
      // with a precise message.
      const payload = buildServicePayload(form.value, 'update');
      try {
        result = await subscribersApi.update(props.subscriber!.id, payload);
      } catch {
        notifications.error('Failed to update the subscriber.');
        return;
      }

      // Product swap (JSON-Patch, atomic on both sides — backend at
      // ocs_rest_res_service.erl:237-277). Only fires when the user
      // explicitly toggled "Change product" AND picked a different target.
      const oldProductId = form.value.product.currentProductId;
      const newProductId = form.value.product.existingProductId.trim();
      let swapped = false;
      let effectiveProductId = oldProductId;
      if (
        form.value.product.switchProduct &&
        newProductId &&
        newProductId !== oldProductId
      ) {
        try {
          await subscribersApi.patchProduct(props.subscriber!.id, newProductId);
          swapped = true;
          effectiveProductId = newProductId;
          notifications.success(
            oldProductId
              ? `Product swapped: ${oldProductId} → ${newProductId}.`
              : `Attached product ${newProductId}.`,
          );
        } catch {
          notifications.warning(
            `Subscriber updated, but swapping product to "${newProductId}" failed.`,
          );
        }

        // Post-swap cleanup: when the old product is now empty of services
        // (1:1 orphan), offer to delete it. The PATCH already removed
        // this service from its realizingService list atomically, so we
        // re-read to confirm before destroying it.
        if (swapped && form.value.product.deleteOrphanIfEmpty && oldProductId) {
          try {
            const old = await productsApi.get(oldProductId);
            const remaining = (old.realizingService ?? []).length;
            if (remaining === 0) {
              await productsApi.delete(oldProductId);
              notifications.info(
                `Old product ${oldProductId} had no subscribers left and was deleted.`,
              );
            }
          } catch {
            notifications.warning(
              `Could not verify/cleanup old product ${oldProductId}. Delete it manually from the Products view if needed.`,
            );
          }
        }
      }

      const quantity = buildCreditQuantity(form.value.credit.amount, form.value.credit.units);
      if (form.value.credit.amount && !quantity) {
        notifications.warning(
          `Subscriber updated, but could not parse credit amount "${form.value.credit.amount}".`,
        );
      } else if (form.value.credit.amount && !effectiveProductId) {
        notifications.warning(
          'Subscriber updated, but credit was skipped: no product associated. Top up from the Buckets view after attaching a product.',
        );
      } else if (quantity && effectiveProductId) {
        try {
          await balanceApi.adjustment(effectiveProductId, quantity, buildCreditValidFor(form.value.credit));
          notifications.success(`Applied ${form.value.credit.amount} ${form.value.credit.units}.`);
        } catch {
          notifications.warning(
            `Subscriber updated, but applying credit failed. Try again from the Top-up button.`,
          );
        }
      }
    } else {
      // --- Create path: 3 sequential POSTs matching legacy sig-sub-add.
      // Each step is wrapped individually so a partial-success scenario
      // (e.g. service created, but balance topup failed) shows a precise
      // toast and the dialog stays open for the user to retry the failed step.
      if (!form.value.auth.generateIdentity && form.value.auth.identity) {
        const exists = await subscribersApi.exists(form.value.auth.identity);
        if (exists === true) {
          tab.value = 'auth';
          notifications.error(
            `Subscriber "${form.value.auth.identity}" already exists. Pick a different identity or edit the existing one.`,
          );
          return;
        }
        if (exists === null) {
          notifications.error(
            'Could not verify whether the identity is available. Aborting to avoid overwriting an existing subscriber.',
          );
          return;
        }
      }

      // 1. Service
      try {
        result = await subscribersApi.create(buildServicePayload(form.value, 'create'));
      } catch {
        notifications.error('Failed to create the subscriber service. Nothing was saved.');
        return;
      }

      // 2. Product (skip if the service is already bound to one)
      let productId = form.value.product.existingProductId || result.product || result.productId;
      if (!productId && form.value.product.offeringId) {
        try {
          const created = await productsApi.create(
            buildProductPayload(form.value.product.offeringId, result.id),
          );
          productId = created.id;
        } catch {
          notifications.error(
            `Subscriber "${result.id}" was created but the product offering could not be attached. Add it manually from the Catalog view.`,
          );
          emit('saved', result);
          open.value = false;
          return;
        }
      }

      // 3. Balance adjustment
      const quantity = buildCreditQuantity(form.value.credit.amount, form.value.credit.units);
      if (import.meta.env.DEV) {
        console.info('[ocs-subscriber] credit step:', {
          rawAmount: form.value.credit.amount,
          units: form.value.credit.units,
          quantity,
          productId,
          serviceId: result.id,
        });
      }
      if (form.value.credit.amount && !quantity) {
        notifications.warning(
          `Could not parse credit amount "${form.value.credit.amount}" — subscriber created but no credit applied.`,
        );
      } else if (form.value.credit.amount && !productId) {
        notifications.warning(
          'Subscriber created but credit was skipped: no product was associated. Add a balance later from the Buckets view.',
        );
      } else if (quantity && productId) {
        try {
          await balanceApi.adjustment(productId, quantity, buildCreditValidFor(form.value.credit));
        } catch {
          notifications.warning(
            `Subscriber "${result.id}" and product "${productId}" created, but applying the initial credit failed. Add it manually from the Buckets view.`,
          );
          emit('saved', result);
          open.value = false;
          return;
        }
      }
    }

    notifications.success(isEdit.value ? 'Subscriber updated.' : 'Subscriber created.');
    emit('saved', result);
    open.value = false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="760" persistent scrollable>
    <v-card>
      <v-card-title>
        {{ isEdit ? `Edit subscriber — ${subscriber?.id}` : 'Add subscriber' }}
      </v-card-title>

      <v-tabs v-model="tab" color="primary">
        <v-tab value="product">Product</v-tab>
        <v-tab value="auth">Authentication</v-tab>
        <v-tab value="authz">Authorization</v-tab>
        <v-tab value="credit">Credit</v-tab>
      </v-tabs>

      <v-card-text style="max-height: 75vh">
        <v-tabs-window v-model="tab">
          <!-- ================= PRODUCT ================= -->
          <v-tabs-window-item value="product">
            <!-- ---- EDIT ONLY: current product banner + swap toggle ---- -->
            <template v-if="isEdit">
              <v-alert
                :type="form.product.currentProductId ? 'info' : 'warning'"
                variant="tonal"
                density="compact"
                class="mb-3"
              >
                <div class="d-flex align-center ga-2 flex-wrap">
                  <span class="text-caption">Currently linked to product:</span>
                  <code v-if="form.product.currentProductId">
                    {{ form.product.currentProductId }}
                  </code>
                  <span v-else class="text-caption">— none —</span>
                </div>
              </v-alert>
              <v-switch
                v-model="form.product.switchProduct"
                color="primary"
                density="compact"
                hide-details
                label="Change product"
                class="mb-3"
              />
            </template>

            <!-- ---- CREATE ONLY: create a new product from an offering ---- -->
            <template v-if="!isEdit">
              <v-combobox
                v-model="form.product.offeringId"
                :items="offeringItems"
                item-title="title"
                item-value="value"
                label="Create new product from offering"
                :loading="offerings.loading.value"
                :disabled="!!form.product.existingProductId"
                :hint="offeringHint"
                no-data-text="No offerings loaded. Type an offering ID manually."
                clearable
                persistent-hint
                class="mb-3"
              />
              <div class="d-flex align-center mb-3">
                <v-divider />
                <span class="mx-3 text-caption text-medium-emphasis">OR</span>
                <v-divider />
              </div>
            </template>

            <!-- ---- SHARED: pick an existing product (browse inventory) ---- -->
            <template v-if="showAttachBlock">
              <v-autocomplete
                v-model="form.product.existingProductId"
                :items="productDropdownItems"
                :loading="products.loading.value"
                :label="isEdit ? 'Pick an existing product' : 'Attach an existing product'"
                :disabled="!isEdit && !!form.product.offeringId"
                :hint="
                  products.loading.value
                    ? 'Loading product inventory…'
                    : !isEdit && form.product.offeringId
                      ? 'Disabled because an offering is picked above'
                      : `${productDropdownItems.length} available. Tag after the ID shows realizingService status (free / current).`
                "
                persistent-hint
                clearable
                class="mb-3"
              />

              <!-- Opt-in to see products already bound to another subscriber
                   ("shared plan" / family-plan configuration). Kept deliberately
                   low-key: only surfaces when there are candidates to reveal. -->
              <v-checkbox
                v-if="hiddenProductCount > 0 || showSharedProducts"
                v-model="showSharedProducts"
                color="primary"
                density="compact"
                hide-details
                :label="`Include products already assigned to other subscribers (${hiddenProductCount} hidden)`"
                class="mb-3"
              />

              <v-card
                v-if="selectedProduct"
                variant="tonal"
                class="mb-3"
                density="compact"
              >
                <v-card-subtitle class="pt-3">
                  Realizing services on <code>{{ selectedProduct.id }}</code>
                </v-card-subtitle>
                <v-card-text>
                  <div
                    v-if="(selectedProduct.realizingService ?? []).length"
                    class="d-flex flex-wrap ga-1"
                  >
                    <v-chip
                      v-for="s in selectedProduct.realizingService"
                      :key="s.id"
                      size="small"
                      :color="s.id === subscriber?.id ? 'success' : 'default'"
                      variant="tonal"
                    >
                      {{ s.id }}{{ s.id === subscriber?.id ? '  (this subscriber)' : '' }}
                    </v-chip>
                  </div>
                  <span v-else class="text-medium-emphasis text-caption">
                    None — this product will start fresh.
                  </span>
                </v-card-text>
              </v-card>

              <v-alert
                v-if="sharePlanInfo"
                type="info"
                variant="tonal"
                density="compact"
                class="mb-3"
              >
                {{ sharePlanInfo }}
              </v-alert>

              <v-checkbox
                v-if="isEdit"
                v-model="form.product.deleteOrphanIfEmpty"
                color="primary"
                density="compact"
                hide-details
                :label="
                  oldProductWouldOrphan
                    ? `Delete the old product (${form.product.currentProductId}) — it will be orphaned after the swap`
                    : 'Delete old product if no subscriber remains on it after the swap'
                "
              />
              <div
                v-if="isEdit"
                class="text-caption text-medium-emphasis mt-1 mb-3"
              >
                Buckets attached to an orphaned product are useless — the cleanup
                mirrors what legacy operators had to do manually from the Buckets view.
              </div>
            </template>

            <v-divider class="mb-3" />

            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.product.startDate"
                label="Start date"
                type="datetime-local"
              />
              <v-text-field
                v-model="form.product.endDate"
                label="End date"
                type="datetime-local"
              />
            </div>

            <v-select
              v-model="form.product.lifecycleLabel"
              :items="lifecycleLabels"
              label="Lifecycle status"
            />
          </v-tabs-window-item>

          <!-- ================= AUTHENTICATION ================= -->
          <v-tabs-window-item value="auth">
            <v-text-field
              v-model="form.auth.identity"
              label="Identity"
              :disabled="form.auth.generateIdentity || isEdit"
              autofocus
              class="mb-1"
            />
            <v-checkbox
              v-if="!isEdit"
              v-model="form.auth.generateIdentity"
              label="Generate identity on the server"
              density="compact"
              hide-details
              class="mb-3"
            />

            <v-text-field
              v-model="form.auth.password"
              label="Password"
              :type="showPassword ? 'text' : 'password'"
              :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
              :disabled="form.auth.generatePassword"
              class="mb-1"
              @click:append-inner="showPassword = !showPassword"
            />
            <v-checkbox
              v-if="!isEdit"
              v-model="form.auth.generatePassword"
              label="Generate password on the server"
              density="compact"
              hide-details
              class="mb-3"
            />

            <v-divider class="mb-3" />
            <div class="text-overline mb-2">AKA (LTE/EPS authentication, optional)</div>
            <v-text-field
              v-model="form.auth.akaK"
              label="AKA K"
              :type="showAkaPassword ? 'text' : 'password'"
              :append-inner-icon="showAkaPassword ? 'mdi-eye-off' : 'mdi-eye'"
              maxlength="32"
              hint="32 hex characters"
              persistent-hint
              :rules="[
                (v) => !v || /^[0-9a-fA-F]{32}$/.test(v) || 'Must be 32 hex characters',
              ]"
              class="mb-3"
              @click:append-inner="showAkaPassword = !showAkaPassword"
            />
            <v-text-field
              v-model="form.auth.akaOpc"
              label="AKA OPc"
              :type="showAkaPassword ? 'text' : 'password'"
              maxlength="32"
              hint="32 hex characters"
              persistent-hint
              :rules="[
                (v) => !v || /^[0-9a-fA-F]{32}$/.test(v) || 'Must be 32 hex characters',
              ]"
            />
          </v-tabs-window-item>

          <!-- ================= AUTHORIZATION ================= -->
          <v-tabs-window-item value="authz">
            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.authz.sessionInterval"
                label="Session interval"
                placeholder="e.g. 30m, 2h, 1d"
                hint="Suffix s/m/h/d (default seconds). Sent as acctSessionInterval."
                persistent-hint
              />
              <v-text-field
                v-model="form.authz.sessionTimeout"
                label="Session timeout"
                placeholder="e.g. 1h"
                hint="Suffix s/m/h/d (default seconds). Sent as sessionTimeout."
                persistent-hint
              />
            </div>
            <v-text-field
              v-model="form.authz.className"
              label="Class"
              hint="Free-form RADIUS Class AVP"
              persistent-hint
              class="mb-3"
            />
            <v-switch
              v-model="form.authz.enabled"
              color="primary"
              label="Service enabled"
              density="compact"
              hide-details
              class="mb-2"
            />
            <v-switch
              v-model="form.authz.multisession"
              color="primary"
              label="Allow multi-session"
              density="compact"
              hide-details
            />
          </v-tabs-window-item>

          <!-- ================= CREDIT ================= -->
          <v-tabs-window-item value="credit">
            <p class="text-caption text-medium-emphasis mb-3">
              Initial balance to apply after the subscriber is created. Leave empty to skip.
              Always applied to the product assigned in the "Product" tab.
            </p>
            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.credit.amount"
                label="Amount"
                placeholder="e.g. 500, 1g, 30s"
                hint="Suffix k/m/g for octets, m/h/d for seconds. Cents is a plain number."
                persistent-hint
              />
              <v-select
                v-model="form.credit.units"
                :items="[
                  { title: 'Cents', value: 'cents' },
                  { title: 'Octets (bytes)', value: 'octets' },
                  { title: 'Seconds', value: 'seconds' },
                ]"
                label="Units"
              />
            </div>

            <v-divider class="mb-3" />
            <div class="text-subtitle-2 mb-1">Bucket validity (optional)</div>
            <div class="text-caption text-medium-emphasis mb-3">
              Limits how long this credit is honoured. Leave both empty for an
              unlimited bucket — that is the legacy default.
            </div>
            <div class="d-flex ga-3">
              <v-text-field
                v-model="form.credit.validFrom"
                type="datetime-local"
                label="Valid from"
                hint="Blank = starts immediately."
                persistent-hint
                clearable
              />
              <v-text-field
                v-model="form.credit.validTo"
                type="datetime-local"
                label="Valid to"
                hint="Blank = never expires."
                persistent-hint
                clearable
              />
            </div>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">
          {{ isEdit ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
