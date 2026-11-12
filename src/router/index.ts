import { createRouter, createWebHistory } from 'vue-router'

// The persistent application shell preserves pending authentication and request drafts.
const application = () => import('../App.vue')

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: application },
    { path: '/profissionais', name: 'profissionais', component: application },
    { path: '/:pathMatch(.*)*', name: 'legacy', component: application },
  ],
})
