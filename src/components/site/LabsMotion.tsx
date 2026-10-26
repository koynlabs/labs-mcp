"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function LabsMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const node = root.current;
      if (!node) return;

      const bar = document.querySelector<HTMLElement>(".mkt-top");
      const applyBar = () => {
        const height = bar?.offsetHeight ?? 112;
        node.style.setProperty("--labs-bar", `${height}px`);
        return height;
      };
      applyBar();
      const onRefresh = () => applyBar();
      ScrollTrigger.addEventListener("refreshInit", onRefresh);

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const narrow = window.matchMedia("(max-width: 799px)").matches;
      if (reduce) {
        return () => ScrollTrigger.removeEventListener("refreshInit", onRefresh);
      }

      const hero = gsap.timeline({ defaults: { ease: "power3.out" } });
      hero
        .from(".labs-hero .wordmark", { y: 16, autoAlpha: 0, duration: 0.45 }, 0)
        .from(".labs-hero .eyebrow", { y: 16, autoAlpha: 0, duration: 0.4 }, 0.08)
        .from(".labs-hero h1", { y: 48, autoAlpha: 0, duration: 0.8 }, 0.14)
        .from(".labs-hero .lede", { y: 24, autoAlpha: 0, duration: 0.55 }, 0.26)
        .from(".labs-hero .hero-actions", { y: 16, autoAlpha: 0, duration: 0.45 }, 0.36)
        .from(".labs-hero .term", { x: narrow ? 0 : 64, y: narrow ? 24 : 0, autoAlpha: 0, duration: 0.9 }, 0.12);

      gsap.to(".labs-hero .labs-copy", {
        y: -64,
        ease: "none",
        scrollTrigger: {
          trigger: ".labs-hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
      gsap.to(".labs-hero .labs-aside", {
        y: -24,
        ease: "none",
        scrollTrigger: {
          trigger: ".labs-hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      const shift = 72;
      gsap.from(".labs-connect .labs-copy", {
        y: 48,
        autoAlpha: 0,
        ease: "none",
        scrollTrigger: {
          trigger: ".labs-connect",
          start: "top bottom",
          end: "top 40%",
          scrub: 0.7,
        },
      });
      gsap.from(".labs-trust .labs-copy", {
        y: 48,
        autoAlpha: 0,
        ease: "none",
        scrollTrigger: {
          trigger: ".labs-trust",
          start: "top bottom",
          end: "top 40%",
          scrub: 0.7,
        },
      });
      gsap.from(".labs-connect .labs-stack article", {
        x: (index: number) => (narrow ? 0 : index === 0 ? -shift : shift),
        y: narrow ? 28 : 0,
        autoAlpha: 0,
        ease: "none",
        scrollTrigger: {
          trigger: ".labs-connect",
          start: "top bottom",
          end: "top 32%",
          scrub: 0.7,
        },
      });
      gsap.from(".labs-band", {
        x: narrow ? 0 : shift,
        y: narrow ? 24 : 0,
        autoAlpha: 0,
        stagger: 0.08,
        ease: "none",
        scrollTrigger: {
          trigger: ".labs-trust",
          start: "top bottom",
          end: "top 30%",
          scrub: 0.7,
        },
      });

      if (narrow) {
        return () => ScrollTrigger.removeEventListener("refreshInit", onRefresh);
      }

      const pins = gsap.utils.toArray<HTMLElement>(".labs-pin", node);
      pins.forEach((pin, index) => {
        const track = pin.querySelector<HTMLElement>(".labs-track");
        const windowEl = pin.querySelector<HTMLElement>(".labs-window");
        const step = pin.querySelector<HTMLElement>(".labs-step");
        const fill = pin.querySelector<HTMLElement>(".labs-progress span");
        if (!track || !windowEl) return;
        const labels = gsap.utils.toArray<HTMLElement>(".labs-panel", pin).map((panel) => panel.dataset.label ?? "");
        if (labels.length < 2) return;
        const distance = () => Math.max(0, track.scrollWidth - windowEl.clientWidth);
        let shown = 0;
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: pin,
            start: () => `top ${applyBar()}px`,
            end: () => `+=${Math.max(window.innerHeight * (labels.length - 1) * 0.72, distance())}`,
            pin: true,
            scrub: 0.65,
            snap: {
              snapTo: 1 / (labels.length - 1),
              duration: { min: 0.15, max: 0.4 },
              ease: "power1.inOut",
            },
            invalidateOnRefresh: true,
            refreshPriority: pins.length - index,
            onUpdate: (self) => {
              const next = Math.round(self.progress * (labels.length - 1));
              if (step && next !== shown) {
                shown = next;
                step.textContent = labels[next] ?? labels[0];
              }
            },
          },
        });
        timeline.to(track, { x: () => -distance(), ease: "none" }, 0);
        if (fill) timeline.fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: "none" }, 0);
      });

      return () => ScrollTrigger.removeEventListener("refreshInit", onRefresh);
    },
    { scope: root },
  );

  return (
    <div ref={root} className="labs-motion">
      {children}
    </div>
  );
}
