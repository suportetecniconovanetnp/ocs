<script setup lang="ts">
defineProps<{ title: string; description?: string; legacyFile?: string }>();
</script>

<template>
  <div>
    <h1 class="text-h5 font-weight-medium mb-4">
      {{ title }}
    </h1>
    <v-card>
      <v-card-text class="d-flex flex-column align-center pa-8 text-center">
        <v-icon
          icon="mdi-tools"
          size="64"
          color="warning"
        />
        <p class="text-h6 mt-4">
          Migration in progress
        </p>
        <p
          class="text-body-2 text-medium-emphasis mt-2"
          style="max-width: 540px"
        >
          This screen has not yet been migrated from the legacy Polymer UI. Use the existing
          interface at <code>/legacy/index.html</code> for now.
        </p>
        <p
          v-if="description"
          class="text-caption text-medium-emphasis mt-3"
        >
          {{ description }}
        </p>
        <p
          v-if="legacyFile"
          class="text-caption text-medium-emphasis mt-1"
        >
          Legacy source: <code>{{ legacyFile }}</code>
        </p>
      </v-card-text>
    </v-card>
  </div>
</template>
