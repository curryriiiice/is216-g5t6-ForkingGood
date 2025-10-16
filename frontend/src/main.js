// src/main.js
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router"; // ✅ import your router
import '@/assets/css/theme.css';

const app = createApp(App);
app.use(router);               // ✅ tell Vue to use it
app.mount("#app");