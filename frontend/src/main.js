// src/main.js
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router"; // ✅ import your router

const app = createApp(App);
app.use(router);               // ✅ tell Vue to use it
app.mount("#app");