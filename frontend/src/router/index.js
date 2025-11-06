// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthUser, fetchPromise } from '@/lib/useAuthUser' 

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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: ForkingGoodLanding, meta: { public: true, hideNavbar: true },},
    { path: '/dashboard', name: 'dashboard', component: DashboardView},
    { path: '/map', name: 'map', component: MapView},
    { path: '/activity', name: 'activity', component: ActivityView },
    { path: '/friends', name: 'friends', component: FriendsView},
    { path: '/profile', name: 'profile', component: ProfileView },
    { path: '/reverseimage', name: 'reverseimage', component: ReverseImageView },
    { path: '/login', name: 'login', component: LoginPageView, meta: { public: true, hideNavbar: true },},
    { path: '/signup', name: 'signup', component: SignupPageView, meta: { public: true, hideNavbar: true },},
    { path: '/auth/callback', name: 'auth-callback', component: AuthCallbackView, meta: { public: true, hideNavbar: true },},
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

// Global auth guard:
router.beforeEach(async (to, from, next) => {
  if (to.meta?.public) return next()
    
  const { user, ready } = useAuthUser()

  let currentUser = user.value
  
  if (!ready.value && fetchPromise) {
    try {
      currentUser = await fetchPromise
    } catch (e) {
      console.error('[router] Auth fetch failed:', e)
      currentUser = null
    }
  }

  if (!currentUser) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }
  
  return next()
})

export default router