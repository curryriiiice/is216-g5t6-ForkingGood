import { ref, readonly, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const authUser = ref(null)
const fetching = ref(false)
let initialised = false
let fetchPromise = null

function extractEmail(user) {
  if (!user) return null
  if (user.email) return user.email
  if (user.user_metadata?.email) return user.user_metadata.email
  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      const email = identity?.identity_data?.email
      if (email) return email
    }
  }
  return null
}

function normaliseUser(user) {
  if (!user) return null
  const email = extractEmail(user)
  const meta = { ...user.user_metadata }
  return {
    id: user.id,
    email,
    phone: user.phone ?? null,
    app_metadata: user.app_metadata ?? {},
    user_metadata: meta,
    raw: user,
    ...meta,
  }
}

async function loadUser() {
  if (fetchPromise) return fetchPromise
  fetching.value = true
  fetchPromise = supabase.auth
    .getUser()
    .then(({ data, error }) => {
      if (error) {
        console.warn('[auth] getUser error:', error.message || error)
        authUser.value = null
        return null
      }
      const result = normaliseUser(data?.user ?? null)
      authUser.value = result
      return result
    })
    .catch((err) => {
      console.error('[auth] getUser failed:', err)
      authUser.value = null
      return null
    })
    .finally(() => {
      fetching.value = false
      initialised = true
      fetchPromise = null
    })
  return fetchPromise
}

supabase.auth.onAuthStateChange((_event, session) => {
  initialised = true
  authUser.value = normaliseUser(session?.user ?? null)
})

export function useAuthUser() {
  if (!initialised && !fetching.value) {
    loadUser().catch(() => {})
  }
  return {
    user: readonly(authUser),
    loading: computed(() => !initialised && fetching.value),
    ready: computed(() => initialised),
    refresh: () => loadUser(),
  }
}

export async function getActiveEmail({ forceRefresh = false } = {}) {
  if (forceRefresh || (!initialised && !authUser.value)) {
    await loadUser()
  }
  return authUser.value?.email ?? null
}
