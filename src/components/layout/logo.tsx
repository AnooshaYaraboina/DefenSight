import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * DefenSight brand assets.
 *
 * These render the supplied artwork itself rather than a redraw of it, so the
 * console, the login screen and the marketing pages all show an identical mark.
 *
 * The source is a 24-bit render with a lit near-black ground and no alpha, so
 * it could not sit on a nav bar as delivered. Two derivatives are generated
 * from its exact pixels:
 *
 *   public/brand/defensight-mark-v2.png     490×571  the D mark alone
 *   public/brand/defensight-lockup-v2.png   991×819  mark, wordmark and tagline
 *
 * The -v2 suffix is deliberate. The artwork was replaced in place once and
 * browsers kept serving the previous file from cache because the path had not
 * changed; versioning the filename makes a stale copy impossible.
 *
 * The matte was removed by unpremultiplying against black with two separate
 * thresholds — a high one to find the artwork's true bounds (the render has a
 * soft bloom behind it, which a single threshold mistook for content and padded
 * the crop with), and a low one for alpha so anti-aliased edges stay soft. No
 * pixel of the logo itself is altered.
 */

const MARK = { src: "/brand/defensight-mark-v2.png", w: 490, h: 571 };
const LOCKUP = { src: "/brand/defensight-lockup-v2.png", w: 991, h: 819 };

/** The D mark alone. Sized by height; width follows the artwork. */
export function Logo({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <Image
      src={MARK.src}
      alt=""
      aria-hidden="true"
      width={Math.round(size * (MARK.w / MARK.h))}
      height={size}
      priority
      className={cn("shrink-0", className)}
    />
  );
}

/**
 * The stacked lockup — mark over wordmark over tagline, exactly as supplied.
 * It is nearly square, so it suits centred placements (the login screen, a
 * footer, social cards) rather than a nav bar, where the mark plus the text
 * wordmark below reads better at small heights.
 */
export function LogoLockup({ className, size = 96 }: { className?: string; size?: number }) {
  return (
    <Image
      src={LOCKUP.src}
      alt="DefenSight — security beyond threats"
      width={Math.round(size * (LOCKUP.w / LOCKUP.h))}
      height={size}
      priority
      className={cn("shrink-0", className)}
    />
  );
}

/**
 * Text wordmark. Matches the artwork's split — "Defen" in the ink colour,
 * "Sight" in the brand — for the tight horizontal placements where the image
 * lockup would be too tall to read.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-tight text-ink", className)}>
      Defen<span className="text-brand">Sight</span>
    </span>
  );
}
