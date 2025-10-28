<template>
  <div class="auth-shell">
    <div class="card">
      <img class="logo" src="/images/forkinggood-logo.png" alt="ForkingGood" />

      <h1 class="title">Verifying your email…</h1>
      <p v-if="status" class="status">{{ status }}</p>

      <p v-if="error" class="error">
        {{ error }}
      </p>
      <RouterLink
        v-if="error"
        class="link"
        :to="{ name: 'login' }"
      >
        Return to log in
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'

const router = useRouter()
const route = useRoute()

const status = ref('Please wait while we finish setting up your account.')
const error = ref('')

async function redirectHome() {
  status.value = 'All set! Taking you to your dashboard…'
  // Allow UI to update before navigating away
  setTimeout(() => {
    router.replace({ name: 'dashboard' }).catch(() => {})
  }, 350)
}

function parseHashParams() {
  const raw = window.location.hash?.replace(/^#/, '') || ''
  return new URLSearchParams(raw)
}

onMounted(async () => {
  try {
    const hashParams = parseHashParams()
    const searchParams = new URLSearchParams(window.location.search)

    // 1. Supabase may deliver access/refresh tokens in the hash fragment
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    if (accessToken && refreshToken) {
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (sessionErr) throw sessionErr
      return redirectHome()
    }

    // 2. OAuth/magic-link style ?code= exchange
    const code = searchParams.get('code') || hashParams.get('code')
    if (code) {
      const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
      if (exchangeErr) throw exchangeErr
      return redirectHome()
    }

    // 3. Fallback: verify OTP token (email confirmation links include token + email)
    const token = searchParams.get('token')
    const type = searchParams.get('type') || 'signup'
    const email = searchParams.get('email') ? decodeURIComponent(searchParams.get('email')) : null
    if (token && email && type) {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token,
        type,
      })
      if (verifyErr) throw verifyErr
      return redirectHome()
    }

    // No recognizable params; just bounce to dashboard (guard will redirect if needed)
    await redirectHome()
  } catch (e) {
    console.error('[auth-callback] verification failed:', e)
    error.value =
      e?.message ||
      'We could not verify your email. Please try logging in or request a new confirmation email.'
    status.value = ''
  }
})
</script>

<style scoped>
.auth-shell {
  min-height: 100vh;
  background:
    radial-gradient(1000px 600px at 20% -10%, #fff6e0 0%, rgba(255,255,255,0) 55%),
    radial-gradient(1200px 600px at 100% 0%, #ffe9ec 0%, rgba(255,255,255,0) 45%),
    #fafafc;
  display: grid;
  place-items: center;
  padding: 28px;
}

.card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(142, 31, 47, 0.08);
  padding: 32px 28px;
  text-align: center;
}

.logo {
  width: 70px;
  height: 70px;
  object-fit: contain;
  display: block;
  margin: 0 auto 14px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(142,31,47,0.18);
  background: #fff;
}

.title {
  margin: 6px 0 12px;
  color: #111827;
  font-size: 1.5rem;
  font-weight: 900;
}

.status {
  color: #4b5563;
  font-weight: 600;
}

.error {
  margin-top: 12px;
  color: #dc2626;
  font-weight: 700;
}

.link {
  display: inline-block;
  margin-top: 16px;
  font-weight: 800;
  color: #8E1F2F;
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
</style>
