import './assets/main.css'
import { createApp } from 'vue'
import App from './AppRoot.vue'
import { router } from './router'
import './assets/styles/screens.css'
import { pinia } from './stores'

const app = createApp(App)
app.use(pinia)
app.use(router)
void router.isReady().then(() => app.mount('#app'))
