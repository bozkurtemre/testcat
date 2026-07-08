import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type ReactNode, useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function PageReveal({
  identity,
  disabled = false,
  children,
}: {
  identity: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (disabled) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const root = rootRef.current;
      if (!root) return;

      const collectPanels = () => {
        const explicit = gsap.utils.toArray<HTMLElement>(
          "[data-page-reveal]",
          root,
        );
        const candidates = explicit.length
          ? explicit
          : gsap.utils.toArray<HTMLElement>(".ide-panel", root);

        return candidates.filter(
          (el) => !el.closest("[data-page-reveal-skip]"),
        );
      };

      const collectFreshPanels = () =>
        collectPanels().filter((el) => el.dataset.pageRevealed !== "true");

      const revealPanels = (panels: HTMLElement[]) => {
        if (!panels.length) return;
        for (const panel of panels) panel.dataset.pageRevealed = "true";

        gsap.fromTo(
          panels,
          { autoAlpha: 0, y: 18, scale: 0.985 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.65,
            delay: 0.04,
            ease: "power3.out",
            stagger: 0.055,
            clearProps: "transform,opacity,visibility",
          },
        );
      };

      let frame = 0;
      const resetAndReveal = () => {
        const panels = collectPanels();
        for (const panel of panels) delete panel.dataset.pageRevealed;
        gsap.killTweensOf(panels);
        gsap.set(panels, { autoAlpha: 0, y: 18, scale: 0.985 });
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = 0;
          revealPanels(collectFreshPanels());
        });
      };

      resetAndReveal();

      const observer = new MutationObserver(() => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = 0;
          revealPanels(collectFreshPanels());
        });
      });
      observer.observe(root, { childList: true, subtree: true });

      const scroller =
        root.querySelector<HTMLElement>("[data-page-scroll]") ?? undefined;
      gsap.utils.toArray<HTMLElement>(".tc-scroll-preview", root).forEach((el) => {
        gsap.fromTo(
          el,
          { scale: 0.9, autoAlpha: 0.48 },
          {
            scale: 1,
            autoAlpha: 1,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              scroller,
              start: "top 92%",
              end: "bottom 60%",
              scrub: true,
            },
          },
        );
      });

      return () => {
        observer.disconnect();
        if (frame) cancelAnimationFrame(frame);
      };
    },
    { scope: rootRef, dependencies: [identity, disabled] },
  );

  return (
    <div
      ref={rootRef}
      className={disabled ? "h-full min-h-0" : "tc-reveal-root h-full min-h-0"}
    >
      {children}
    </div>
  );
}
