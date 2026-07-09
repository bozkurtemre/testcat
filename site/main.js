// testcat landing v2 — scroll choreography, no dependencies
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Headline word-mask reveal (weight animates 500 → 800 while lifting in). */
requestAnimationFrame(() =>
  requestAnimationFrame(() => document.querySelector(".hero-copy")?.classList.add("go")),
);

/* Reveal on view — once, staggered via --d. */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.16, rootMargin: "0px 0px -6% 0px" },
);
document.querySelectorAll(".reveal, .how-step").forEach((el) => io.observe(el));

/* Nav: glass after scroll + scrollspy for the active section. */
const nav = document.getElementById("nav");
const onScrollNav = () => nav.classList.toggle("scrolled", window.scrollY > 24);
onScrollNav();
window.addEventListener("scroll", onScrollNav, { passive: true });

const spyLinks = new Map(
  [...document.querySelectorAll("[data-spy]")].map((a) => [a.dataset.spy, a]),
);
const spy = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        spyLinks.forEach((a, id) => a.classList.toggle("active", id === e.target.id));
      }
    }
  },
  { rootMargin: "-30% 0px -60% 0px" },
);
["features", "how", "install"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) spy.observe(el);
});

/* Inertial scroll physics: values lerp toward their scroll-derived targets,
   so motion keeps a hint of weight after the wheel stops. */
if (!reduced) {
  const tiltEl = document.querySelector("[data-tilt]");
  const parallaxEls = [...document.querySelectorAll("[data-parallax]")].map((el) => ({
    el,
    speed: parseFloat(el.dataset.parallax || "0.05"),
    cur: 0,
  }));
  const tilt = { cur: 0 }; // 0 = tilted entry pose, 1 = settled flat

  const tick = () => {
    const vh = window.innerHeight;

    if (tiltEl) {
      const r = tiltEl.getBoundingClientRect();
      const target = Math.min(1, Math.max(0, 1 - (r.top - vh * 0.12) / (vh * 0.72)));
      tilt.cur += (target - tilt.cur) * 0.09;
      const rx = (1 - tilt.cur) * 9;
      const scale = 0.955 + tilt.cur * 0.045;
      const lift = (1 - tilt.cur) * 30;
      tiltEl.style.transform =
        `perspective(1300px) rotateX(${rx.toFixed(2)}deg) scale(${scale.toFixed(4)}) translateY(${lift.toFixed(1)}px)`;
    }

    for (const p of parallaxEls) {
      const r = p.el.getBoundingClientRect();
      const target = -(r.top + r.height / 2 - vh / 2) * p.speed;
      p.cur += (target - p.cur) * 0.08;
      p.el.style.transform = `translateY(${p.cur.toFixed(1)}px)`;
    }

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* Spotlight borders — cards glow under the cursor. */
if (matchMedia("(hover: hover)").matches) {
  document.querySelectorAll(".spot").forEach((el) => {
    el.addEventListener("pointermove", (ev) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${(((ev.clientX - r.left) / r.width) * 100).toFixed(2)}%`);
      el.style.setProperty("--my", `${(((ev.clientY - r.top) / r.height) * 100).toFixed(2)}%`);
    });
  });
}

/* Living details: fps badges drift, the running timer counts. */
if (!reduced) {
  const fpsEls = [...document.querySelectorAll(".fps")];
  setInterval(() => {
    for (const el of fpsEls) {
      const base = parseInt(el.dataset.fps, 10);
      const v = Math.max(1, base + Math.round((Math.random() - 0.5) * 4));
      el.textContent = `${v} fps`;
    }
  }, 1200);

  const timer = document.querySelector("[data-timer]");
  if (timer) {
    let s = parseInt(timer.dataset.timer, 10) || 0;
    setInterval(() => {
      s += 1;
      const m = String(Math.floor(s / 60)).padStart(2, "0");
      timer.textContent = `${m}:${String(s % 60).padStart(2, "0")}`;
    }, 1000);
  }
}

/* Copy buttons */
document.querySelectorAll(".copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy || "");
      btn.classList.add("ok");
      btn.textContent = "✓";
      setTimeout(() => {
        btn.classList.remove("ok");
        btn.textContent = "⧉";
      }, 1400);
    } catch {
      /* clipboard unavailable — text stays selectable */
    }
  });
});
