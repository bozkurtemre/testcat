// testcat landing — scroll choreography (no dependencies)
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Reveal on view — elements fade/slide in once, staggered via --d. */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.18, rootMargin: "0px 0px -6% 0px" },
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* Nav switches to blurred glass after leaving the top. */
const nav = document.getElementById("nav");
const onScrollNav = () => nav.classList.toggle("scrolled", window.scrollY > 24);
onScrollNav();
window.addEventListener("scroll", onScrollNav, { passive: true });

/* Apple-style scroll physics: hero shot eases from a slight zoom to rest;
   [data-parallax] visuals drift against the scroll. */
if (!reduced) {
  const zoomEl = document.querySelector("[data-zoom]");
  const parallaxEls = [...document.querySelectorAll("[data-parallax]")];
  let ticking = false;

  const frame = () => {
    ticking = false;
    const vh = window.innerHeight;

    if (zoomEl) {
      const r = zoomEl.getBoundingClientRect();
      // 0 when the shot enters, 1 when its top reaches 20% of the viewport
      const p = Math.min(1, Math.max(0, 1 - (r.top - vh * 0.2) / (vh * 0.8)));
      const scale = 0.94 + p * 0.06;
      const lift = (1 - p) * 26;
      zoomEl.style.transform = `scale(${scale.toFixed(4)}) translateY(${lift.toFixed(1)}px)`;
    }

    for (const el of parallaxEls) {
      const speed = parseFloat(el.dataset.parallax || "0.05");
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2 - vh / 2;
      el.style.transform = `translateY(${(-mid * speed).toFixed(1)}px)`;
    }
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  frame();
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
      /* clipboard unavailable — leave the text selectable */
    }
  });
});
