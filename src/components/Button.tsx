import Link from "next/link";
import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "dark";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover",
  secondary:
    "border border-ordift-ink/30 text-ordift-ink hover:border-ordift-ink/60",
  dark: "bg-ordift-navy-950 text-white hover:bg-ordift-navy-900",
};

// min-h-11 (44px) satisfies the 44x44 touch-target minimum from
// TYPOGRAPHY.md's accessibility notes regardless of the 14px label size.
// focus-visible ring matches the gold ring already used on form inputs
// (e.g. BookingForm) -- buttons/links had no visible keyboard-focus
// indicator at all before this, relying entirely on browser default.
const BASE =
  "inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold focus-visible:ring-offset-2";

type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
};

export default function Button({
  children,
  variant = "primary",
  href,
  onClick,
  type = "button",
  disabled = false,
  className = "",
}: ButtonProps) {
  const classes = `${BASE} ${VARIANT_CLASSES[variant]} ${
    disabled ? "opacity-50 pointer-events-none" : ""
  } ${className}`;

  if (href) {
    // `pointer-events-none` above only blocks mouse activation — a
    // disabled <Link> is still focusable and a keyboard Enter/Space
    // press would still navigate it, since aria-disabled is purely
    // informational to assistive tech and doesn't stop native anchor
    // behavior. A disabled action must be non-interactive for every
    // input method, not just the mouse, so it renders as a plain
    // <span> instead — no href, no tab stop, nothing to activate.
    if (disabled) {
      return (
        <span className={classes} aria-disabled="true">
          {children}
        </span>
      );
    }
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}
