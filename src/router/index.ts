import { createRouter, createWebHistory } from 'vue-router'

/**
 * Router registered in parallel with the legacy App.vue viewMode navigation.
 * The App is still mounted directly by main.ts: no RouterView is rendered yet.
 * This avoids remounting the request/login flows during the first migration phase.
 */
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('./LegacyRouteOutlet.vue') },
    { path: '/profissionais', name: 'profissionais', component: () => import('./LegacyRouteOutlet.vue') },
    { path: '/:pathMatch(.*)*', name: 'legacy', component: () => import('./LegacyRouteOutlet.vue') },
  ],
})
