# GSAP Extended Reference

## 6. Text Animations

### SplitText (Club GSAP) — recommended
```js
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(SplitText);

const split = new SplitText(".headline", { type: "chars,words,lines" });

gsap.from(split.chars, {
  opacity: 0,
  y: 80,
  rotateX: -90,
  stagger: 0.03,
  duration: 0.8,
  ease: "back.out(1.5)",
  transformOrigin: "0% 50% -50",
  scrollTrigger: { trigger: ".headline", start: "top 75%" },
});
```

### Text scramble with ScrambleTextPlugin
```js
gsap.to(".display", {
  duration: 2,
  scrambleText: {
    text: "WELCOME TO THE FUTURE",
    chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    revealDelay: 0.3,
    speed: 0.4,
  },
});
```

### Manual character split (no Club plugins)
```js
function splitChars(el) {
  const text = el.textContent;
  el.innerHTML = [...text].map(c =>
    c === " " ? " " : `<span class="char">${c}</span>`
  ).join("");
  return el.querySelectorAll(".char");
}

const chars = splitChars(document.querySelector(".title"));
gsap.from(chars, {
  opacity: 0,
  y: "100%",
  stagger: 0.04,
  duration: 0.7,
  ease: "power3.out",
  clipPath: "inset(0 0 100% 0)",  // mask reveal
});
```

---

## 7. FLIP Animations (First Last Invert Play)

Use FLIP for layout transitions — cards rearranging, modal expanding, list sorting.

```js
import { Flip } from "gsap/Flip";

// 1. Capture state BEFORE layout change
const state = Flip.getState(".card");

// 2. Make the DOM/layout change
container.appendChild(movingCard);
movingCard.classList.toggle("expanded");

// 3. Animate from old state to new
Flip.from(state, {
  duration: 0.6,
  ease: "power2.inOut",
  stagger: 0.05,
  absolute: true,       // removes from flow during animation
  scale: true,          // use scale instead of width/height
  onEnter: (els) => gsap.from(els, { opacity: 0, scale: 0.8 }),
  onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.8 }),
});
```

---

## 8. Draggable

```js
import { Draggable } from "gsap/Draggable";

Draggable.create(".card", {
  type: "x,y",
  bounds: ".container",
  inertia: true,         // requires InertiaPlugin (Club)
  edgeResistance: 0.65,
  onDragStart() { gsap.to(this.target, { scale: 1.05, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }); },
  onDragEnd() { gsap.to(this.target, { scale: 1, boxShadow: "none" }); },
  snap: {
    x: gsap.utils.snap(100),  // snap to 100px grid
  },
});
```

---

## 9. SVG Animations

### DrawSVG (stroke reveal)
```js
gsap.from(".path", {
  drawSVG: "0%",
  duration: 2,
  ease: "power2.inOut",
  stagger: 0.3,
});
```

### MorphSVG (shape morphing)
```js
gsap.to("#shape-a", {
  morphSVG: "#shape-b",
  duration: 1.5,
  ease: "power2.inOut",
});
```

### MotionPath (animate along path)
```js
gsap.to(".dot", {
  motionPath: {
    path: "#curve",
    align: "#curve",
    autoRotate: true,
    alignOrigin: [0.5, 0.5],
  },
  duration: 3,
  ease: "none",
  repeat: -1,
});
```

---

## 11. Micro-Interaction Patterns

### Magnetic button
```js
document.querySelectorAll(".magnetic").forEach(btn => {
  btn.addEventListener("mousemove", (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(btn, { x: x * 0.3, y: y * 0.3, duration: 0.3, ease: "power2.out" });
  });
  btn.addEventListener("mouseleave", () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
  });
});
```

### Custom cursor
```js
const cursor = document.querySelector(".cursor");
const cursorDot = document.querySelector(".cursor-dot");

window.addEventListener("mousemove", (e) => {
  gsap.to(cursor, { x: e.clientX, y: e.clientY, duration: 0.6, ease: "power3.out" });
  gsap.to(cursorDot, { x: e.clientX, y: e.clientY, duration: 0.1 });
});

document.querySelectorAll("a, button").forEach(el => {
  el.addEventListener("mouseenter", () => gsap.to(cursor, { scale: 2.5, opacity: 0.5, duration: 0.3 }));
  el.addEventListener("mouseleave", () => gsap.to(cursor, { scale: 1, opacity: 1, duration: 0.3 }));
});
```

### Hover card tilt
```js
document.querySelectorAll(".tilt-card").forEach(card => {
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width - 0.5;
    const yPct = (e.clientY - rect.top) / rect.height - 0.5;
    gsap.to(card, {
      rotateY: xPct * 20,
      rotateX: -yPct * 20,
      transformPerspective: 800,
      ease: "power2.out",
      duration: 0.4,
    });
  });
  card.addEventListener("mouseleave", () => {
    gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
  });
});
```

---

## 12. Page Transitions (SPA)

```js
// Exit animation
export async function pageExit() {
  return new Promise(resolve => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.to(".page-content", { opacity: 0, y: -20, duration: 0.4, ease: "power2.in" })
      .to(".page-overlay", { scaleX: 1, transformOrigin: "left", duration: 0.5, ease: "expo.inOut" }, "-=0.1");
  });
}

// Enter animation
export function pageEnter() {
  const tl = gsap.timeline();
  tl.to(".page-overlay", { scaleX: 0, transformOrigin: "right", duration: 0.5, ease: "expo.inOut" })
    .from(".page-content", { opacity: 0, y: 20, duration: 0.6, ease: "power3.out" }, "-=0.2");
}
```

---

## 14. Cinematic Animation Patterns

### Hero reveal sequence
```js
function heroReveal() {
  const tl = gsap.timeline({ delay: 0.3 });

  // Background
  tl.from(".hero-bg", { opacity: 0, scale: 1.1, duration: 1.5, ease: "power2.out" })
  // Eyebrow label
    .from(".eyebrow", { opacity: 0, letterSpacing: "0.5em", duration: 0.8, ease: "power3.out" }, "-=0.8")
  // Title chars
    .from(".title .char", {
      opacity: 0,
      y: 100,
      rotateX: -90,
      stagger: 0.02,
      duration: 0.9,
      ease: "expo.out",
      transformOrigin: "0% 50% -80",
    }, "-=0.5")
  // Subtitle
    .from(".subtitle", { opacity: 0, y: 20, duration: 0.7, ease: "power2.out" }, "-=0.3")
  // CTA
    .from(".cta-btn", { opacity: 0, y: 20, scale: 0.9, duration: 0.6, ease: "back.out(2)" }, "-=0.2")
  // Decorative elements
    .from(".deco-line", { scaleX: 0, duration: 1, ease: "expo.out", transformOrigin: "left" }, "-=0.8");

  return tl;
}
```

### Scroll-driven parallax multi-layer
```js
const layers = [
  { el: ".layer-bg", yPercent: 20 },
  { el: ".layer-mid", yPercent: 40 },
  { el: ".layer-fg", yPercent: 60 },
];

layers.forEach(({ el, yPercent }) => {
  gsap.to(el, {
    yPercent,
    ease: "none",
    scrollTrigger: {
      trigger: ".parallax-section",
      start: "top bottom",
      end: "bottom top",
      scrub: true,
    },
  });
});
```

### Counter animation
```js
gsap.to(".counter", {
  innerHTML: 2847,
  duration: 2,
  ease: "power2.out",
  snap: { innerHTML: 1 },
  scrollTrigger: { trigger: ".counter", start: "top 80%" },
});
```

---

## 16. Utility Functions

```js
// Clamp a value
gsap.utils.clamp(0, 100, value);

// Map range
gsap.utils.mapRange(0, 1, 0, 100, 0.5); // → 50

// Snap to nearest value
gsap.utils.snap(50, 130); // → 150

// Random in range
gsap.utils.random(10, 50); // → e.g. 32.4

// Wrap array index
gsap.utils.wrap([0, 1, 2], 4); // → 1

// Distribute values across elements
gsap.utils.distribute({ base: 0, amount: 1, ease: "power1.in" });

// Select and convert to array
gsap.utils.toArray(".items"); // NodeList → Array

// Pipe functions
const transform = gsap.utils.pipe(
  gsap.utils.clamp(0, 100),
  gsap.utils.mapRange(0, 100, 0, 1)
);
```
