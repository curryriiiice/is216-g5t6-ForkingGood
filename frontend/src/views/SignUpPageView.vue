<!-- src/views/SignupPageView.vue -->
<template>
  <div class="auth-shell">
    <div class="card">
      <!-- Brand logo -->
      <img class="logo" src="/images/forkinggood-logo.png" alt="ForkingGood" />

      <h1 class="title">Create your account</h1>
      <p class="subtitle">Join the ForkingGood community</p>

      <form class="form" @submit.prevent="onSubmit" novalidate>
        <!-- Username -->
        <div class="field">
          <label class="label">Username</label>
          <input
            v-model.trim="username"
            type="text"
            class="input"
            placeholder="@yourhandle"
            autocomplete="username"
            required
          />
          <small class="hint-small">
            Please include an <strong>@</strong> in your username (e.g., <em>@forkingfoodie</em>).
          </small>
        </div>

        <!-- Email -->
        <div class="field">
          <label class="label mt">Email</label>
          <input
            v-model.trim="email"
            type="email"
            class="input"
            placeholder="you@example.com"
            autocomplete="email"
            required
          />
        </div>

        <!-- Password -->
        <div class="field">
          <label class="label mt">Password</label>
          <div class="password-wrap">
            <input
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              class="input pass-input"
              placeholder="••••••••"
              autocomplete="new-password"
              required
            />
            <button type="button" class="toggle" @click="showPass = !showPass">
              {{ showPass ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <!-- Confirm password -->
        <div class="field">
          <label class="label mt">Confirm password</label>
          <input
            v-model="confirmPassword"
            :type="showPass ? 'text' : 'password'"
            class="input"
            placeholder="••••••••"
            autocomplete="new-password"
            required
          />
        </div>

        <!-- Terms checkbox -->
        <label class="check mt">
          <input type="checkbox" v-model="agree" />
          <span>I agree to the Terms and Privacy Policy</span>
        </label>

        <p v-if="error" class="alert error">{{ error }}</p>
        <p v-if="success" class="success">{{ success }}</p>

        <!-- Brand button -->
        <button type="submit" class="submit" :disabled="loading" title="Create your ForkingGood account">
          <div class="btn-inner">
            <div v-if="loading" class="btn-loader" aria-hidden="true">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
            <span class="btn-text">
              {{ loading ? 'Creating your account…' : 'Sign up' }}
            </span>
          </div>
        </button>
      </form>

      <p class="hint">
        Already have an account?
        <RouterLink class="link" :to="{ name: 'login' }">Log in</RouterLink>
      </p>
    </div>

    <!-- 🔔 Email Verification Modal -->
    <Modal :show="showVerifyModal" title="Verify your email" @close="closeVerifyModal">
      <div class="verify-box">
        <p class="verify-msg">
          We’ve sent a 6-digit code to <strong>{{ email }}</strong>. Enter it below to verify your account.
        </p>

        <div class="code-wrap">
          <input
            v-model.trim="verifyCode"
            type="text"
            class="input code-input"
            placeholder="Enter verification code"
            maxlength="8"
            autocomplete="one-time-code"
            inputmode="numeric"
          />
        </div>

        <p v-if="verifyError" class="alert error">{{ verifyError }}</p>
        <p v-if="verifySuccess" class="success">{{ verifySuccess }}</p>

        <div class="verify-actions">
          <button type="button" class="btn ghost" :disabled="resendLoading" @click="resendCode">
            <span v-if="resendLoading">Sending…</span>
            <span v-else>Resend code</span>
          </button>

          <button type="button" class="btn" :disabled="verifyLoading || !verifyCode" @click="verifyEmail">
            <span v-if="verifyLoading">Verifying…</span>
            <span v-else>Verify & Continue</span>
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import Modal from '@/components/Modal.vue'

const router = useRouter()

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

const email = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const agree = ref(false)

const showPass = ref(false)
const loading = ref(false)
const error = ref('')
const success = ref('')

// Verification modal state
const showVerifyModal = ref(false)
const verifyCode = ref('')
const verifyLoading = ref(false)
const verifyError = ref('')
const verifySuccess = ref('')
const resendLoading = ref(false)

function validate() {
  if (!username.value) return 'Username is required.'
  if (!username.value.includes('@')) return 'Username must include @ (e.g., @forkingfoodie).'
  if (!email.value) return 'Email is required.'
  if (!password.value) return 'Password is required.'
  if (password.value.length < 8) return 'Password must be at least 8 characters.'
  if (password.value !== confirmPassword.value) return 'Passwords do not match.'
  if (!agree.value) return 'You must agree to the Terms and Privacy Policy.'
  return ''
}

async function onSubmit() {
  if (loading.value) return
  error.value = ''
  success.value = ''

  const v = validate()
  if (v) { error.value = v; return }

  loading.value = true
  try {
    const payload = {
      email: email.value,
      username: username.value,
      password: password.value
    }

    // Primary endpoint: userSignUp
    try {
      await api.post('/auth/userSignUp', payload)
    } catch (e) {
      // Fallbacks for older backends
      if (e?.response?.status === 404) {
        try {
          await api.post('/auth/signup', payload)
        } catch (e2) {
          if (e2?.response?.status === 404) {
            await api.post('/auth/register', payload)
          } else {
            throw e2
          }
        }
      } else {
        throw e
      }
    }

    // Open verification modal
    showVerifyModal.value = true
  } catch (e) {
    const status = e?.response?.status
    const msg =
      e?.response?.data?.message ||
      e?.response?.data?.detail ||
      e?.message ||
      'Failed to create account.'
    if (status === 409) {
      error.value = 'An account with that email/username already exists.'
    } else if (status === 400 || status === 422) {
      error.value = msg || 'Invalid details. Please check and try again.'
    } else {
      error.value = 'Something went wrong. Please try again.'
    }
    console.error('Signup error:', e)
  } finally {
    loading.value = false
  }
}

function closeVerifyModal() {
  showVerifyModal.value = false
  verifyCode.value = ''
  verifyError.value = ''
  verifySuccess.value = ''
}

async function verifyEmail() {
  if (!verifyCode.value) return
  verifyLoading.value = true
  verifyError.value = ''
  verifySuccess.value = ''

  const body = { email: email.value, code: verifyCode.value }

  try {
    await api.post('/auth/verify-email', body)
    verifySuccess.value = 'Email verified! Redirecting…'
    setTimeout(() => router.replace('/dashboard'), 700)
  } catch (e) {
    verifyError.value =
      e?.response?.data?.message ||
      e?.response?.data?.detail ||
      'Invalid or expired code. Please try again.'
    console.error('Verify error:', e)
  } finally {
    verifyLoading.value = false
  }
}

async function resendCode() {
  resendLoading.value = true
  verifyError.value = ''
  verifySuccess.value = ''
  try {
    await api.post('/auth/resend-verification', { email: email.value })
    verifySuccess.value = 'A new code has been sent to your email.'
  } catch (e) {
    verifyError.value =
      e?.response?.data?.message ||
      e?.response?.data?.detail ||
      'Could not resend the code. Please try again later.'
    console.error('Resend error:', e)
  } finally {
    resendLoading.value = false
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
  max-width: 480px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(142, 31, 47, 0.08);
  padding: 30px 26px 24px;
  text-align: center;
}

.field { text-align: left; }

.logo {
  width: 80px;
  height: 80px;
  object-fit: contain;
  display: block;
  margin: 0 auto 12px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(142,31,47,0.18);
  background: #fff;
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

.form { display: flex; flex-direction: column; }

.label {
  font-weight: 800;
  color: #374151;
  margin-bottom: 6px;
  display: block;
}
.mt { margin-top: 12px; }

.hint-small {
  font-size: 0.85rem;
  color: #6b7280;
  margin-top: 4px;
}

/* Inputs */
.input {
  width: 100%;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 13px;
  outline: none;
  color: #111827;
  transition: border-color .15s ease, box-shadow .15s ease;
  background: #fff;
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

/* Checkbox with extra spacing */
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  user-select: none;
  margin-top: 24px; /* ✅ added more breathing space */
}

.alert.error { color: #dc2626; margin: 10px 0 0; font-weight: 700; }
.success { color: #16a34a; margin: 10px 0 0; font-weight: 800; }

/* Submit button same as Login */
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

/* Modal */
.verify-box { padding: 4px 0; }
.verify-msg { color: #374151; margin: 0 0 10px; }
.code-wrap { margin: 10px 0 8px; }
.code-input { letter-spacing: 2px; text-align: center; font-weight: 800; }

.verify-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.btn {
  border: none;
  background: var(--fg-maroon);
  color: var(--ink-dark);
  font-weight: 900;
  border-radius: 12px;
  padding: 0.6rem 0.9rem;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(142,31,47,0.18);
  transition: filter .15s ease, transform .05s ease, box-shadow .15s ease;
}
.btn:hover { filter: brightness(1.05); box-shadow: 0 10px 22px rgba(142,31,47,0.24); }
.btn:active { transform: translateY(1px); }
.btn[disabled] { opacity: .65; cursor: not-allowed; }
.btn.ghost {
  background: #fff;
  color: #374151;
  border: 1.5px solid #e5e7eb;
  box-shadow: none;
}
</style>
