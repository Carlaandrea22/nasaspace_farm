"use client";

import { gsap } from "gsap";
import { useEffect, useRef, type ReactNode } from "react";

// Adapted from React Bits FadeContent, David Haz. See REACT-BITS-LICENSE.md.
// A single state-triggered fade keeps the explanation readable and focus stable.
export function FadeContent({ children, revision }: { children: ReactNode; revision: string }) {
  const element = useRef<HTMLDivElement>(null);
  const previous = useRef(revision);

  useEffect(() => {
    if (previous.current === revision) return;
    previous.current = revision;
    const node = element.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(node, { opacity: 0.65 }, { opacity: 1, duration: 0.2, clearProps: "opacity" });
    return () => { tween.kill(); gsap.set(node, { clearProps: "opacity" }); };
  }, [revision]);

  return <div ref={element}>{children}</div>;
}
