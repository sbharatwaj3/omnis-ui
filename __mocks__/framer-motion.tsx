// __mocks__/framer-motion.tsx
// Lightweight framer-motion stub for jsdom/vitest environments.
// Replaces animated wrappers with plain HTML equivalents so axe-core
// can scan the rendered DOM without GSAP/layout-effect issues.

import React from "react";

// Forward all props to the corresponding HTML element.
function makeMotionComponent(tag: string) {
  // eslint-disable-next-line react/display-name
  return React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & Record<string, unknown>>(
    ({ children, ...props }, ref) => {
      // Strip framer-motion-specific props that are invalid on DOM nodes.
      const {
        initial,
        animate,
        exit,
        transition,
        variants,
        whileHover,
        whileTap,
        whileFocus,
        layout,
        layoutId,
        ...domProps
      } = props as Record<string, unknown>;

      void initial; void animate; void exit; void transition;
      void variants; void whileHover; void whileTap; void whileFocus;
      void layout; void layoutId;

      return React.createElement(tag, { ...domProps, ref } as React.HTMLAttributes<HTMLElement>, children);
    }
  );
}

export const motion = new Proxy(
  {},
  {
    get(_target, prop: string) {
      return makeMotionComponent(prop);
    },
  }
) as Record<string, ReturnType<typeof makeMotionComponent>>;

export function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export const useAnimation = () => ({
  start: () => Promise.resolve(),
  stop: () => {},
  set: () => {},
});

export const useMotionValue = (initial: unknown) => ({
  get: () => initial,
  set: () => {},
  onChange: () => () => {},
});

export const useTransform = (_value: unknown, _input: unknown, output: unknown[]) => ({
  get: () => output[0],
});

export const useSpring = (initial: unknown) => ({
  get: () => initial,
  set: () => {},
});
