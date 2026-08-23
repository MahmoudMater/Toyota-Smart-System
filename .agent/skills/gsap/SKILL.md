---
name: gsap
description: >
  Use this skill whenever the user wants GSAP animations, scroll-triggered effects, timelines,
  morph SVGs, draggable UI, flip transitions, or any GreenSock-based motion. Triggers include:
  any mention of "gsap", "greensock", "scroll trigger", "gsap timeline", "stagger", "tween",
  "ScrollTrigger", "Draggable", "MorphSVG", "SplitText", "FLIP", "MotionPath", or requests
  for "cinematic animation", "scroll-based animation", "page transitions", "text reveal",
  "parallax with gsap". Also use for performance-critical animation work where CSS alone
  won't cut it, or when orchestrating complex multi-element sequences. Do NOT use for
  simple CSS transitions, Framer Motion, or plain JS requestAnimationFrame work unless
  the user explicitly asks to refactor to GSAP.
---

# GSAP Master Skill

You are a **GSAP animation architect**. Every animation you write is intentional, performant, and cinematic. You think in timelines, not individual tweens. You always optimize for 60fps. You never fight the browser — you orchestrate it.

---

## 1. Core Philosophy

**Animate with purpose.** Motion must serve the user's attention, not compete with it. Ask: *what is this animation for?* Before writing a single tween:

1. Identify the **emotional target** (delight, urgency, calm, power)
2. Map the **interaction trigger** (load, scroll, hover, click, route change)
3. Choose the **choreography pattern** (stagger cascade, reveal wipe, physics bounce, morphic shift)

**Performance-first rules (non-negotiable):**
- Only animate `transform` and `opacity` for GPU-composited layers
- Use `will-change: transform` sparingly and only when animating
- Always `gsap.set()` initial states before playing — never rely on CSS for starting conditions
- Kill timelines and ScrollTriggers in component cleanup (React, Vue, Svelte)
- Use `invalidateOnRefresh: true` on ScrollTriggers that depend on layout

---

## 2. Setup & Installation

### CDN (HTML projects)
```html
<!-- Core GSAP -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>

<!-- Free plugins -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/Draggable.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/Flip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/TextPlugin.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/Observer.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/MotionPathPlugin.min.js"></script>

<!-- Register all at once -->
<script>
  gsap.registerPlugin(ScrollTrigger, Draggable, Flip, TextPlugin, Observer, MotionPathPlugin);
</script>
```

### npm (React / Next.js / Vue / Nuxt)
```bash
npm install gsap
```

```js
// utils/gsap.js — centralized registration (import this once at app root)
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import { Observer } from "gsap/Observer";
import { TextPlugin } from "gsap/TextPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

gsap.registerPlugin(ScrollTrigger, Flip, Observer, TextPlugin, MotionPathPlugin);

export { gsap, ScrollTrigger, Flip, Observer, TextPlugin, MotionPathPlugin };
```

### Club GSAP plugins (paid — MorphSVG, SplitText, DrawSVG, ScrambleText)
```js
// Install via npm after purchasing
// npm install @gsap/shockingly-green (business license)
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
gsap.registerPlugin(MorphSVGPlugin, SplitText, DrawSVGPlugin);
```

---

## 3. Timelines — The Core Unit

Never chain individual `gsap.to()` calls for sequenced animations. Always use timelines.

```js
// ❌ BAD — uncontrollable, hard to edit timing
gsap.to(".a", { opacity: 1, delay: 0 });
gsap.to(".b", { opacity: 1, delay: 0.3 });
gsap.to(".c", { opacity: 1, delay: 0.6 });

// ✅ GOOD — orchestrated, reversible, labelable
const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 0.8 } });

tl.from(".a", { opacity: 0, y: 40 })
  .from(".b", { opacity: 0, y: 40 }, "-=0.5")   // overlap previous by 0.5s
  .from(".c", { opacity: 0, y: 40 }, "-=0.5")
  .from(".d", { opacity: 0, scale: 0.9 }, "<");  // same start time as previous
```

### Position parameter cheat sheet
```
"+=1"   — 1s after previous ends
"-=0.3" — 0.3s before previous ends (overlap)
"<"     — same start as previous
"<0.2"  — 0.2s after previous START
"myLabel" — jump to named label
"myLabel+=0.5"
```

### Timeline with labels
```js
const tl = gsap.timeline();

tl.addLabel("intro")
  .from(".hero-title", { opacity: 0, y: 60, duration: 1, ease: "expo.out" })
  .from(".hero-sub", { opacity: 0, y: 30, duration: 0.8 }, "-=0.4")
  .addLabel("cta", "+=0.2")
  .from(".hero-cta", { opacity: 0, scale: 0.85, duration: 0.6, ease: "back.out(1.7)" }, "cta");

// Seek to labels:
tl.seek("cta");
tl.tweenTo("intro");
```

---

## 4. Easing — The Soul of Animation

```js
// Power eases (most versatile)
"power1.out"   // gentle, subtle
"power2.out"   // standard UI
"power3.out"   // punchy, confident
"power4.out"   // very fast start, slow end

// Expo / Circ (dramatic)
"expo.out"     // rocket launch deceleration — great for hero reveals
"expo.in"      // slow start, explosive exit
"circ.out"     // smooth arc

// Elastic / Back (physical)
"elastic.out(1, 0.3)"  // springy — adjust amplitude, period
"back.out(1.7)"        // slight overshoot — great for buttons and cards
"back.in(2)"           // wind-up before exit

// Bounce
"bounce.out"   // rubber ball — use sparingly

// Custom cubic bezier
gsap.to(el, { ease: "cubic-bezier(0.22, 1, 0.36, 1)", ... });

// Custom ease with CustomEase (free plugin)
import { CustomEase } from "gsap/CustomEase";
gsap.registerPlugin(CustomEase);
CustomEase.create("cinematic", "0.25, 0.46, 0.45, 0.94");
gsap.to(el, { ease: "cinematic", ... });
```

---

## 5. ScrollTrigger — Scroll-Based Choreography

### Basic reveal
```js
gsap.from(".card", {
  scrollTrigger: {
    trigger: ".card",
    start: "top 80%",     // element top hits 80% of viewport
    end: "top 30%",
    toggleActions: "play none none reverse",
    // "onEnter onLeave onEnterBack onLeaveBack"
    // values: "play pause resume reverse restart reset none"
  },
  opacity: 0,
  y: 60,
  duration: 0.9,
  ease: "power3.out",
});
```

### Pinned section + scrub
```js
gsap.to(".panel", {
  xPercent: -300,  // slide 3 panels left
  ease: "none",    // linear for scrub
  scrollTrigger: {
    trigger: ".horizontal-section",
    pin: true,
    scrub: 1,       // seconds of lag (smoothness)
    snap: 1 / 3,   // snap to each panel (fractions of total progress)
    end: "+=2000",
  },
});
```

### Staggered batch reveals (performance-optimized)
```js
ScrollTrigger.batch(".item", {
  onEnter: (elements) => {
    gsap.from(elements, {
      opacity: 0,
      y: 50,
      stagger: 0.1,
      duration: 0.8,
      ease: "power2.out",
    });
  },
  start: "top 85%",
});
```

### Progress-driven animation
```js
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: ".section",
    start: "top top",
    end: "+=600",
    scrub: true,
    pin: true,
    markers: false, // set true for debugging
  },
});

tl.to(".circle", { scale: 20, opacity: 0, ease: "power2.in" })
  .from(".text", { opacity: 0, y: 20 }, "<0.5");
```

### Responsive ScrollTriggers (matchMedia)
```js
const mm = gsap.matchMedia();

mm.add("(min-width: 768px)", () => {
  // Desktop animations
  gsap.to(".sidebar", { x: 0, scrollTrigger: { ... } });

  return () => { /* cleanup */ };
});

mm.add("(max-width: 767px)", () => {
  // Mobile animations
  gsap.to(".mobile-menu", { y: 0, scrollTrigger: { ... } });
});
```

---

## 6–9, 11–12, 14, 16 — Extended Patterns

For text animations, FLIP, Draggable, SVG, micro-interactions, page transitions, cinematic patterns, and utility functions, see [reference.md](reference.md).

---

## 10. React / Next.js Integration Pattern

```jsx
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function AnimatedSection({ children }) {
  const sectionRef = useRef(null);
  const ctx = useRef(null);

  useEffect(() => {
    // All GSAP in a context for scoped cleanup
    ctx.current = gsap.context(() => {
      gsap.from(".reveal-item", {
        opacity: 0,
        y: 50,
        stagger: 0.1,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
        },
      });
    }, sectionRef); // scope to this component

    return () => ctx.current.revert(); // cleanup on unmount
  }, []);

  return <section ref={sectionRef}>{children}</section>;
}
```

### useGSAP hook (official)
```bash
npm install @gsap/react
```

```jsx
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

gsap.registerPlugin(useGSAP);

function Component() {
  const container = useRef(null);

  useGSAP(() => {
    gsap.from(".box", { opacity: 0, y: 40, duration: 1 });
    // No need for manual cleanup — useGSAP handles it
  }, { scope: container });

  return <div ref={container}><div className="box" /></div>;
}
```

---

## 13. Performance & Debugging

### Always do this
```js
// Set initial state BEFORE timeline plays
gsap.set(".element", { opacity: 0, y: 50 });

// Force 3D layer (GPU composite)
gsap.set(".heavy-element", { force3D: true });

// Kill everything on route change (React/SPA)
return () => {
  ScrollTrigger.getAll().forEach(t => t.kill());
  gsap.killTweensOf("*");
};

// Refresh after dynamic content loads
ScrollTrigger.refresh();

// After images load
window.addEventListener("load", () => ScrollTrigger.refresh());
```

### Debugging tools
```js
// Visual debug markers
scrollTrigger: { markers: true }

// Log all ScrollTriggers
ScrollTrigger.getAll().forEach(t => console.log(t));

// GSAP DevTools (browser extension)
// Install: gsap.com/devtools
// import { GSDevTools } from "gsap/GSDevTools";
// GSDevTools.create();

// Slow down for inspection
gsap.globalTimeline.timeScale(0.1);

// Pause everything
gsap.globalTimeline.pause();
```

---

## 15. Common Mistakes to Avoid

| ❌ Mistake | ✅ Fix |
|---|---|
| Animating `width`/`height` | Use `scaleX`/`scaleY` + `transformOrigin` |
| Animating `top`/`left` | Use `x`/`y` (transforms) |
| Forgetting to `kill()` on cleanup | Always cleanup in React `useEffect` return |
| Over-using `will-change` | Only set it during animation, remove after |
| Stacking `delay` on individual tweens | Use timeline position parameter |
| Not refreshing ScrollTrigger | Call `ScrollTrigger.refresh()` after layout changes |
| Animating `display` property | Use `autoAlpha` (handles `visibility` + `opacity`) |
| Creating timelines inside event listeners | Create once, use `.restart()` / `.play()` |
| Forgetting `defaults` on timeline | Set `{ defaults: { ease, duration } }` to DRY code |
| Using `fromTo` when `from` suffices | `from` auto-captures current values as `to` |

---

## 17. Plugin Reference Card

| Plugin | License | Use case |
|---|---|---|
| `ScrollTrigger` | Free | Scroll-based animation, pin, scrub |
| `Flip` | Free | Layout transitions (FLIP technique) |
| `Draggable` | Free | Drag and drop interactions |
| `Observer` | Free | Touch/wheel/pointer event normalization |
| `TextPlugin` | Free | Typewriter effect |
| `MotionPathPlugin` | Free | Animate along SVG path |
| `EasePack` | Free | SlowMo, RoughEase, ExpoScaleEase |
| `CustomEase` | Free | Bezier curve eases |
| `SplitText` | Club 💰 | Character/word/line splitting |
| `MorphSVGPlugin` | Club 💰 | SVG shape morphing |
| `DrawSVGPlugin` | Club 💰 | SVG stroke reveal |
| `ScrambleTextPlugin` | Club 💰 | Matrix text scramble |
| `GSDevTools` | Club 💰 | Visual timeline debugger |
| `InertiaPlugin` | Club 💰 | Momentum/physics for Draggable |
| `Physics2DPlugin` | Club 💰 | Gravity, velocity, acceleration |
| `CustomWiggle` | Club 💰 | Procedural wiggle motion |

---

## Output Standards

When writing GSAP code:

1. **Always use `gsap.context()`** in component-based frameworks for scoped cleanup
2. **Always register plugins** at the top of the file, not inside components
3. **Always set initial states** with `gsap.set()` before timelines play
4. **Always include cleanup** — `ctx.revert()` or `ScrollTrigger.getAll().forEach(t => t.kill())`
5. **Always use timeline `defaults`** — never repeat `ease` and `duration` per tween
6. **Always comment timelines** — label phases (intro, reveal, cta, outro)
7. **Always test reduced motion**: `window.matchMedia("(prefers-reduced-motion: reduce)")`

```js
// Reduced motion respect — always include this
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  gsap.set(".animated", { opacity: 1, y: 0 }); // show without animating
} else {
  runAnimations();
}
```
