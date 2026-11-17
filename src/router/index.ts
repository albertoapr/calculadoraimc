import { createRouter, createWebHistory } from 'vue-router'
import { screenRoutes } from './screens'

// A single persistent shell keeps authentication and training state across route changes.
const application = () => import('../App.vue')

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...screenRoutes.map(({ path, screen, access }) => ({
      path,
      name: screen,
      component: application,
      meta: { screen, access },
    })),
    // Fallback when Amplify serves the SPA shell instead of the static Swagger HTML.
    { path: '/swagger/index.html', name: 'swagger-ui', component: () => import('../views/docs/SwaggerView.vue') },
    { path: '/personal/:slug', name: 'personal-profile', component: application },
    { path: '/p/:id', name: 'personal-legacy-profile', component: application },
    { path: '/:pathMatch(.*)*', redirect: (to) => ({ path: '/', query: to.query, hash: to.hash }) },
  ],
})

router.beforeEach((to) => {
  const canonical = screenRoutes.find(
    (route) => route.path === (to.path.replace(/\/+$/, '').toLowerCase() || '/'),
  )
  if (canonical && canonical.path !== to.path) {
    return { path: canonical.path, query: to.query, hash: to.hash, replace: true }
  }
  if (typeof to.query.token === 'string' && to.path !== '/proposta') {
    return { path: '/proposta', query: to.query, replace: true }
  }
})
