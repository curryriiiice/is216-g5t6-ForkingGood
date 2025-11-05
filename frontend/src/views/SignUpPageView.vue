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
            :class="{ invalid: usernameError }"
            placeholder="@yourhandle"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            inputmode="text"
            @blur="checkUsernameAvailability"
            required
          />
          <small class="hint-small">
            e.g., <em>@forkingfoodie</em>
          </small>
          <br>
          <small v-if="usernameError" class="hint-small error-text" aria-live="polite">{{ usernameError }}</small>
          <small v-else-if="usernameStatusMsg" class="hint-small" :class="usernameStatusClass" aria-live="polite">{{ usernameStatusMsg }}</small>
        </div>

        <!-- Email -->
        <div class="field">
          <label class="label mt">Email</label>
          <input
            v-model.trim="email"
            type="email"
            class="input"
            :class="{ invalid: emailError }"
            placeholder="you@example.com"
            autocomplete="email"
            required
          />
          <small v-if="emailError" class="hint-small error-text" aria-live="polite">{{ emailError }}</small>
        </div>

        <!-- Password -->
        <div class="field">
          <label class="label mt">Password</label>
          <div class="password-wrap">
            <input
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              class="input pass-input"
              :class="{ invalid: passwordError }"
              placeholder="••••••••"
              autocomplete="new-password"
              required
            />
            <button type="button" class="toggle" @click="showPass = !showPass">
              {{ showPass ? 'Hide' : 'Show' }}
            </button>
          </div>
          <small class="hint-small">
            <strong>Requirements:</strong> at least 8 characters, <strong>1 uppercase</strong>, and <strong>1 special character</strong>.
          </small>
          <small v-if="passwordError" class="hint-small error-text" aria-live="polite">{{ passwordError }}</small>
        </div>

        <!-- Confirm password -->
        <div class="field">
          <label class="label mt">Confirm password</label>
          <input
            v-model="confirmPassword"
            :type="showPass ? 'text' : 'password'"
            class="input"
            :class="{ invalid: confirmError }"
            placeholder="••••••••"
            autocomplete="new-password"
            required
          />
          <small v-if="confirmError" class="hint-small error-text" aria-live="polite">{{ confirmError }}</small>
        </div>

        <!-- Terms checkbox -->
        <label class="check mt">
          <input type="checkbox" v-model="agree" />
          <span>I agree to the Terms and Privacy Policy</span>
        </label>

        <p v-if="error" class="alert error">{{ error }}</p>
        <p v-if="success" class="success">{{ success }}</p>
        <p v-if="success" class="hint">
          Didn't get it?
          <button type="button" class="link" :disabled="resendLoading" @click="resendCode">
            {{ resendLoading ? 'Resending…' : 'Resend confirmation email' }}
          </button>
        </p>

        <!-- Brand button -->
        <button
          type="submit"
          class="submit"
          :disabled="loading"
          title="Create your ForkingGood account"
        >
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
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabaseClient.js'
import api from '@/lib/api'

const router = useRouter()


const email = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const agree = ref(false)

const showPass = ref(false)
const loading = ref(false)
const error = ref('')
const success = ref('')

const resendLoading = ref(false)

/** Regex rules */
const USERNAME_RE = /^@([A-Za-z0-9_]{3,20})$/      // must start with '@'
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/ // ≥8, 1 uppercase, 1 special

/** Field-level error helpers for inline messages */
const usernameTaken = ref(null) // null=unknown, true=taken, false=free
const checkingUsername = ref(false)

const usernameError = computed(() => {
  if (!username.value) return ''
  if (!USERNAME_RE.test(username.value)) {
    if (!username.value.startsWith('@')) return 'Username must start with @.'
    return 'Use 3–20 letters, numbers, or underscores after @.'
  }
  if (usernameTaken.value === true) return 'Username already exists.'
  return ''
})

watch(username, () => { usernameTaken.value = null })

// Debounced availability check like Profile page
let usernameDebounce = null
watch(username, (val) => {
  clearTimeout(usernameDebounce)
  if (!val || !USERNAME_RE.test(val)) { return }
  usernameDebounce = setTimeout(() => { checkUsernameAvailability() }, 500)
})

async function checkUsernameAvailability() {
  // Only check if format is valid
  if (!USERNAME_RE.test(username.value)) { usernameTaken.value = null; return false }
  try {
    checkingUsername.value = true
    const res = await api.get('/user/getAllUsernames')
    const list = Array.isArray(res?.data?.data) ? res.data.data : res?.data || []
    const want = String(username.value).toLowerCase()
    const exists = list.some((row) => {
      const u = typeof row === 'string' ? row : row?.username
      return String(u || '').toLowerCase() === want
    })
    usernameTaken.value = exists
    return exists
  } catch (e) {
    // On API failure, don't block signup; treat as unknown
    usernameTaken.value = null
    return false
  } finally {
    checkingUsername.value = false
  }
}

// Status line and classes similar to Profile page
const usernameStatus = computed(() => {
  if (!username.value) return ''
  if (!USERNAME_RE.test(username.value)) return 'invalid'
  if (checkingUsername.value) return 'checking'
  if (usernameTaken.value === true) return 'taken'
  if (usernameTaken.value === false) return 'ok'
  return ''
})
const usernameStatusMsg = computed(() => {
  switch (usernameStatus.value) {
    case 'checking': return 'Checking availability.'
    case 'ok': return 'Username is available.'
    case 'taken': return 'Username already exists.'
    default: return ''
  }
})
const usernameStatusClass = computed(() => {
  return {
    'text-success': usernameStatus.value === 'ok',
    'error-text': usernameStatus.value === 'taken' || usernameStatus.value === 'invalid',
    'text-muted': usernameStatus.value === 'checking',
  }
})

const emailError = computed(() => {
  if (!email.value) return ''
  // very light email check; browser will also validate type="email"
  return ''
})

const passwordError = computed(() => {
  if (!password.value) return ''
  if (password.value.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password.value)) return 'Include at least 1 uppercase letter.'
  if (!/[^A-Za-z0-9]/.test(password.value)) return 'Include at least 1 special character.'
  return ''
})

const confirmError = computed(() => {
  if (!confirmPassword.value) return ''
  if (password.value !== confirmPassword.value) return 'Passwords do not match.'
  return ''
})

function validate() {
  if (!username.value) return 'Username is required.'
  if (!USERNAME_RE.test(username.value)) {
    if (!username.value.startsWith('@')) return 'Username must start with @ (e.g., @forkingfoodie).'
    return 'Username must be @ + 3–20 letters, numbers, or underscores.'
  }
  if (!email.value) return 'Email is required.'
  if (!password.value) return 'Password is required.'
  if (!PASSWORD_RE.test(password.value)) {
    return 'Password needs at least 8 chars, 1 uppercase, and 1 special character.'
  }
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

  // Check username availability just before submitting
  const taken = await checkUsernameAvailability()
  if (taken) {
    error.value = 'That username is already taken. Please choose another.'
    return
  }

  loading.value = true
  try {
    // also store a 'handle' without the @ if you want it later
    const handle = username.value.replace(/^@/, '')

    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
      options: {
        data: { username: username.value, handle }, // store both
        emailRedirectTo: "`${window.location.origin}/auth/callback`"
      }
    })

    if (signErr) {
      if (signErr.status === 422 || signErr.status === 400) {
        error.value = signErr.message || 'Invalid details. Please check and try again.'
      } else if (signErr.status === 409) {
        error.value = 'An account with that email/username already exists.'
      } else {
        error.value = signErr.message || 'Something went wrong. Please try again.'
      }
      return
    }

    // Insert profile picture setup and create new user record in public.users
    if (data.user) {
      try{
        // upload default pfp 
        await setupProfilePicture(data.user);
        // record everyth in public.users table 
        await createPublicUserRecord(data.user);
      }catch (err) {
        console.warn('Profile setup failed, but auth user was created:', err)
        // Continue anyway - user can upload profile pic later
  }
    }

    success.value = 'Almost done! Check your inbox for a confirmation link to activate your account.'
  } catch (e) {
    console.error('Signup error:', e)
    error.value = e.message || 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}

// insert credentials into public.user bECAUSE ANNOYING SUPABASE DOESNT ALLOW TRIGGERS ON AUTH SCHEMA OMLLLLL
async function createPublicUserRecord(user) {
  try {
    // Build the public URL for the default avatar we upload under the email folder
    const { data: urlData } = supabase.storage
      .from('profile-images')
      .getPublicUrl(`${user.email}/default-avatar.jpg`)

    const publicImageUrl = urlData.publicUrl

    const { error: dbError } = await supabase
      .from('user')
      .insert([
        {
          UID: user.id,
          user_email: user.email,
          username: username.value,
          profile_image_url: publicImageUrl
        }
      ])

    if (dbError && !dbError.message.includes('duplicate key')) {
      console.warn('Failed to create public user record:', dbError)
    }
  } catch (err) {
    console.warn('Public user creation failed:', err)
  }
}


async function setupProfilePicture(user) {
  try {
    // Use the user's email to avoid special characters from emails in paths
    const folder = `${user.email}`

    // Check if the email folder already has a default avatar
    const { data: folderList, error: listError } = await supabase.storage
      .from('profile-images')
      .list(folder, { limit: 1 })

    // If folder doesn't exist or is empty, upload a default avatar from /public/images
    if (listError || !folderList || folderList.length === 0) {
      const response = await fetch('/images/default-avatar.jpg')
      if (!response.ok) {
        console.warn('Failed to fetch default avatar from /public/images/default-avatar.jpg')
        return
      }

      const defaultAvatarBlob = await response.blob()

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(`${folder}/default-avatar.jpg`, defaultAvatarBlob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError && !uploadError.message.includes('already exists')) {
        console.warn('Could not create default avatar:', uploadError)
      }
    }
  } catch (err) {
    console.warn('Profile picture setup failed:', err)
  }
}



async function resendCode() {
  resendLoading.value = true
  try {
    const { error: rErr } = await supabase.auth.resend({
      type: 'signup',
      email: email.value
    })
    if (rErr) {
      error.value = rErr.message || 'Could not resend the confirmation email. Please try again later.'
    } else {
      success.value = 'A new confirmation email has been sent to your inbox.'
    }
  } catch (e) {
    console.error('Resend error:', e)
    error.value = 'Could not resend the confirmation email. Please try again later.'
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

.hint-small.error-text {
  color: #dc2626;
  font-weight: 700;
}
.hint-small.text-success { color: #16a34a; font-weight: 800; }
.hint-small.text-muted { color: #6b7280; }

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
.input.invalid {
  border-color: #dc2626;
  box-shadow: 0 0 0 4px rgba(220,38,38,0.10);
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
  margin-top: 24px;
}

.alert.error { color: #dc2626; margin: 10px 0 0; font-weight: 700; }
.success { color: #16a34a; margin: 10px 0 0; font-weight: 800; }

/* Submit button */
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

/* Modal styles (kept) */
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
