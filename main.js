/**
 * Engineering in Motion — main.js
 * Scroll-driven canvas animation with GSAP ScrollTrigger
 * 240 frames: assembled → exploded engineering view
 */

/* ═══════════════════════════════════════════
   CONFIGURATION
═══════════════════════════════════════════ */
const CONFIG = {
  totalFrames: 240,
  framePath: (n) => `gun/frame_${String(n).padStart(4, '0')}.png`,
  criticalFrames: 20,   // preload immediately
  batchSize: 10,        // background load batch size
  batchDelay: 50,       // ms between background batches
  scrollHeight: '600vh', // hero-wrapper scroll height (matches CSS)
};

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const images = new Array(CONFIG.totalFrames).fill(null);
const loadedFlags = new Array(CONFIG.totalFrames).fill(false);
let currentFrame = 0;
let isReady = false;
let scrollTriggerInstance = null;

/* ═══════════════════════════════════════════
   CANVAS SETUP
═══════════════════════════════════════════ */
const canvas = document.getElementById('animation-canvas');
const ctx = canvas.getContext('2d', {
  alpha: false,          // opaque — black BG, skip alpha channel
  desynchronized: true,  // hint: don't wait for paint sync
  willReadFrequently: false,
});

/** Fit canvas to viewport, maintaining image aspect ratio */
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);
  // Redraw current frame after resize
  if (loadedFlags[currentFrame]) {
    drawFrame(currentFrame);
  }
}

/** Draw a single frame onto the canvas, letterboxed (object-fit: contain) */
function drawFrame(index) {
  const img = images[index];
  if (!img || !loadedFlags[index]) return;

  const cw = canvas.width  / (window.devicePixelRatio || 1);
  const ch = canvas.height / (window.devicePixelRatio || 1);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, cw, ch);

  if (img.naturalWidth === 0) return;

  // Object-fit: contain logic
  const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth  * scale;
  const dh = img.naturalHeight * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  ctx.drawImage(img, dx, dy, dw, dh);
}

/* ═══════════════════════════════════════════
   FRAME LOADING
═══════════════════════════════════════════ */

/** Load a single frame by 0-based index. Returns a Promise. */
function loadFrame(index) {
  return new Promise((resolve) => {
    if (loadedFlags[index]) { resolve(); return; }

    const img = new Image();
    img.onload = () => {
      images[index] = img;
      loadedFlags[index] = true;
      resolve();
    };
    img.onerror = () => { resolve(); /* skip failed frames */ };
    img.src = CONFIG.framePath(index + 1); // 1-indexed filenames
  });
}

/** Preload first N critical frames sequentially, then start background load */
async function preloadCritical() {
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderPct = document.getElementById('loader-pct');

  const criticalCount = CONFIG.criticalFrames;
  const promises = [];

  for (let i = 0; i < criticalCount; i++) {
    promises.push(loadFrame(i));
  }

  // Track progress
  let loaded = 0;
  const tracked = promises.map((p, i) =>
    p.then(() => {
      loaded++;
      const pct = Math.round((loaded / criticalCount) * 100);
      if (loaderBar) loaderBar.style.width = pct + '%';
      if (loaderPct) loaderPct.textContent = pct;
      // Draw first frame as soon as it's ready
      if (i === 0 && loadedFlags[0]) drawFrame(0);
    })
  );

  await Promise.all(tracked);
}

/** Load remaining frames in background batches */
async function loadRemaining() {
  const start = CONFIG.criticalFrames;
  const total = CONFIG.totalFrames;

  for (let i = start; i < total; i += CONFIG.batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + CONFIG.batchSize, total); j++) {
      batch.push(loadFrame(j));
    }
    await Promise.all(batch);
    // Small yield to avoid blocking scroll events
    await new Promise(r => setTimeout(r, CONFIG.batchDelay));
  }
}

/* ═══════════════════════════════════════════
   SCROLL ANIMATION SETUP (GSAP)
═══════════════════════════════════════════ */
function initScrollAnimation() {
  // Ensure GSAP & ScrollTrigger are available
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.warn('GSAP not available, falling back to native scroll');
    initNativeScroll();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  const frameNum = document.getElementById('frame-num');
  const progressBar = document.getElementById('progress-bar');

  scrollTriggerInstance = ScrollTrigger.create({
    trigger: '#hero-wrapper',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,           // lock scroll progress directly to animation
    pin: '#hero-sticky',   // pin the sticky hero during scroll
    onUpdate: (self) => {
      const p = self.progress; // 0.0 → 1.0
      const targetFrame = Math.min(
        Math.round(p * (CONFIG.totalFrames - 1)),
        CONFIG.totalFrames - 1
      );

      // Only redraw if frame changed (dirty flag)
      if (targetFrame !== currentFrame) {
        currentFrame = targetFrame;
        drawFrame(currentFrame);

        // Update UI counters
        if (frameNum) {
          frameNum.textContent = String(currentFrame + 1).padStart(3, '0');
        }
        if (progressBar) {
          progressBar.style.width = (p * 100) + '%';
        }
      }

      // Animate hero text based on progress
      updateHeroText(p);
    },
  });
}

/* ═══════════════════════════════════════════
   NATIVE SCROLL FALLBACK (no GSAP)
═══════════════════════════════════════════ */
function initNativeScroll() {
  const wrapper = document.getElementById('hero-wrapper');
  if (!wrapper) return;

  let rafId = null;

  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const rect = wrapper.getBoundingClientRect();
      const wrapperHeight = wrapper.offsetHeight - window.innerHeight;
      const scrolled = Math.max(0, -rect.top);
      const p = Math.min(1, scrolled / wrapperHeight);

      const targetFrame = Math.min(
        Math.round(p * (CONFIG.totalFrames - 1)),
        CONFIG.totalFrames - 1
      );

      if (targetFrame !== currentFrame) {
        currentFrame = targetFrame;
        drawFrame(currentFrame);

        const frameNum = document.getElementById('frame-num');
        const progressBar = document.getElementById('progress-bar');
        if (frameNum) frameNum.textContent = String(currentFrame + 1).padStart(3, '0');
        if (progressBar) progressBar.style.width = (p * 100) + '%';
      }

      updateHeroText(p);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ═══════════════════════════════════════════
   HERO TEXT ANIMATION BASED ON SCROLL
═══════════════════════════════════════════ */
function updateHeroText(progress) {
  const badge     = document.getElementById('hero-badge');
  const title     = document.getElementById('hero-title');
  const sub       = document.getElementById('hero-sub');
  const cta       = document.getElementById('hero-cta');
  const scrollInd = document.getElementById('scroll-indicator');

  // Fade in text — staggered by progress thresholds
  if (progress >= 0)    badge?.classList.add('visible');
  if (progress >= 0.02) title?.classList.add('visible');
  if (progress >= 0.05) sub?.classList.add('visible');
  if (progress >= 0.10) cta?.classList.add('visible');

  // Hide scroll indicator once user starts scrolling
  if (progress > 0.05) {
    scrollInd?.classList.remove('visible');
  }
}

/* ═══════════════════════════════════════════
   NAV SCROLL BEHAVIOR
═══════════════════════════════════════════ */
function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      nav.classList.toggle('scrolled', !entry.isIntersecting);
    },
    { rootMargin: '-80px 0px 0px 0px', threshold: 0 }
  );

  const heroContent = document.getElementById('hero-content');
  if (heroContent) observer.observe(heroContent);
}

/* ═══════════════════════════════════════════
   SECTION REVEAL (IntersectionObserver)
═══════════════════════════════════════════ */
function initSectionReveal() {
  const sections = document.querySelectorAll('.section');
  if (!sections.length) return;

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -60px 0px' }
  );

  sections.forEach((section) => revealObserver.observe(section));
}

/* ═══════════════════════════════════════════
   HERO INITIAL TEXT REVEAL (on load)
═══════════════════════════════════════════ */
function initHeroInitialReveal() {
  // Reveal badge and scroll indicator on initial page load
  setTimeout(() => {
    document.getElementById('hero-badge')?.classList.add('visible');
    document.getElementById('hero-title')?.classList.add('visible');
    document.getElementById('hero-sub')?.classList.add('visible');
    document.getElementById('scroll-indicator')?.classList.add('visible');
    document.getElementById('frame-counter')?.classList.add('visible');
    document.getElementById('hero-cta')?.classList.add('visible');
  }, 400);
}

/* ═══════════════════════════════════════════
   MICRO INTERACTIONS
═══════════════════════════════════════════ */
function initMicroInteractions() {
  // Smooth hover tilt on glass cards
  const cards = document.querySelectorAll('.glass-card, .perf-card');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width  - 0.5;
      const cy = (e.clientY - rect.top)  / rect.height - 0.5;
      card.style.transform = `translateY(-3px) rotateX(${-cy * 4}deg) rotateY(${cx * 4}deg)`;
      card.style.transition = 'transform 0.1s';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    });
  });

  // Nav link smooth scroll override
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/* ═══════════════════════════════════════════
   LOADER DISMISS
═══════════════════════════════════════════ */
function hideLoader() {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => { loader.style.display = 'none'; }, 800);
  }
}

/* ═══════════════════════════════════════════
   MOBILE DETECTION
═══════════════════════════════════════════ */
function isMobile() {
  return window.innerWidth <= 768;
}

/* ═══════════════════════════════════════════
   MAIN INIT
═══════════════════════════════════════════ */
async function init() {
  // Resize canvas immediately
  resizeCanvas();
  window.addEventListener('resize', () => {
    // Debounce resize
    clearTimeout(window._resizeTimer);
    window._resizeTimer = setTimeout(resizeCanvas, 100);
  });

  if (isMobile()) {
    // On mobile: skip canvas animation, just hide loader
    hideLoader();
    initHeroInitialReveal();
    initNav();
    initSectionReveal();
    initMicroInteractions();
    return;
  }

  // Desktop: preload critical frames first
  await preloadCritical();

  // Draw frame 0 on canvas
  drawFrame(0);

  // Hide loader
  hideLoader();

  // Init scroll animation
  initScrollAnimation();

  // Reveal initial hero text
  initHeroInitialReveal();

  // UI
  initNav();
  initSectionReveal();
  initMicroInteractions();

  // Load remaining frames in background
  loadRemaining().catch(console.warn);
}

/* ═══════════════════════════════════════════
   WAIT FOR GSAP TO LOAD, THEN INIT
═══════════════════════════════════════════ */
function waitForGSAP(callback, attempts = 0) {
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    callback();
  } else if (attempts < 50) {
    setTimeout(() => waitForGSAP(callback, attempts + 1), 100);
  } else {
    // GSAP didn't load, init without it
    callback();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => waitForGSAP(init));
} else {
  waitForGSAP(init);
}
