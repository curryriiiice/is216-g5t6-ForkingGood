import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "@/views/DashboardView.vue";

import MapView from '@/views/MapView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    { path: "/dashboard", component: DashboardView },
    { path: '/map', component: MapView },
  ],
});