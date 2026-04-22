<script setup lang="ts"></script>

<template>
  <v-container class="d-flex flex-column align-center justify-center" style="min-height: 70vh">
    <v-icon icon="mdi-alert-circle-outline" size="96" color="warning" />
    <h1 class="text-h4 mt-4">404</h1>
    <p class="text-body-1 text-medium-emphasis">Page not found.</p>
    <v-btn to="/" color="primary" class="mt-4">Go to dashboard</v-btn>
  </v-container>
</template>
