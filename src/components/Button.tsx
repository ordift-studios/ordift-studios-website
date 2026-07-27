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
    return (
      <Link href={href} className={classes} aria-disabled={disabled}>
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
