<template>
  <div class="min-vh-100 bg-body text-body">
    <!-- Top nav (Bootstrap) -->
    <nav class="navbar navbar-expand-lg sticky-top bg-white border-bottom">
      <div class="container">
        <router-link class="navbar-brand d-flex align-items-center gap-2" to="/">
          <img
            src="/images/forkinggood-logo.png"
            alt="ForkingGood Logo"
            style="height: 36px; width: auto"
          />
          <span class="fw-semibold">ForkingGood</span>
        </router-link>
        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navFG"
          aria-controls="navFG"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navFG">
          <ul class="navbar-nav ms-auto mb-2 mb-lg-0 align-items-lg-center">
            <li class="nav-item"><a class="nav-link" href="#features">Features</a></li>
            <li class="nav-item"><a class="nav-link" href="#how">How it works</a></li>
            <li class="nav-item ms-lg-3">
              <router-link class="btn btn-outline-secondary" to="/login">Log In</router-link>
            </li>
          </ul>
        </div>
      </div>
    </nav>

    <!-- Hero -->
    <section class="py-5 position-relative overflow-hidden">
      <div class="container">
        <div class="row align-items-center g-4">
          <div class="col-lg-6">
            <h1 class="display-5 fw-semibold lh-sm">
              Discover & share food gems with <span class="text-sage">friends</span>
            </h1>
            <p class="lead text-muted mt-3">
              ForkingGood is your cosy map of bite-sized recommendations. Filter by area, cuisine &
              price, save places, and see what your circle actually loves.
            </p>
            <div class="d-flex flex-wrap gap-2 mt-4">
              <router-link class="btn btn-outline-secondary px-4" to="/signup"
                >Create an account</router-link
              >
              
            </div>
            <div class="d-flex align-items-center gap-2 mt-3 small text-muted">
              <div class="d-inline-flex align-items-center">
                <span
                  class="rounded-circle border border-2 border-white me-n2"
                  style="width: 28px; height: 28px; background: #9bb59f"
                ></span>
                <span
                  class="rounded-circle border border-2 border-white me-n2"
                  style="width: 28px; height: 28px; background: #c4684e"
                ></span>
                <span
                  class="rounded-circle border border-2 border-white"
                  style="width: 28px; height: 28px; background: #ccc"
                ></span>
              </div>
              <span>Trusted by food-loving friends in SG</span>
            </div>
          </div>

          <!-- Right column with Lottie + CTA -->
          <div class="col-lg-6 position-relative text-center">
            <lottie-player
              :src="heroSrc"
              background="transparent"
              speed="1"
              class="lottie-hero"
              style="width: 100%; height: 420px; position: relative; z-index: 1"
              autoplay
              loop
              @error="onLottieError"
            ></lottie-player>

            <!-- Push blur behind using a low z-index -->
            <div
              class="position-absolute rounded-circle"
              style="
                inset: auto -8% 10% auto;
                width: 280px;
                height: 280px;
                filter: blur(40px);
                opacity: 0.25;
                /* background: radial-gradient(closest-side, #9bb59f, transparent); */
                z-index: 0;
              "
            ></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section id="features" class="py-5 bg-white border-top">
      <div class="container">
        <h2 class="h2 fw-semibold">Features that feel tasty</h2>
        <p class="text-muted mt-1">
          Everything you need to plan your next bite, and nothing you don't.
        </p>

        <div class="row g-4 mt-2">
          <div class="col-sm-6 col-lg-3" v-for="f in features" :key="f.title">
            <div class="card h-100 shadow-sm border-0">
              <div class="card-body">
                <div class="mb-3" style="width: 112px; height: 112px">
                  <lottie-player
                    :src="f.src"
                    background="transparent"
                    speed="1"
                    autoplay
                    loop
                    @error="onLottieError"
                  ></lottie-player>
                </div>
                <h3 class="h6 fw-semibold">{{ f.title }}</h3>
                <p class="text-muted small mb-0">{{ f.desc }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section id="how" class="py-5 bg-light">
      <div class="container">
        <div class="row g-4">
          <div class="col-md-4" v-for="(s, i) in steps" :key="i">
            <div class="border rounded-4 p-4 bg-white h-100">
              <div class="d-flex justify-content-between align-items-center">
                <span class="small fw-medium text-sage">Step {{ i + 1 }}</span>
                <div style="width: 72px; height: 72px">
                  <lottie-player
                    :src="s.src"
                    background="transparent"
                    speed="1"
                    autoplay
                    loop
                    @error="onLottieError"
                  ></lottie-player>
                </div>
              </div>
              <h4 class="h6 fw-semibold mt-3">{{ s.title }}</h4>
              <p class="text-muted small mb-0">{{ s.text }}</p>
            </div>
          </div>
        </div>
        <!-- <div class="text-center mt-4">
          <router-link to="/signup" class="btn btn-sage px-4"
            >Start free — no card needed</router-link
          >
        </div> -->
      </div>
    </section>

    <footer class="py-4 bg-white border-top">
      <div
        class="container d-flex flex-column flex-md-row align-items-center justify-content-between gap-3"
      >
        <p class="small text-muted mb-0">
          © {{ new Date().getFullYear() }} ForkingGood. Built with ❤️ in SG.
        </p>
        <div class="d-flex gap-3 small">
          <router-link to="/privacy" class="link-secondary text-decoration-none"
            >Privacy</router-link
          >
          <router-link to="/terms" class="link-secondary text-decoration-none">Terms</router-link>
        </div>
      </div>
    </footer>

    <!-- Floating mobile CTA -->
    <router-link to="/login" class="btn btn-outline-secondary btn-lg d-md-none cta-fab">
      Log In
    </router-link>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// Lottie sources
const heroSrc = 'https://lottie.host/163d8d3c-e11d-49b5-9d57-9140b2c7af39/iJyhmcfKZc.json'

const features = ref([
  {
    title: 'Add Friends',
    desc: 'Share privately with your circle or shout it to the world. Toggle visibility per post.',
    src: 'https://lottie.host/9d24a680-9611-4e6c-8be5-0096e1a40b2f/FtcZcJ3Mt3.json',
  },
  {
    title: 'Review Restaurants',
    desc: 'Filter by cuisine, area, and price range. Your randomiser mirrors your main filters.',
    src: 'https://lottie.host/5784e39b-966f-441b-9512-d483ec1c9a7e/unIKkUOyVd.json',
  },
  {
    title: 'View The Map',
    desc: 'Jump straight to the pin, open the drawer, and see photos, ratings & reviews.',
    src: 'https://lottie.host/634f1de0-cf81-4a50-b146-9087c64fd053/FDPHzJtNfj.json',
  },
  {
    title: 'Reverse Image Search',
    desc: 'Add multiple images, crop to 3:2, and zoom before uploading.',
    src: 'https://lottie.host/f376fb80-3244-4210-9a75-1fb66ec751de/1f5sFqrptF.json',
  },
])

const steps = ref([
  {
    title: 'Sign up',
    text: 'Create your account with email. Follow friends to see their food map.',
    src: 'https://lottie.host/757df87e-ae70-4f12-9f9c-554a1ba28132/Qm0mLXe2JU.json',
  },
  {
    title: 'Add a rec',
    text: 'Post a place with photos, rating, cuisine, price & area tags.',
    src: 'https://assets10.lottiefiles.com/packages/lf20_iv4dsx3q.json',
  },
  {
    title: 'Go eat',
    text: 'Use filters or randomiser, tap a pin, open the drawer, and go!',
    src: 'https://lottie.host/37c6ab0b-a4b8-423e-90f3-00d1ddba301c/dZLJRlrkis.json',
  },
])

const onLottieError = (e) => {
  const el = e?.target
  if (!el) return
  el.outerHTML =
    '<div class="d-inline-grid place-items-center rounded-3 border text-secondary small" style="width:112px;height:112px;">Lottie unavailable</div>'
}
</script>

<style scoped>
/* Brand colours */
:root {
  --sage: #9bb59f;
  --terracotta: #c4684e;
}
.text-sage {
  color: var(--sage) !important;
}
.btn-sage {
  background: var(--sage);
  color: #fff;
  border-color: var(--sage);
}
.btn-sage:hover {
  filter: brightness(0.95);
}
.btn-terracotta {
  background: var(--terracotta);
  color: #fff;
  border-color: var(--terracotta);
}
.btn-terracotta:hover {
  filter: brightness(0.95);
}

/* Keep the Lottie from swallowing clicks; make stacking predictable */
lottie-player {
  display: block;
}
.lottie-hero {
  pointer-events: none;
} /* allow clicks on CTA above it */
.cta-hero {
  z-index: 2;
} /* lifted above Lottie and blur */

/* Floating CTA (mobile only; hidden ≥ md via d-md-none) */
.cta-fab {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1040; /* above content, below modal */
}

/* micro aesthetic */
h1,
h2,
h3,
h4 {
  letter-spacing: -0.015em;
}
</style>
