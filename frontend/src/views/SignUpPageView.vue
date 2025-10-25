<!-- src/views/SignupPageView.vue -->
<template>
  <div class="auth-shell">
    <div class="card">
      <!-- Placeholder logo (replace later) -->
      <div class="logo-placeholder" aria-label="Logo placeholder">FG</div>

      <h1 class="title">Create your account</h1>
      <p class="subtitle">It’s fast and easy</p>

      <form class="form" @submit.prevent="onSubmit">
        <!-- Name (optional but nice) -->
        <div class="row">
          <div class="col">
            <label class="label">First name</label>
            <input v-model.trim="firstName" type="text" class="input" placeholder="Jane" />
          </div>
          <div class="col">
            <label class="label">Last name</label>
            <input v-model.trim="lastName" type="text" class="input" placeholder="Doe" />
          </div>
        </div>

        <!-- Username or email (depending on backend) -->
        <label class="label mt">Email</label>
        <input
          v-model.trim="email"
          type="email"
          class="input"
          placeholder="you@example.com"
          autocomplete="email"
          required
        />

        <label class="label mt">Username (optional)</label>
        <input
          v-model.trim="username"
          type="text"
          class="input"
          placeholder="yourhandle"
          autocomplete="username"
        />

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

        <label class="label mt">Confirm password</label>
        <input
          v-model="confirmPassword"
          :type="showPass ? 'text' : 'password'"
          class="input"
          placeholder="••••••••"
          autocomplete="new-password"
          required
        />

        <label class="check mt">
          <input type="checkbox" v-model="agree" />
          <span>I agree to the Terms and Privacy Policy</span>
        </label>

        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="success" class="success">{{ success }}</p>

        <button type="submit" class="submit" :disabled="loading">
          <span v-if="loading">Creating account…</span>
          <span v-else>Sign up</span>
        </button>
      </form>

      <p class="hint">
        Already have an account?
        <RouterLink class="link" :to="{ name: 'login' }">Sign in</RouterLink>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const agree = ref(false)

const showPass = ref(false)
const loading = ref(false)
const error = ref('')
const success = ref('')

function validate() {
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
  if (v) {
    error.value = v
    return
  }

  loading.value = true
  try {
    // Adjust keys to match your backend (common: first_name / last_name)
    const payload = {
      email: email.value,
      username: username.value || undefined,
      password: password.value,
      first_name: firstName.value || undefined,
      last_name: lastName.value || undefined
    }

    // Try /auth/signup; if not found, try /auth/register
    try {
      await api.post('/auth/signup', payload)
    } catch (e) {
      if (e?.response?.status === 404) {
        await api.post('/auth/register', payload)
      } else {
        throw e
      }
    }

    success.value = 'Account created! Redirecting to login…'
    // Give a moment to show success text, then go to login
    setTimeout(() => {
      router.replace({ name: 'login', query: { signup: 'success' } })
    }, 600)
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
</script>

<style scoped>
.auth-shell {
  min-height: 100vh;
  background: #f0f2f5;
  display: grid;
  place-items: center;
  padding: 24px;
}

.card {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0,0,0,.08);
  padding: 28px;
}

.logo-placeholder {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: #e9ebee;
  color: #6b7280;
  font-weight: 800;
  font-size: 1.05rem;
  display: grid;
  place-items: center;
  margin: 0 auto 8px;
  user-select: none;
}

.title {
  text-align: center;
  margin: 8px 0 4px;
  color: #111827;
  font-size: 1.5rem;
  font-weight: 800;
}

.subtitle {
  text-align: center;
  margin: 0 0 18px;
  color: #6b7280;
}

.form { display: flex; flex-direction: column; }

.row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.col { display: flex; flex-direction: column; }

.label {
  font-weight: 700;
  color: #374151;
  margin-bottom: 6px;
}
.mt { margin-top: 12px; }

.input {
  width: 100%;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  outline: none;
  color: #111827;
  transition: border-color .15s ease, box-shadow .15s ease;
  background: #fff;
}
.input:focus {
  border-color: #d4816f;
  box-shadow: 0 0 0 3px rgba(212,129,111,.15);
}

.password-wrap { position: relative; }
.pass-input { padding-right: 72px; }
.toggle {
  position: absolute;
  right: 8px; top: 50%;
  transform: translateY(-50%);
  border: none; background: transparent;
  color: #6b7280; font-weight: 700; cursor: pointer;
}

.check {
  display: flex; align-items: center; gap: 8px;
  color: #374151; user-select: none;
}
.check input { transform: translateY(1px); }

.error { color: #ef4444; margin: 10px 0 0; font-weight: 600; }
.success { color: #16a34a; margin: 10px 0 0; font-weight: 700; }

.submit {
  margin-top: 16px;
  background: #d4816f; /* match brand/Reverse button */
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: .7rem 1rem;
  font-weight: 800;
  cursor: pointer;
  transition: filter .15s ease, transform .05s ease;
}
.submit:hover { filter: brightness(1.03); }
.submit:active { transform: translateY(1px); }
.submit[disabled] { opacity: .6; cursor: not-allowed; }

.hint { text-align: center; margin-top: 14px; color: #6b7280; }
.link { color: #d4816f; font-weight: 700; text-decoration: none; }
.link:hover { text-decoration: underline; }

@media (max-width: 480px) {
  .row { grid-template-columns: 1fr; }
}
</style>
