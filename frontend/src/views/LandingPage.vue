<template>
  <div class="landing-root min-vh-100 bg-body text-body">
    <!-- Top nav (styled similar to app NavBar) -->
    <nav class="lp-navbar" data-animate="fadeInDown" data-delay="0s">
      <div class="container lp-row">
        <!-- Left: brand -->
        <router-link class="brand" to="/">
          <img src="/images/forkinggood-logo.png" alt="ForkingGood Logo" />
          <span>ForkingGood</span>
        </router-link>

        <!-- Center: links (landing only) -->
        <div class="links">
          <a href="#features" class="link">Features</a>
          <a href="#how" class="link">How it works</a>
        </div>

        <!-- Right: auth CTAs -->
        <div class="right">
          
          <router-link to="/login" class="btn-ghost" data-animate="fadeInRight" data-delay=".15s">Log In</router-link>
          <!-- Hamburger (mobile) -->
          <button
            type="button"
            class="hamburger"
            @click="showMobileMenu = !showMobileMenu"
            aria-label="Open menu"
            :aria-expanded="showMobileMenu ? 'true' : 'false'"
            aria-controls="lp-mobile-menu"
          >
            <svg v-if="!showMobileMenu" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <svg v-else width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          
        </div>
      </div>
    </nav>

    <!-- Mobile overlay menu -->
    <transition name="mm-fade">
      <div v-if="showMobileMenu" class="mm-overlay" @click="showMobileMenu = false">
        <div id="lp-mobile-menu" class="mm-panel position-relative" @click.stop>
          <button
            type="button"
            class="mm-close"
            aria-label="Close menu"
            @click="showMobileMenu = false"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>

          <a href="#features" class="mm-link" @click="showMobileMenu = false">Features</a>
          <a href="#how" class="mm-link" @click="showMobileMenu = false">How it works</a>
          <hr class="mm-sep" />
        </div>
      </div>
    </transition>

    <!-- Hero -->
    <section class="py-5 position-relative overflow-hidden">
      <div class="container">
        <div class="row align-items-center g-4">
          <div class="col-lg-6">
            <h1 class="display-5 fw-semibold hero-title lh-sm animate__animated animate__fadeInUp" style="animation-delay: .05s;">
              Discover & share food gems with <span class="text-sage">friends</span>
            </h1>
            <p class="lead text-muted mt-3 animate__animated animate__fadeInUp" style="animation-delay: .15s;">
              ForkingGood is your cosy map of bite-sized recommendations. Filter by area, cuisine &
              price, save places, and see what your circle actually loves.
            </p>
            <div class="d-flex flex-wrap gap-2 mt-4 animate__animated animate__fadeInUp" style="animation-delay: .25s;">
              <router-link class="btn btn-outline-secondary px-4" to="/signup"
                >Create an account</router-link
              >
              
            </div>
            <div class="d-flex align-items-center gap-2 mt-3 small text-muted animate__animated animate__fadeInUp" style="animation-delay: .35s;">
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
              class="lottie-hero animate__animated animate__zoomIn"
              style="width: 100%; height: 420px; position: relative; z-index: 1; animation-delay: .15s;"
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
            <div class="card h-100 shadow-sm border-0 reveal" data-animate="fadeInUp" data-delay="0s">
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
            <div class="border rounded-4 p-4 bg-white h-100 reveal" data-animate="fadeInUp" data-delay="0s">
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

    <footer class="py-4 bg-white border-top reveal" data-animate="fadeInUp" data-delay="0s">
      <div
        class="container d-flex flex-column flex-md-row align-items-center justify-content-between gap-3"
      >
        <p class="small text-muted mb-0">
          © {{ new Date().getFullYear() }} ForkingGood. Built with ❤️ in SG.
        </p>
        
      </div>
    </footer>

    
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

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

// === Animate.css scroll reveal ===
let _observer;
onMounted(() => {
  // Guard if IntersectionObserver unavailable (older browsers)
  if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    _observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const anim = el.getAttribute('data-animate') || 'fadeInUp';
            const delay = el.getAttribute('data-delay') || '0s';
            // apply Animate.css classes
            el.classList.add('animate__animated', `animate__${anim}`);
            el.style.animationDelay = delay;
            el.classList.add('show');
            _observer.unobserve(el);
          }
        });
      },
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.15 }
    );

    document.querySelectorAll('[data-animate]')?.forEach((el) => {
      // mark as hidden until revealed
      if (!el.classList.contains('animate__animated')) {
        el.classList.add('reveal');
      }
      _observer.observe(el);
    });
  } else {
    // Fallback: immediately apply animations
    document.querySelectorAll('[data-animate]')?.forEach((el) => {
      const anim = el.getAttribute('data-animate') || 'fadeInUp';
      const delay = el.getAttribute('data-delay') || '0s';
      el.classList.add('animate__animated', `animate__${anim}`);
      el.style.animationDelay = delay;
    });
  }
});

onBeforeUnmount(() => {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
});
// Mobile menu state for landing navbar
const showMobileMenu = ref(false)
</script>

<style scoped>
/* Brand colours */
:root {
  --sage: #9bb59f;
  --terracotta: #c4684e;
}

/* Match auth pages font stack for consistency */
.landing-root {
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Oxygen,
    Ubuntu,
    Cantarell,
    'Fira Sans',
    'Droid Sans',
    'Helvetica Neue',
    sans-serif;
}

/* Match auth pages: heavier headings + legible body */
.landing-root .navbar-brand span { font-weight: 900; letter-spacing: -0.01em; }
.landing-root .nav-link { font-weight: 800; }
.landing-root .btn { font-weight: 900; }

/* Hero title like auth titles */
.landing-root .hero-title { color: #111827; font-weight: 900 !important; letter-spacing: -0.02em; }
.landing-root .lead { color: #6b7280; font-weight: 600; }

/* Section headings aligned with app */
.landing-root .h2,
.landing-root h2 { font-weight: 800 !important; letter-spacing: -0.01em; }
.landing-root .h6,
.landing-root h6 { font-weight: 800; }

/* Card text weight similar to dashboard */
.landing-root .card .small { font-weight: 600; }
.landing-root .card .fw-semibold { font-weight: 800 !important; }
.text-sage {
  color: var(--sage) !important;
}
.lp-navbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}
.lp-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0;
}
.brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
.brand img { width: 36px; height: 36px; display: block; }
.brand span { color: #111827; font-weight: 900; letter-spacing: -0.01em; }
.links { display: none; gap: 14px; align-items: center; justify-content: center; flex: 1; }
@media (min-width: 768px) { .links { display: flex; } }
.link { color: #374151; text-decoration: none; font-weight: 800; padding: 6px 8px; border-radius: 8px; }
.link:hover { background: #f3f4f6; }
.right { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; }
.btn-ghost { display: inline-block; padding: 8px 12px; border: 1.5px solid #e5e7eb; border-radius: 10px; font-weight: 800; color: #374151; text-decoration: none; background: #fff; }
.btn-ghost:hover { background: #f9fafb; }
.btn-solid { display: inline-block; padding: 8px 12px; border-radius: 10px; font-weight: 800; color: #fff; text-decoration: none; background: var(--terracotta); border: 1.5px solid var(--terracotta); }
.btn-solid:hover { filter: brightness(0.97); }
.hamburger { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; cursor: pointer; }
@media (min-width: 768px) { .hamburger { display: none; } }

/* Mobile menu overlay */
.mm-overlay { position: fixed; inset: 0; z-index: 9998; background: rgba(17,24,39,0.45); backdrop-filter: blur(2px); }
.mm-panel { position: absolute; left: 0; right: 0; top: 0; background: #ffffff; border-bottom-left-radius: 14px; border-bottom-right-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); padding: 14px 18px 18px; }
.mm-link { display: block; padding: 12px 8px; margin: 2px 0; color: #111827; text-decoration: none; font-weight: 700; border-radius: 10px; }
.mm-link:hover { background: #f3f4f6; }
.mm-sep { border: 0; border-top: 1px solid #e5e7eb; margin: 10px 0; }
.mm-fade-enter-active, .mm-fade-leave-active { transition: opacity .16s ease; }
.mm-fade-enter-from, .mm-fade-leave-to { opacity: 0; }
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

/* Animate.css scroll-reveal helpers */
.reveal { opacity: 0; transform: translateY(6px); }
.reveal.show { opacity: 1; transform: none; }

/* Close (X) button for mobile menu */
.mm-close {
  position: absolute;
  top: 10px;
  right: 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #111827;
  padding: 4px;
}
.mm-close svg { display: block; }
</style>
