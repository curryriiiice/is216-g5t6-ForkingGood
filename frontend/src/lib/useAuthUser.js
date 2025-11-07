import { ref, readonly, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const authUser = ref(null)
const authToken = ref(null)
const fetching = ref(false)
let initialised = false
export let fetchPromise = null

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
    // We get avatar_url from metadata ONLY
    avatar_url: meta?.avatar_url || null, 
  }
}

function setAuth(session) {
  const user = session?.user ?? null
  authUser.value = normaliseUser(user) 
  authToken.value = session?.access_token ?? null
  initialised = true
}

async function loadUser() {
  if (fetchPromise) return fetchPromise

  fetching.value = true
  
  fetchPromise = supabase.auth
    .getSession()
    .then(({ data, error }) => { // NOT async
      if (error) {
        console.warn('[auth] getSession error:', error.message || error)
        setAuth(null) // NOT awaited
        return null
      }
      setAuth(data.session) // NOT awaited
      return authUser.value
    })
    .catch((err) => { // NOT async
      console.error('[auth] getSession failed:', err)
      setAuth(null) // NOT awaited
      return null
    })
    .finally(() => {
      fetching.value = false
    })
  return fetchPromise
}

supabase.auth.onAuthStateChange((_event, session) => {
  setAuth(session)
})

export const activeToken = readonly(authToken)

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
  if (forceRefresh || !initialised) {
    await loadUser()
  }
  return authUser.value?.email ?? null
}