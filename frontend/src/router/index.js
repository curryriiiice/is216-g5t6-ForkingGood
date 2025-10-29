// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { createClient } from '@supabase/supabase-js'

// Eager-loaded views
import DashboardView from '@/views/DashboardView.vue'
import MapView from '@/views/MapView.vue'
import ActivityView from '@/views/ActivityView.vue'
import FriendsView from '@/views/FriendsView.vue'
import ForkingGoodLanding from '@/views/LandingPage.vue'

// Lazy-loaded views
const ProfileView = () => import('@/views/ProfileView.vue')
const LoginPageView = () => import('@/views/LogInPageView.vue')
const SignupPageView = () => import('@/views/SignUpPageView.vue')
const ReverseImageView = () => import('@/views/ReverseImageView.vue')
const AuthCallbackView = () => import('@/views/AuthCallbackView.vue')
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public landing (use our new Lottie page)
    {
      path: '/',
      name: 'landing',
      component: ForkingGoodLanding,
      meta: { public: true, hideNavbar: true },
    },

    // Main app views
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/map', name: 'map', component: MapView },
    { path: '/activity', name: 'activity', component: ActivityView },
    { path: '/friends', name: 'friends', component: FriendsView },
    { path: '/profile', name: 'profile', component: ProfileView },

    // Reverse Image Results page
    { path: '/reverseimage', name: 'reverseimage', component: ReverseImageView },

    // Auth pages (hide navbar)
    {
      path: '/login',
      name: 'login',
      component: LoginPageView,
      meta: { public: true, hideNavbar: true },
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupPageView,
      meta: { public: true, hideNavbar: true },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: AuthCallbackView,
      meta: { public: true, hideNavbar: true },
    },

    // Catch-all fallback
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],

  scrollBehavior() {
    return { top: 0 }
  },
})

// Global auth guard:
// - Routes with meta.public = true are always allowed
// - All other routes require an authenticated Supabase user
router.beforeEach(async (to, from, next) => {
  try {
    if (to.meta?.public) return next()

    const { data } = await supabase.auth.getUser()
    const user = data?.user
    if (!user) {
      return next({ name: 'login', query: { redirect: to.fullPath } })
    }
    return next()
  } catch (e) {
    console.warn('[router] auth check failed, redirecting to login:', e)
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }
})

export default router
