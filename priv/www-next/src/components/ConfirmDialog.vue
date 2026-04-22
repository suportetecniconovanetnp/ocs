<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  color?: string;
}

withDefaults(defineProps<Props>(), {
  title: 'Confirm',
  message: 'Are you sure?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  color: 'error',
});

const open = ref(false);
let resolver: ((value: boolean) => void) | null = null;

function ask(): Promise<boolean> {
  open.value = true;
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

function close(value: boolean) {
  open.value = false;
  resolver?.(value);
  resolver = null;
}

defineExpose({ ask });
</script>

<template>
  <v-dialog v-model="open" max-width="420" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-alert-circle-outline" :color="color" class="mr-2" />
        {{ title }}
      </v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close(false)">{{ cancelText }}</v-btn>
        <v-btn :color="color" variant="flat" @click="close(true)">{{ confirmText }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
