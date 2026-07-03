"use client";
// omnis-ui/components/settings-animated-shell.tsx
// Framer-motion entrance animation wrapper for the Settings page.
//
// The Settings page is an RSC. This thin client island wraps just the
// page header + section heading so we get the institutional fade-in
// without converting the whole route to "use client".
//
// Animation spec (animation-standards.md):
//   - Page header: subtle opacity + Y translate on mount
//   - Section cards / children: staggered fade-in via variants

import { motion } from "framer-motion";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "tween" as const, ease: "easeOut" as const, duration: 0.3 },
  },
};

interface SettingsAnimatedShellProps {
  children: React.ReactNode;
}

export function SettingsAnimatedShell({ children }: SettingsAnimatedShellProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="contents"
    >
      {children}
    </motion.div>
  );
}

export function SettingsAnimatedItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={itemVariants}>
      {children}
    </motion.div>
  );
}
