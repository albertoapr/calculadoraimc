import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import { pinia } from './stores'
import { router } from './router'

// Compatibility phase: App.vue still renders all screens and owns navigation.
// Register plugins now, migrate routes and state only after regression tests.
const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')
