// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'

// Eager-loaded views
import DashboardView from '@/views/DashboardView.vue'
import MapView from '@/views/MapView.vue'
import FriendsView from '@/views/FriendsView.vue'
import ForkingGoodLanding from '@/views/LandingPage.vue'

// Lazy-loaded views
const ProfileView = () => import('@/views/ProfileView.vue')
const LoginPageView = () => import('@/views/LogInPageView.vue')
const SignupPageView = () => import('@/views/SignUpPageView.vue')
const ReverseImageView = () => import('@/views/ReverseImageView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public landing (use our new Lottie page)
    { path: '/', name: 'landing', component: ForkingGoodLanding, meta: { public: true, hideNavbar: true } },

    // Main app views
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/map', name: 'map', component: MapView },
    { path: '/friends', name: 'friends', component: FriendsView },
    { path: '/profile', name: 'profile', component: ProfileView },

    // Reverse Image Results page
    { path: '/reverseimage', name: 'reverseimage', component: ReverseImageView },

    // Auth pages (hide navbar)
    { path: '/login', name: 'login', component: LoginPageView, meta: { public: true, hideNavbar: true } },
    { path: '/signup', name: 'signup', component: SignupPageView, meta: { public: true, hideNavbar: true } },

    // Catch-all fallback
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],

  scrollBehavior() {
    return { top: 0 }
  }
})

export default router