/**
 * <TrustedByMarquee />
 *
 * A self-contained, drop-in React + TypeScript component that renders an
 * infinite horizontally-scrolling "Trusted by" / "Powered by" logo belt,
 * plus an optional centerpiece logo (defaults to AWS) underneath a
 * "Powered by" eyebrow label.
 *
 * Originally extracted from a Saudi-market workforce SaaS where it lived
 * on the login screen below the sign-in form. RTL-aware: when isRtl is
 * true the marquee scrolls in the opposite direction and the eyebrow
 * label uses the larger Arabic-friendly type size.
 *
 * ──────────────────────────────────────────────────────────────────────
 *   ZERO-CONFIG ASSETS
 * ──────────────────────────────────────────────────────────────────────
 * Every logo URL below points at a public CDN (simpleicons.org). Nothing
 * needs to be downloaded into /public. If you would rather use locally
 * hosted brand SVGs, just swap the `url` strings.
 *
 * ──────────────────────────────────────────────────────────────────────
 *   DEPENDENCIES
 * ──────────────────────────────────────────────────────────────────────
 *  - React 18+
 *  - Tailwind CSS (the component uses utility classes; no tailwind.config
 *    changes needed — the @keyframes are inlined via a <style> tag inside
 *    the component itself).
 *
 * ──────────────────────────────────────────────────────────────────────
 *   USAGE
 * ──────────────────────────────────────────────────────────────────────
 *   import { TrustedByMarquee } from "./trusted-by-marquee";
 *
 *   <TrustedByMarquee
 *     isRtl={i18n.language === "ar"}
 *     poweredByLabel={{ en: "Powered by", ar: "مدعوم بواسطة" }}
 *   />
 *
 * Pass `logos={[...]}` to override the default list, or `centerpiece={null}`
 * to hide the AWS badge underneath.
 */

import React from "react";

export type MarqueeLogo = {
  /** Display name, used for alt text and the <img title> tooltip. */
  name: string;
  /** Image URL (any format the browser can render — SVG/PNG/WebP). */
  url: string;
  /**
   * Vertical pixel nudge — some logos optically sit too high or too low
   * inside their slot. Defaults to 0.
   */
  nudge?: number;
  /**
   * Visual scale multiplier — some logos render too small at the
   * standard h-12 slot height (Microsoft, Google's "G", etc).
   * Defaults to 1.
   */
  scale?: number;
};

export type Centerpiece = {
  name: string;
  url: string;
};

type Props = {
  /** Right-to-left layout flag. Flips the scroll direction. */
  isRtl?: boolean;
  /**
   * Override the default logo list. Defaults to a 10-brand set
   * (Google, Apple, Microsoft, Amazon, Walmart, Cisco, HP,
   * DocuSign, Yahoo, Honeywell).
   */
  logos?: MarqueeLogo[];
  /**
   * Optional centerpiece badge rendered under a "Powered by" eyebrow.
   * Pass `null` to hide it entirely. Defaults to AWS.
   */
  centerpiece?: Centerpiece | null;
  /** Eyebrow label above the centerpiece. */
  poweredByLabel?: { en: string; ar: string };
  /** Seconds for one full marquee loop. Defaults to 40. */
  durationSeconds?: number;
  /** Extra className on the outer wrapper. */
  className?: string;
};

const DEFAULT_LOGOS: MarqueeLogo[] = [
  { name: "Google",    url: "https://cdn.simpleicons.org/google/4285F4",     scale: 1.2 },
  { name: "Apple",     url: "https://cdn.simpleicons.org/apple/A2AAAD" },
  { name: "Microsoft", url: "https://cdn.simpleicons.org/microsoft/00A4EF",  scale: 1.2 },
  { name: "Amazon",    url: "https://cdn.simpleicons.org/amazon/FF9900",     nudge: 4 },
  { name: "Walmart",   url: "https://cdn.simpleicons.org/walmart/0071CE" },
  { name: "Cisco",     url: "https://cdn.simpleicons.org/cisco/1BA0D7" },
  { name: "HP",        url: "https://cdn.simpleicons.org/hp/0096D6" },
  { name: "DocuSign",  url: "https://cdn.simpleicons.org/docusign/FFCC22" },
  { name: "Yahoo",     url: "https://cdn.simpleicons.org/yahoo/6001D2" },
  { name: "Honeywell", url: "https://cdn.simpleicons.org/honeywell/EE3124" },
];

const DEFAULT_CENTERPIECE: Centerpiece = {
  name: "Amazon Web Services",
  url: "https://cdn.simpleicons.org/amazonaws/FF9900",
};

export function TrustedByMarquee({
  isRtl = false,
  logos = DEFAULT_LOGOS,
  centerpiece = DEFAULT_CENTERPIECE,
  poweredByLabel = { en: "Powered by", ar: "مدعوم بواسطة" },
  durationSeconds = 40,
  className = "",
}: Props) {
  const renderLogos = (keyPrefix: string) =>
    logos.map((logo, i) => (
      <div
        key={`${keyPrefix}-${i}`}
        className="group flex items-center justify-center opacity-50 hover:opacity-100 transition-all duration-200 select-none shrink-0 w-28 h-12 mx-2"
      >
        <img
          src={logo.url}
          alt={logo.name}
          title={logo.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{
            transform: [
              logo.scale ? `scale(${logo.scale})` : "",
              logo.nudge ? `translateY(${logo.nudge}px)` : "",
            ].filter(Boolean).join(" ") || undefined,
          }}
          className="max-w-full max-h-full w-auto h-auto object-contain grayscale group-hover:grayscale-0 transition-all duration-200"
        />
      </div>
    ));

  const animationName = isRtl ? "tbm-scroll-rtl" : "tbm-scroll-ltr";

  return (
    <div className={`mt-6 flex flex-col items-center justify-center gap-4 ${className}`}>
      {/* ─── Sliding logo belt ─── */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)",
        }}
      >
        <style>{`
          @keyframes tbm-scroll-ltr {
            from { transform: translateX(0); }
            to   { transform: translateX(-50%); }
          }
          @keyframes tbm-scroll-rtl {
            from { transform: translateX(-50%); }
            to   { transform: translateX(0); }
          }
          .tbm-track:hover { animation-play-state: paused; }
          @media (prefers-reduced-motion: reduce) {
            .tbm-track { animation: none !important; }
          }
        `}</style>
        <div
          className="tbm-track flex w-max"
          style={{
            animation: `${animationName} ${durationSeconds}s linear infinite`,
          }}
        >
          {/* Render the list TWICE back-to-back so the loop is seamless. */}
          {renderLogos("a")}
          {renderLogos("b")}
        </div>
      </div>

      {/* ─── Optional "Powered by" centerpiece ─── */}
      {centerpiece && (
        <div className="flex flex-col items-center justify-center gap-3" data-testid="text-powered-by">
          <span
            className={`text-muted-foreground/70 uppercase tracking-widest font-semibold ${
              isRtl ? "text-sm" : "text-xs"
            }`}
          >
            {isRtl ? poweredByLabel.ar : poweredByLabel.en}
          </span>
          <img
            src={centerpiece.url}
            alt={centerpiece.name}
            className="h-12 w-auto opacity-70 hover:opacity-100 transition-opacity duration-200 select-none"
            draggable={false}
            data-testid="img-powered-by-logo"
          />
        </div>
      )}
    </div>
  );
}

export default TrustedByMarquee;
