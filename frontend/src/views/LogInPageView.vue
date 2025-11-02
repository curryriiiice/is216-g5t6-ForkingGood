<template>
  <div class="auth-shell">
    <div class="card">
      <img class="logo" src="/images/forkinggood-logo.png" alt="ForkingGood" />

      <h1 class="title">Welcome back</h1>
      <p class="subtitle">Log in to continue your food adventure</p>

      <form @submit.prevent="onSubmit" class="form" novalidate>
        <div class="field">
          <label class="label">Email</label>
          <input
            v-model.trim="identifier"
            type="text"
            class="input"
            placeholder="you@example.com"
            autocomplete="username"
            required
          />
        </div>

        <div class="field">
          <label class="label mt">Password</label>
          <div class="password-wrap">
            <input
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              class="input pass-input"
              placeholder="••••••••"
              autocomplete="current-password"
              required
            />
            <button type="button" class="toggle" @click="showPass = !showPass">
              {{ showPass ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <p v-if="error" class="alert error">{{ error }}</p>

        <button
          type="submit"
          class="submit"
          :disabled="loading"
          title="Log in to ForkingGood"
        >
          <div class="btn-inner">
            <div v-if="loading" class="btn-loader" aria-hidden="true">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
            <span class="btn-text">
              {{ loading ? 'Logging you in…' : 'Log in' }}
            </span>
          </div>
        </button>
      </form>

      <p class="hint">
        Don’t have an account?
        <RouterLink to="/signup" class="link">Create one</RouterLink>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

import { supabase } from '@/lib/supabaseClient'

const identifier = ref('')
const password = ref('')
const showPass = ref(false)
const loading = ref(false)
const error = ref('')

function looksLikeEmail(v) {
  return /.+@.+\..+/.test(v)
}

async function onSubmit() { 
  if (loading.value) return
  error.value = ''

  if (!identifier.value) return (error.value = 'Please enter your email or username.')
  if (!password.value) return (error.value = 'Please enter your password.')

  loading.value = true
  try {
    // Resolve identifier to an email if the user typed @username
    let emailForLogin = identifier.value.trim()
    if (!looksLikeEmail(emailForLogin)) {
      // normalise @username -> lowercase, ensure leading @ in DB
      const handle = emailForLogin.startsWith('@') ? emailForLogin.toLowerCase() : ('@' + emailForLogin.toLowerCase())
      const { data: row, error: qErr } = await supabase
        .from('users')
        .select('user_email')
        .eq('username', handle)
        .maybeSingle()

      if (qErr) {
        console.error('Lookup error:', qErr)
        throw new Error('Could not verify username. Please try again.')
      }

      if (!row?.user_email) {
        error.value = 'No such user found. Please sign up first.'
        loading.value = false
        return
      }
      emailForLogin = row.user_email
    }

    // Login with Supabase using email + password
    const { data, error: signErr } = await supabase.auth.signInWithPassword({
      email: emailForLogin,
      password: password.value
    })

    if (signErr) {
      // Common auth errors
      const msg = (signErr?.message || '').toLowerCase()
      if (msg.includes('invalid login') || msg.includes('invalid')) {
        error.value = 'Invalid credentials. Please try again.'
      } else if (msg.includes('email not confirmed') || msg.includes('email not confirmed')) {
        error.value = 'Please confirm your email before logging in.'
      } else {
        error.value = signErr.message || 'Unable to log in. Please try again.'
      }
      loading.value = false
      return
    }

    // Optional: expose access token for legacy flows
    if (data?.session?.access_token) {
      localStorage.setItem('sb-access-token', data.session.access_token)
      sessionStorage.setItem('sb-access-token', data.session.access_token)
    }

    router.replace('/dashboard')
  } catch (e) {
    console.error('Login failed:', e)
    error.value = e?.message || 'Unable to log in. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
:root {
  --fg-maroon: #8E1F2F;
  --fg-terracotta: #b04c39;
  --fg-terracotta-dark: #7d3025;
  --fg-gold: #e3b23c;
  --ink-dark: #2c1c15;
}

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
  max-width: 460px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(142, 31, 47, 0.08);
  padding: 30px 26px 24px;
  text-align: center;
}

/* Left-align only form labels, not the rest */
.field {
  text-align: left;
}

.logo {
  width: 80px;
  height: 80px;
  object-fit: contain;
  margin: 0 auto 12px;
  display: block;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(142,31,47,0.18);
}

.title {
  margin: 8px 0 2px;
  color: #111827;
  font-size: 1.6rem;
  font-weight: 900;
}
.subtitle {
  color: #6b7280;
  margin-bottom: 18px;
  font-weight: 600;
}

/* Form */
.label {
  font-weight: 800;
  color: #374151;
  margin-bottom: 6px;
  display: block;
}
.mt { margin-top: 12px; }

.input {
  width: 100%;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 13px;
  outline: none;
  color: #111827;
  background: #fff;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.input:focus {
  border-color: var(--fg-maroon);
  box-shadow: 0 0 0 4px rgba(142,31,47,.12);
}

/* Password toggle */
.password-wrap { position: relative; }
.pass-input { padding-right: 78px; }
.toggle {
  position: absolute;
  right: 10px; top: 50%;
  transform: translateY(-50%);
  border: none; background: transparent;
  color: #6b7280; font-weight: 800; cursor: pointer;
}
.toggle:hover { color: var(--fg-maroon); }

.alert.error {
  color: #dc2626;
  margin: 10px 0 0;
  font-weight: 700;
}

/* Log In button */
.submit {
  margin-top: 20px;
  background: linear-gradient(180deg, var(--fg-maroon) 0%, var(--fg-terracotta) 80%, var(--fg-terracotta-dark) 100%);
  color: var(--ink-dark);
  border: none;
  border-radius: 22px;
  padding: 1rem 1.1rem;
  font-weight: 900;
  font-size: 1.05rem;
  cursor: pointer;
  width: 100%;
  min-height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 22px rgba(142,31,47,0.25), inset 0 1px 3px rgba(255,255,255,0.3);
  transition: transform .06s ease, filter .15s ease, box-shadow .15s ease;
}
.submit:hover {
  filter: brightness(1.05);
  box-shadow: 0 12px 28px rgba(142,31,47,0.32), inset 0 1px 3px rgba(255,255,255,0.4);
}
.submit:active { transform: translateY(1px); }
.submit[disabled] { opacity: .65; cursor: not-allowed; }

/* Loader */
.btn-inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
}
.btn-text { font-weight: 900; letter-spacing: .2px; }

.btn-loader {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.btn-loader .dot {
  width: 7px; height: 7px; border-radius: 999px;
  background: var(--ink-dark);
  opacity: .95;
  animation: bounce 1.2s ease-in-out infinite;
}
.btn-loader .dot:nth-child(2) { animation-delay: .12s; }
.btn-loader .dot:nth-child(3) { animation-delay: .24s; }
@keyframes bounce {
  0%, 100% { transform: translateY(0); opacity: .75; }
  50%      { transform: translateY(-5px); opacity: 1; }
}

.hint {
  text-align: center;
  margin-top: 16px;
  color: #6b7280;
}
.link {
  color: var(--fg-maroon);
  font-weight: 800;
  text-decoration: none;
}
.link:hover { text-decoration: underline; }
</style>
