// src/main.js
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router"; // ✅ import your router
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
app.use(router);               // ✅ tell Vue to use it
app.mount("#app");

// Global safeguard: restore interactivity after tab regains focus or is restored
function restoreInteractivity() {
  try {
    const targets = [document.documentElement, document.body, document.getElementById('app')];
    for (const el of targets) {
      if (!el) continue;
      // Re-enable pointer events if they were disabled
      if (getComputedStyle(el).pointerEvents === 'none' || el.style.pointerEvents === 'none') {
        el.style.pointerEvents = 'auto';
      }
      // Clear accidental inert and overflow locks if any
      if (el.hasAttribute && el.hasAttribute('inert')) el.removeAttribute('inert');
      if (el.style && el.style.overflow === 'hidden') el.style.overflow = '';
    }
    // Close any stray mobile menu overlays if present (NavBar listens to clicks/esc)
    const mm = document.getElementById('mobile-menu');
    if (mm && typeof mm.click === 'function') {
      mm.click();
    }
  } catch {}
}

window.addEventListener('focus', restoreInteractivity);
window.addEventListener('pageshow', restoreInteractivity);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') restoreInteractivity();
});