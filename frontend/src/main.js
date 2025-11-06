// src/main.js
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router"; // import router
import '@/assets/css/theme.css';
import 'https://unpkg.com/@googlemaps/extended-component-library@0.6'
import 'animate.css';

// Dynamically inject Google Maps script using env key
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
if (apiKey) {
  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=places`
  script.async = true
  script.defer = true
  document.head.appendChild(script)
} else {
  console.warn('⚠️ Missing VITE_GOOGLE_MAPS_API_KEY in .env')
}

const app = createApp(App);
app.use(router);               // use router

// Global error handler
app.config.errorHandler = (err, instance, info) => {
  console.error('Global Vue error:', err)
}

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  event.preventDefault()
})

app.mount("#app");

// Global safety net: when the page regains focus or is shown from bfcache,
// restore interactivity and dismiss any leaked full-screen overlays
function restoreInteractivity() {
  try {
    document.body.style.pointerEvents = ''
    const appEl = document.getElementById('app')
    if (appEl) appEl.style.pointerEvents = ''
    document.documentElement.style.overflow = ''
  } catch {}

  // Prefer triggering existing close handlers instead of hard-removing nodes
  try {
    document.querySelectorAll('.mm-overlay, .backdrop, .filter-sheet')
      .forEach((el) => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
  } catch {}
}

window.addEventListener('focus', restoreInteractivity)
window.addEventListener('pageshow', restoreInteractivity)