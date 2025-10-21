<template>
  <div class="profile-page">
    <div class="container py-4">
      <h2 class="fw-bold mb-4" style="color:var(--ink-700)">Profile</h2>

      <div class="row g-4">
        <!-- LEFT: Current profile -->
        <div class="col-12 col-lg-5">
          <div class="card theme-card p-4 text-center sticky-lg-top" style="top:1rem">
            <div class="avatar-ring mb-3 mx-auto">
              <img :src="currentAvatar" class="avatar-display" alt="Avatar" />
            </div>
            <h5 class="fw-semibold">@{{ meOriginal.username || 'username' }}</h5>
            <div class="text-muted small mb-3">{{ meOriginal.email || 'email' }}</div>
            <hr class="soft" />
            <div class="bio text-start">
              <div class="label">Bio</div>
              <div class="value">{{ meOriginal.bio || '—' }}</div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Edit form -->
        <div class="col-12 col-lg-7">
          <div class="card theme-card p-4">
            <div class="section-title mb-2">Edit Details</div>

            <!-- Email (read-only) -->
            <div class="mb-3">
              <label class="form-label small fw-semibold text-muted">Email</label>
              <input class="form-control" v-model="form.email" disabled />
            </div>

            <!-- Username -->
            <div class="mb-3">
              <label class="form-label small fw-semibold text-muted">Username</label>
              <div class="position-relative">
                <input
                  class="form-control"
                  :class="{
                    'is-valid': usernameStatus === 'ok' && usernameDirty,
                    'is-invalid': usernameStatus === 'taken' || usernameStatus === 'invalid'
                  }"
                  v-model="form.username"
                  placeholder="e.g. foodhunter99"
                  autocomplete="off"
                />
                <div
                  v-if="usernameStatus === 'checking'"
                  class="position-absolute top-50 end-0 translate-middle-y pe-3 small text-muted"
                >
                  Checking…
                </div>
              </div>
              <div v-if="usernameStatus === 'ok' && usernameDirty" class="valid-feedback">{{ usernameMsg }}</div>
              <div v-if="usernameStatus === 'taken' || usernameStatus === 'invalid'" class="invalid-feedback">
                {{ usernameMsg }}
              </div>
              <div class="form-text">Use 3–20 characters (letters, numbers, underscores). Must be unique.</div>
            </div>

            <!-- Bio -->
            <div class="mb-3">
              <label class="form-label small fw-semibold text-muted">Bio</label>
              <textarea
                class="form-control"
                rows="3"
                v-model="form.bio"
                placeholder="Tell people what you love to eat…"
              ></textarea>
            </div>

            <!-- Avatar controls -->
            <div class="mb-4">
              <label class="form-label small fw-semibold text-muted">Profile Photo</label>
              <div class="d-flex align-items-center gap-3 flex-wrap">
                <img :src="currentAvatar" class="avatar-edit" alt="Avatar preview" />
                <label class="btn btn-ghost mb-0">
                  Choose Image
                  <input
                    ref="fileInput"
                    type="file"
                    class="d-none"
                    accept="image/*"
                    @change="onPickFile"
                  />
                </label>
                <button type="button" class="btn btn-ghost-danger" @click="removePhotoToDefault">
                  Remove Photo
                </button>
                <span class="text-muted small" v-if="avatarBlob">New photo ready</span>
                <span class="text-muted small" v-else-if="clearAvatar">Will reset to default</span>
              </div>
            </div>

            <div class="d-flex gap-2 justify-content-end">
              <router-link to="/dashboard" class="btn btn-ghost">Cancel</router-link>
              <button class="btn btn-fit" :disabled="!canSave" @click="save">
                {{ saving ? "Saving…" : "Save Changes" }}
              </button>
            </div>

            <div class="small text-muted mt-2" v-if="!hasChanges">No changes yet.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading overlay -->
    <div
      v-if="loading"
      class="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style="background: rgba(0,0,0,.15); z-index: 1000;"
    >
      <div class="card p-3 shadow-sm theme-card">Loading profile…</div>
    </div>

    <!-- Cropper Modal -->
    <div v-if="cropOpen" class="cropper-overlay" @mousedown.self="cancelCrop" @touchstart.self="cancelCrop">
      <div class="cropper-modal theme-card p-3">
        <div class="mb-2 fw-semibold">Adjust your photo</div>

        <div
          class="crop-container"
          :style="{ width: C + 'px', height: C + 'px' }"
          @mousedown="onDragStart"
          @mousemove="onDragMove"
          @mouseup="onDragEnd"
          @mouseleave="onDragEnd"
          @touchstart="onDragStart"
          @touchmove="onDragMove"
          @touchend="onDragEnd"
        >
          <img
            :src="cropSrc"
            id="crop-img-el"
            class="crop-img"
            :style="{
              left: pos.left + 'px',
              top: pos.top + 'px',
              width: (imgMeta.naturalW * cropScale) + 'px',
              height: (imgMeta.naturalH * cropScale) + 'px'
            }"
            @load="onImgLoad"
            draggable="false"
            alt="Crop source"
          />
          <div
            class="crop-mask"
            :style="{
              width: D + 'px',
              height: D + 'px',
              left: (C - D)/2 + 'px',
              top: (C - D)/2 + 'px'
            }"
          ></div>
        </div>

        <div class="mt-3">
          <label class="form-label small text-muted">Zoom</label>
          <input
            class="form-range"
            type="range"
            min="1"
            max="3"
            step="0.01"
            :value="cropScale"
            @input="onZoomChange($event.target.value)"
          />
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3">
          <button class="btn btn-ghost" @click="cancelCrop">Cancel</button>
          <button class="btn btn-fit" @click="applyCrop">Use Photo</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from "vue";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const api = axios.create({ baseURL: API_BASE });

/* ===== Default avatar SVG (Instagram-like silhouette) ===== */
const DEFAULT_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#d1d5db"/>
      <stop offset="100%" stop-color="#9ca3af"/>
    </linearGradient>
  </defs>
  <rect width="24" height="24" rx="12" fill="url(#g)"/>
  <circle cx="12" cy="9" r="3.2" fill="#ffffff" opacity="0.95"/>
  <path d="M5.5 18.3c.8-2.7 3.3-4.5 6.5-4.5s5.7 1.8 6.5 4.5c.1.4-.2.7-.6.7H6.1c-.4 0-.7-.3-.6-.7z" fill="#ffffff" opacity="0.95"/>
</svg>`);

/* ---- State ---- */
const loading = ref(false);
const saving = ref(false);

const meOriginal = reactive({
  email: "",
  username: "",
  bio: "",
  avatar_url: ""
});

const form = reactive({
  email: "",
  username: "",
  bio: "",
  avatar_url: ""
});

const preview = ref("");

/* Username validation */
const usernameStatus = ref(""); // "", "checking", "ok", "taken", "invalid"
const usernameMsg = ref("");
let usernameDebounce = null;
const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/;
const usernameDirty = computed(() => form.username.trim() !== meOriginal.username.trim());

/* Avatar pipeline */
let avatarBlob = null;           // cropped blob to upload
const clearAvatar = ref(false);  // user wants to reset to default

/* File input ref (for re-uploading same file) */
const fileInput = ref(null);

/* Cropper state */
const cropOpen = ref(false);
const cropSrc = ref("");        // objectURL of chosen file
const cropScale = ref(1.2);
const C = 320;                  // container px
const D = 280;                  // circular mask diameter
const OUT = 512;                // export size
const pos = reactive({ left: 0, top: 0 });
const dragging = ref(false);
const dragStart = reactive({ x: 0, y: 0 });
const posStart = reactive({ left: 0, top: 0 });
const imgMeta = reactive({ naturalW: 0, naturalH: 0, ready: false });

const currentAvatar = computed(() => {
  if (preview.value) return preview.value;
  if (meOriginal.avatar_url) return meOriginal.avatar_url;
  return DEFAULT_AVATAR;
});

const hasChanges = computed(() =>
  form.username.trim() !== meOriginal.username.trim() ||
  form.bio.trim() !== meOriginal.bio.trim() ||
  !!avatarBlob || clearAvatar.value
);

const canSave = computed(() => {
  const usernameBlocked =
    (usernameDirty.value && (usernameStatus.value === "taken" || usernameStatus.value === "invalid")) ||
    usernameStatus.value === "checking";
  return !loading.value && !saving.value && !usernameBlocked && hasChanges.value;
});

/* Load profile */
async function loadMe() {
  loading.value = true;
  try {
    const r = await api.get("/user/me");
    const u = r.data?.data || r.data || {};
    Object.assign(meOriginal, {
      email: u.email || "",
      username: u.username || "",
      bio: u.bio || "",
      avatar_url: u.avatar_url || u.avatar || ""
    });
    Object.assign(form, meOriginal);
    preview.value = "";       // let computed decide
    avatarBlob = null;
    clearAvatar.value = false;
    usernameStatus.value = "";
    usernameMsg.value = "";
    if (fileInput.value) fileInput.value.value = "";
  } catch (e) {
    console.error(e);
    alert("Failed to load profile.");
  } finally {
    loading.value = false;
  }
}

/* Username check */
async function checkUsernameUnique(name) {
  if (name.trim() === meOriginal.username.trim()) {
    usernameStatus.value = "ok";
    usernameMsg.value = "This is your current username.";
    return;
  }
  if (!usernamePattern.test(name.trim())) {
    usernameStatus.value = "invalid";
    usernameMsg.value = "3–20 chars, letters/numbers/underscores only.";
    return;
  }
  usernameStatus.value = "checking";
  usernameMsg.value = "Checking availability…";
  try {
    const r = await api.get("/user/check-username", { params: { username: name.trim() } });
    const payload = r.data?.data ?? r.data ?? {};
    const available = payload.available ?? payload.ok ?? payload.is_available ?? false;
    usernameStatus.value = available ? "ok" : "taken";
    usernameMsg.value = available ? "Username is available." : "Username already taken.";
  } catch (e) {
    usernameStatus.value = "ok";
    usernameMsg.value = "Could not verify; server will validate on save.";
  }
}

watch(
  () => form.username,
  (val) => {
    clearTimeout(usernameDebounce);
    if (!val?.trim()) {
      usernameStatus.value = "invalid";
      usernameMsg.value = "Username cannot be empty.";
      return;
    }
    usernameDebounce = setTimeout(() => checkUsernameUnique(val), 500);
  }
);

/* =======================
   Avatar Cropper
======================= */
function onPickFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  if (cropSrc.value) {
    URL.revokeObjectURL(cropSrc.value);
    cropSrc.value = "";
  }
  cropSrc.value = URL.createObjectURL(f);

  // Reset flags
  clearAvatar.value = false;
  avatarBlob = null;
  preview.value = "";
  imgMeta.ready = false;
  cropScale.value = 1.2;
  cropOpen.value = true;

  // Reset input so same file can be picked again
  e.target.value = "";
  if (fileInput.value) fileInput.value.value = "";
}

function onImgLoad(e) {
  const img = e.target;
  imgMeta.naturalW = img.naturalWidth;
  imgMeta.naturalH = img.naturalHeight;
  imgMeta.ready = true;
  nextTick(centerImage);
}

function centerImage() {
  const displayW = imgMeta.naturalW * cropScale.value;
  const displayH = imgMeta.naturalH * cropScale.value;
  pos.left = (C - displayW) / 2;
  pos.top = (C - displayH) / 2;
  constrainPosition();
}

function onDragStart(ev) {
  dragging.value = true;
  const p = getPoint(ev);
  dragStart.x = p.x; dragStart.y = p.y;
  posStart.left = pos.left; posStart.top = pos.top;
  ev.preventDefault();
}
function onDragMove(ev) {
  if (!dragging.value) return;
  const p = getPoint(ev);
  pos.left = posStart.left + (p.x - dragStart.x);
  pos.top  = posStart.top  + (p.y - dragStart.y);
  constrainPosition();
}
function onDragEnd() { dragging.value = false; }
function getPoint(ev) {
  if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  return { x: ev.clientX, y: ev.clientY };
}
function constrainPosition() {
  const displayW = imgMeta.naturalW * cropScale.value;
  const displayH = imgMeta.naturalH * cropScale.value;
  const half = D / 2;
  const minLeft = C/2 + half - displayW;
  const maxLeft = C/2 - half;
  const minTop  = C/2 + half - displayH;
  const maxTop  = C/2 - half;
  pos.left = Math.min(Math.max(pos.left, minLeft), maxLeft);
  pos.top  = Math.min(Math.max(pos.top,  minTop),  maxTop);
}
function onZoomChange(val) {
  const old = cropScale.value;
  const next = Number(val);
  if (!imgMeta.ready) { cropScale.value = next; return; }
  const cx = C/2, cy = C/2;
  const relX = cx - pos.left, relY = cy - pos.top;
  const ratio = next / old;
  pos.left = cx - relX * ratio;
  pos.top  = cy - relY * ratio;
  cropScale.value = next;
  constrainPosition();
}

async function applyCrop() {
  const canvas = document.createElement("canvas");
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(OUT/2, OUT/2, OUT/2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();

  const k = OUT / D;
  const img = document.getElementById("crop-img-el");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    pos.left * k,
    pos.top * k,
    imgMeta.naturalW * cropScale.value * k,
    imgMeta.naturalH * cropScale.value * k
  );

  const dataURL = canvas.toDataURL("image/png");
  preview.value = dataURL;
  avatarBlob = await (await fetch(dataURL)).blob();
  clearAvatar.value = false;

  if (cropSrc.value) { URL.revokeObjectURL(cropSrc.value); cropSrc.value = ""; }
  if (fileInput.value) fileInput.value.value = "";
  cropOpen.value = false;
}

function cancelCrop() {
  cropOpen.value = false;
  if (cropSrc.value) { URL.revokeObjectURL(cropSrc.value); cropSrc.value = ""; }
  if (fileInput.value) fileInput.value.value = "";
}

/* Remove to default (no image) */
function removePhotoToDefault() {
  preview.value = "";       // computed will show DEFAULT
  avatarBlob = null;
  clearAvatar.value = true;
  if (fileInput.value) fileInput.value.value = "";
  if (cropSrc.value) { URL.revokeObjectURL(cropSrc.value); cropSrc.value = ""; }
}

/* Upload cropped blob (if any) */
async function uploadAvatarIfAny() {
  if (!avatarBlob) return null;
  const fd = new FormData();
  fd.append("file", new File([avatarBlob], "avatar.png", { type: "image/png" }));
  const r = await api.post("/user/uploadAvatar", fd, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return r.data?.url || r.data?.data?.url || null;
}

/* Save */
async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const payload = {
      username: form.username.trim(),
      bio: form.bio.trim()
    };
    if (clearAvatar.value) {
      payload.avatar_url = null;
    } else {
      const avatarUrl = await uploadAvatarIfAny();
      if (avatarUrl) payload.avatar_url = avatarUrl;
    }
    await api.patch("/user/update", payload);
    await loadMe();
    alert("Profile updated!");
  } catch (e) {
    console.error(e);
    const msg = e?.response?.data?.message || e?.message || "Failed to save profile.";
    alert(msg);
  } finally {
    saving.value = false;
  }
}

onMounted(loadMe);
</script>

<style scoped>
/* === Theme-aware page background (inherits your app's tokens) === */
.profile-page {
  background: var(--page-bg, var(--app-bg, var(--bg, transparent)));
  background-color: var(--page-bg, var(--app-bg, var(--bg, transparent)));
  min-height: 100vh;
}

/* Cards / surfaces */
.theme-card {
  background: var(--card, var(--surface-1, rgba(255,255,255,0.6)));
  border: 1px solid var(--border, rgba(0,0,0,0.08));
  border-radius: 16px;
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 24px rgba(0,0,0,0.05);
}

/* Soft divider */
.soft {
  border: 0;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--border, rgba(0,0,0,0.1)), transparent);
}

/* Avatars */
.avatar-display {
  width: 240px;
  height: 240px;
  object-fit: cover;
  border-radius: 999px;
  box-shadow: 0 12px 28px rgba(0,0,0,0.12);
}
.avatar-ring {
  padding: 8px;
  border-radius: 999px;
  display: inline-block;
  background:
    radial-gradient(circle at 30% 20%, var(--ring-soft, rgba(0,0,0,0.05)), transparent 60%),
    linear-gradient(135deg, var(--accent, #ca6b4f), var(--accent-2, #88b9a2));
  border: 1px solid var(--border, rgba(0,0,0,0.06));
}
.avatar-edit {
  width: 100px;
  height: 100px;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 8px 22px rgba(0,0,0,0.10);
}

/* Labels/text/buttons */
.label { font-size: .8rem; color: var(--muted, #6b7280); text-transform: uppercase; letter-spacing: .2px; }
.value { color: var(--ink-700, #111827); font-size: 1rem; }
.section-title { font-weight: 600; color: var(--ink-700, #1f2937); }

.btn-ghost {
  border: 1px solid var(--border, rgba(0,0,0,0.1));
  background: var(--surface-1, transparent);
  color: var(--fg, inherit);
}
.btn-ghost:hover { background: var(--surface-2, rgba(0,0,0,0.05)); }

.btn-ghost-danger {
  border: 1px solid rgba(200,0,0,0.18);
  background: var(--surface-1, transparent);
  color: var(--danger-fg, #b91c1c);
}
.btn-ghost-danger:hover { background: rgba(185, 28, 28, 0.08); }

.btn-fit {
  background: var(--accent, var(--terra-500, #ca6b4f));
  color: #fff;
  border: 0;
  box-shadow: 0 6px 18px rgba(0,0,0,0.12);
}
.btn-fit:disabled { opacity: .6; }

/* Cropper modal */
.cropper-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.45);
  display:flex; align-items:center; justify-content:center;
  z-index: 1500; padding: 16px;
}
.cropper-modal { max-width: 92vw; width: fit-content; }

.crop-container {
  position: relative;
  background: var(--surface-1, #1111);
  overflow: hidden;
  border-radius: 12px;
  touch-action: none; /* better on mobile */
}
.crop-img {
  position: absolute;
  user-select: none;
  -webkit-user-drag: none;
  will-change: transform;
}
/* Circular guide; real crop via canvas clip */
.crop-mask {
  position: absolute;
  border-radius: 999px;
  box-shadow:
    0 0 0 9999px rgba(0,0,0,.55),
    0 0 0 2px rgba(255,255,255,.85);
  pointer-events: none;
}

/* Inputs */
.form-range { accent-color: var(--accent, #ca6b4f); }
</style>
