<!-- src/views/LoginPageView.vue -->
<template>
  <div class="auth-shell">
    <div class="card">
      <!-- ✅ Placeholder logo you can replace later -->
      <div class="logo-placeholder">LOGO</div>

      <h1 class="title">Welcome back</h1>
      <p class="subtitle">Sign in to continue</p>

      <form @submit.prevent="onSubmit" class="form">
        <label class="label">Email or Username</label>
        <input
          v-model.trim="identifier"
          type="text"
          class="input"
          placeholder="you@example.com"
          autocomplete="username"
          required
        />

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

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="submit" :disabled="loading">
          <span v-if="loading">Signing in…</span>
          <span v-else>Sign in</span>
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
import axios from 'axios'

const router = useRouter()

// Create axios client
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

const identifier = ref('')
const password = ref('')
const showPass = ref(false)
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  if (loading.value) return
  error.value = ''
  loading.value = true

  try {
    const payload = { email: identifier.value, password: password.value }
    const { data } = await api.post('/auth/login', payload)

    const token = data?.token || data?.access_token || null
    if (token) {
      localStorage.setItem('token', token)
      sessionStorage.setItem('token', token)
    }

    router.replace('/dashboard')
  } catch (e) {
    const status = e?.response?.status
    if (status === 400 || status === 401) {
      error.value = 'Invalid credentials. Please check your details.'
    } else if (status >= 500) {
      error.value = 'Server error. Please try again shortly.'
    } else {
      error.value = 'Unable to sign in. Please try again.'
    }
    console.error('Login failed:', e)
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
  max-width: 420px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  padding: 28px;
  text-align: center;
}

/* ✅ Placeholder logo box */
.logo-placeholder {
  width: 60px;
  height: 60px;
  background: #d4816f33;
  border: 2px dashed #d4816f;
  border-radius: 12px;
  color: #d4816f;
  font-weight: 800;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 10px;
}

.title {
  margin: 8px 0 4px;
  color: #111827;
  font-size: 1.5rem;
  font-weight: 800;
}

.subtitle {
  margin: 0 0 18px;
  color: #6b7280;
}

.form {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.label {
  font-weight: 700;
  color: #374151;
  margin-bottom: 6px;
}

.mt {
  margin-top: 12px;
}

.input {
  width: 100%;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  outline: none;
  color: #111827;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  background: #fff;
}
.input:focus {
  border-color: #d4816f;
  box-shadow: 0 0 0 3px rgba(212, 129, 111, 0.15);
}

.password-wrap {
  position: relative;
}
.pass-input {
  padding-right: 72px;
}
.toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #6b7280;
  font-weight: 700;
  cursor: pointer;
}

.error {
  color: #ef4444;
  margin: 10px 0 0;
  font-weight: 600;
}

.submit {
  margin-top: 16px;
  background: #d4816f;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 0.7rem 1rem;
  font-weight: 800;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.05s ease;
}
.submit:hover {
  filter: brightness(1.03);
}
.submit:active {
  transform: translateY(1px);
}
.submit[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  text-align: center;
  margin-top: 14px;
  color: #6b7280;
}
.link {
  color: #d4816f;
  font-weight: 700;
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
</style>
