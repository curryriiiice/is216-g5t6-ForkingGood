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
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  outline: none;
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
}
.modal-footer {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>