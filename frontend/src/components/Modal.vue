<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click="onBackdrop">
      <div
        class="modal-panel"
        role="dialog"
        :aria-labelledby="title ? 'modal-title' : undefined"
        aria-modal="true"
        @click.stop
        ref="panel"
      >
        <header class="modal-header">
          <h3 v-if="title" id="modal-title">{{ title }}</h3>
          <button class="modal-close" @click="$emit('close')" aria-label="Close">✕</button>
        </header>

        <div class="modal-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closeOnBackdrop: { type: Boolean, default: true },
  closeOnEsc: { type: Boolean, default: true },
})
const emit = defineEmits(['close'])
const panel = ref(null)

function onKeydown(e) {
  if (props.closeOnEsc && e.key === 'Escape') emit('close')
}
function onBackdrop() {
  if (props.closeOnBackdrop) emit('close')
}

watch(
  () => props.show,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) setTimeout(() => panel.value?.focus?.(), 0)
  }
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 1rem;
}
.modal-panel {
  width: min(640px, 96vw);
  max-height: 96dvh; /* taller viewport usage */
  display: flex;
  flex-direction: column; /* header / body / footer stack */
  overflow: hidden; /* body will scroll internally */
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  outline: none;
  --modal-chrome: 128px; /* header + footer + paddings allowance */
}

/* Mobile: fullscreen like Bootstrap's modal-fullscreen-sm-down */
@media (max-width: 575.98px) {
  .modal-overlay { padding: 0; }
  .modal-panel {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    --modal-chrome: 144px; /* slightly larger allowance on phones */
  }
}

/* Bootstrap-like responsive widths */
@media (min-width: 576px) { /* sm */
  .modal-panel { width: min(540px, 95vw); }
}
@media (min-width: 768px) { /* md */
  .modal-panel { width: min(720px, 94vw); }
}
@media (min-width: 992px) { /* lg */
  .modal-panel { width: min(900px, 92vw); }
}
@media (min-width: 1200px) { /* xl */
  .modal-panel { width: min(1140px, 90vw); }
}
@media (min-width: 1400px) { /* xxl */
  .modal-panel {
    width: min(1320px, 88vw);
    max-height: 96dvh;
  }
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #eee;
}
.modal-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
}
.modal-close {
  border: 0;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
}
.modal-body {
  padding: 1rem 1.25rem;
  flex: 1 1 auto;     /* fill remaining space */
  min-height: 0;       /* allow child to shrink */
  overflow: auto;      /* scroll inside body, not page */
}

/* Make images fully visible and responsive within modal */
.modal-body img,
:deep(.modal-body img) {
  max-width: 100%;
  max-height: calc(96dvh - var(--modal-chrome));
  width: auto;
  height: auto !important;
  display: block;
  margin: 0 auto;
  object-fit: contain;
  object-position: center;
}

.modal-footer {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>

