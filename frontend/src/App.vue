<!-- src/App.vue -->
<script setup>
import { ref, onMounted, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import api from '@/lib/api'

/* =========================
   Route + shell state
   ========================= */
const searchTerm = ref('')
const user = ref(null)
const pendingRequestsCount = ref(0)
const router = useRouter()
const route = useRoute()
const loading = ref(true)

// Removed hard refresh on tab visibility change to avoid jarring reloads

// Global safety: clear any stale full-screen overlays after tab switch
function cleanupOverlays() {
  try {
    // Unlock scroll in case any overlay locked it
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''

    // Remove common teleported overlays that might linger
    const selectors = [
      '.mm-overlay',         // NavBar mobile menu overlay
      '.modal-overlay',      // Generic modal overlay
      '.cropper-modal',      // AddRecommendationForm cropper
      '.backdrop',           // MapView drawer backdrop
      '#loading-screen'      // Initial loading screen, if stuck
    ]
    document.querySelectorAll(selectors.join(',')).forEach((el) => {
      try { el.remove() } catch {}
    })

    // Aggressive: if something still covers the top, neutralize it
    const sampleXs = [20, Math.max(20, window.innerWidth / 2), Math.max(20, window.innerWidth - 20)]
    const y = 10
    const navbar = document.querySelector('.navbar')
    const seen = new Set()
    for (const x of sampleXs) {
      const el = document.elementFromPoint(x, y)
      if (!el) continue
      if (navbar && navbar.contains(el)) continue
      if (seen.has(el)) continue
      seen.add(el)
      const style = window.getComputedStyle(el)
      const isFixed = style.position === 'fixed' || style.position === 'sticky'
      if (!isFixed) continue
      // If it spans across the viewport width or looks like a full-width bar
      const rect = el.getBoundingClientRect()
      if (rect.width > window.innerWidth * 0.8 && rect.height > 40) {
        el.style.pointerEvents = 'none'
      }
    }
  } catch {}
}

// Expose globally so router and other code can invoke it
try { window.enableUI = cleanupOverlays } catch {}

/** Hide navbar on routes with meta.hideNavbar (e.g. /login, /signup) */
const hideNavbar = computed(() => !!route.meta?.hideNavbar)

/* =========================
   Cuisine Theme (global)
   - Unified to html[data-theme] brands used in assets/css/theme.css
   ========================= */
const THEME_KEY_CUISINE = 'fg_cuisine_theme'
const THEME_KEY_BRAND = 'fg_theme_v2'
// Food-centric theme names
const CUISINE_THEMES = ['Taro', 'Matcha', 'Vanilla', 'Blueberry']

const BRAND_BY_CUISINE = {
  Taro: 'brand-plum',
  Matcha: 'brand-mint',
  Vanilla: 'light',
  Blueberry: 'brand-lagoon',
}
const CUISINE_BY_BRAND = {
  'brand-plum': 'Taro',
  'brand-mint': 'Matcha',
  light: 'Vanilla',
  'brand-lagoon': 'Blueberry',
}

// Initialize cuisine from saved brand if present, else saved cuisine, else default
const savedBrand = (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY_BRAND)) || ''
// Legacy-to-new cuisine name mapping
function normalizeCuisineName(name) {
  switch (name) {
    case 'Plum': return 'Taro'
    case 'Mint': return 'Matcha'
    case 'Light': return 'Vanilla'
    case 'Lagoon': return 'Blueberry'
    default: return name
  }
}
const initialCuisineRaw = CUISINE_BY_BRAND[savedBrand] || (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY_CUISINE)) || 'Taro'
const theme = ref(normalizeCuisineName(initialCuisineRaw))

function applyRootThemeFromCuisine(cuisine) {
  const brand = BRAND_BY_CUISINE[cuisine] || 'light'
  try { localStorage.setItem(THEME_KEY_BRAND, brand) } catch {}
  try { document.documentElement.setAttribute('data-theme', brand) } catch {}
}

function setTheme(t) {
  if (!CUISINE_THEMES.includes(t)) return
  theme.value = t
  try { localStorage.setItem(THEME_KEY_CUISINE, t) } catch {}
  applyRootThemeFromCuisine(t)
}
function cycleTheme() {
  const i = CUISINE_THEMES.indexOf(theme.value)
  const next = (i + 1) % CUISINE_THEMES.length
  setTheme(CUISINE_THEMES[next])
}
watch(theme, (t) => {
  try { localStorage.setItem(THEME_KEY_CUISINE, t) } catch {}
})

/* =========================
   Draggable switcher panel
   ========================= */
const SWITCHER_POS_KEY = 'fg_switcher_pos'
const SWITCHER_COLLAPSED_KEY = 'fg_switcher_collapsed'
const switcherEl = ref(null)
const dragging = ref(false)
const didMove = ref(false)
const justDragged = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const switcherPos = ref({ x: 12, y: 12 })
const collapsed = ref(false) // collapsed → tiny draggable button

function clampToViewport(pos) {
  const el = switcherEl.value
  const pad = 6
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = el ? el.offsetWidth : (collapsed.value ? 44 : 320)
  const h = el ? el.offsetHeight : (collapsed.value ? 44 : 56)
  return {
    x: Math.min(Math.max(pos.x, pad), vw - w - pad),
    y: Math.min(Math.max(pos.y, pad), vh - h - pad),
  }
}
function alignTopRight() {
  const el = switcherEl.value
  const pad = 12
  const w = el ? el.offsetWidth : (collapsed.value ? 44 : 320)
  switcherPos.value = clampToViewport({
    x: window.innerWidth - w - pad,
    y: 12,
  })
  localStorage.setItem(SWITCHER_POS_KEY, JSON.stringify(switcherPos.value))
}

function startDrag(e) {
  const el = switcherEl.value
  if (!el) return
  dragging.value = true
  didMove.value = false
  const rect = el.getBoundingClientRect()
  dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  document.addEventListener('pointermove', onDrag)
  document.addEventListener('pointerup', endDrag)
}
function onDrag(e) {
  if (!dragging.value) return
  didMove.value = true
  switcherPos.value = clampToViewport({
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y
  })
}
function endDrag() {
  dragging.value = false
  document.removeEventListener('pointermove', onDrag)
  document.removeEventListener('pointerup', endDrag)
  localStorage.setItem(SWITCHER_POS_KEY, JSON.stringify(switcherPos.value))
  if (didMove.value) {
    justDragged.value = true
    setTimeout(() => { justDragged.value = false }, 200)
  }
  didMove.value = false
}
function startDragMini(e) {
  dragging.value = true
  didMove.value = false
  const rect = switcherEl.value.getBoundingClientRect()
  dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  document.addEventListener('pointermove', onDrag)
  document.addEventListener('pointerup', endDrag)
}
function onMiniClick() {
  if (dragging.value || justDragged.value) return
  toggleCollapse()
}
function toggleCollapse() {
  collapsed.value = !collapsed.value
  localStorage.setItem(SWITCHER_COLLAPSED_KEY, JSON.stringify(collapsed.value))
  nextTick(() => {
    switcherPos.value = clampToViewport(switcherPos.value)
    localStorage.setItem(SWITCHER_POS_KEY, JSON.stringify(switcherPos.value))
  })
}

/* =========================
   Boot: restore state + load user
   ========================= */
onMounted(async () => {

  // Restore panel state/position
  try {
    const saved = JSON.parse(localStorage.getItem(SWITCHER_POS_KEY) || 'null')
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      switcherPos.value = saved
    } else {
      nextTick(() => alignTopRight())
    }
  } catch { nextTick(() => alignTopRight()) }

  try {
    collapsed.value = JSON.parse(localStorage.getItem(SWITCHER_COLLAPSED_KEY) || 'false')
  } catch { collapsed.value = false }

  // Load user (soft-fail)
  try {
    const { data } = await api.get('/me')
    user.value = data?.user ?? data?.data ?? data ?? null
  } catch {
    user.value = null
  } finally {
    loading.value = false
  }

  // Ensure html[data-theme] reflects current cuisine on boot
  applyRootThemeFromCuisine(theme.value)

  // Clean up any stale overlays once app is interactive
  cleanupOverlays()

  // Also clean on tab visibility/focus changes
  const onVis = () => { if (document.visibilityState === 'visible') cleanupOverlays() }
  const onFocus = () => cleanupOverlays()
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onFocus)

  // Remove listeners when app is torn down
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', onFocus)
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointermove', onDrag)
  document.removeEventListener('pointerup', endDrag)
})

/* =========================
   Classes for the page root
   ========================= */
const pageClass = computed(() => ({
  [`theme-${theme.value}`]: true,
  'themed-anim': true // keeps your subtle per-theme decorative ::after, if defined in CSS
}))
</script>

<template>
  <div class="page" :class="pageClass" style="min-height: 100vh">
    <div v-if="loading" style="padding: 16px; color: #6b7280">Loading…</div>

    <div v-else class="content-safe">
      <NavBar
        v-if="!hideNavbar"
        v-model:searchTerm="searchTerm"
        :user="user"
        :pendingRequestsCount="pendingRequestsCount"
        :themeCuisine="theme"
        @change-theme="setTheme"
      />

      
      <!-- Draggable Theme Switcher (disabled) -->
      <template v-if="false">
        <!-- Collapsed mini FAB -->
        <button
          v-if="collapsed"
          ref="switcherEl"
          class="switcher-mini"
          :style="{ left: switcherPos.x + 'px', top: switcherPos.y + 'px' }"
          title="Theme switcher"
          @pointerdown.prevent.stop="startDragMini"
          @click.stop="onMiniClick"
        >🎨</button>

        <!-- Expanded -->
        <div
          v-else
          ref="switcherEl"
          class="theme-switcher movable"
          :class="{ dragging }"
          :style="{ left: switcherPos.x + 'px', top: switcherPos.y + 'px' }"
        >
          <!-- Drag handle -->
          <div class="switcher-handle" title="Drag" @pointerdown.prevent.stop="startDrag">🎨</div>

          <div class="switcher-col">
            <div class="switcher-row">
              <button class="chip" :class="{ active: theme==='Taro' }"  @click="setTheme('Taro')">🍠 Taro</button>
              <button class="chip" :class="{ active: theme==='Matcha' }"  @click="setTheme('Matcha')">🍵 Matcha</button>
              <button class="chip" :class="{ active: theme==='Vanilla' }" @click="setTheme('Vanilla')">🍦 Vanilla</button>
              <button class="chip" :class="{ active: theme==='Blueberry' }" @click="setTheme('Blueberry')">🫐 Blueberry</button>
            </div>
          </div>

          <!-- Collapse control -->
          <div class="switcher-controls">
            <button class="chip ghost" title="Collapse" @click="toggleCollapse">x</button>
          </div>
        </div>
      </template>

      <RouterView />
    </div>
  </div>
</template>

<style>
html, body, #app { height: 100%; margin: 0; }

/* (Lottie removed: no .bg-lottie needed) */

/* Movable Theme Switcher */
.theme-switcher.movable {
  position: fixed;
  z-index: 60;
  display: inline-flex;
  align-items: stretch;
  gap: 8px;
  background: var(--surface, rgba(255,255,255,.78));
  backdrop-filter: blur(8px);
  border: 1px solid rgba(24,24,27,.10);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 12px 28px rgba(0,0,0,.08);
  user-select: none;
}
.switcher-handle {
  display: grid;
  place-items: center;
  padding: 0 6px;
  margin-right: 2px;
  color: var(--brand, #8e1f2f);
  font-weight: 900;
  cursor: grab;
  border-right: 1px dashed rgba(24,24,27,.15);
}
.theme-switcher.dragging .switcher-handle { cursor: grabbing; }
.switcher-col { display: flex; flex-direction: column; gap: 6px; }
.switcher-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.switcher-controls { display: flex; flex-direction: column; gap: 6px; margin-left: 6px; }

.theme-switcher .chip {
  appearance: none;
  border: 1px solid rgba(24,24,27,.12);
  background: #fff;
  color: var(--brand, #8e1f2f);
  font: 600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif;
  padding: 7px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease, transform .04s ease;
}
.theme-switcher .chip:hover {
  background: color-mix(in oklab, #fff 80%, var(--brand, #8e1f2f) 20%);
}
.theme-switcher .chip.active {
  background: var(--brand, #8e1f2f);
  color: #fff;
  border-color: var(--brand, #8e1f2f);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, white 45%, transparent);
}
.theme-switcher .chip.cycle { font-weight: 800; }
.theme-switcher .chip.ghost { background: #fff; color: var(--brand, #8e1f2f); }

/* Collapsed mini button */
.switcher-mini {
  position: fixed;
  z-index: 60;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(24,24,27,.12);
  background: #fff;
  color: var(--brand, #8e1f2f);
  font-size: 20px;
  cursor: grab;
  box-shadow: 0 12px 28px rgba(0,0,0,.12);
}
.switcher-mini:active { cursor: grabbing; }
</style>
