/**
 * Small inline-SVG icon set for the Capture app, used in place of the
 * bootstrap-icons webfont (which the cloud dashboard uses fine, but
 * this app additionally registers a service worker for offline use -
 * an icon webfont is one more asset that can silently fail to paint if
 * it's ever fetched/cached out of step with the CSS that references it,
 * and the failure mode is invisible icons with no error, not a broken-
 * image box). Inline SVG has no separate file to load or cache: it's
 * part of the same JS bundle as everything else, so if the app loaded
 * at all, the icons are there.
 *
 * Every icon takes a `size` (px, default 20) and forwards `className` -
 * pass text-color utility classes (text-primary, text-white, etc.) and
 * `currentColor` picks them up, exactly like the webfont icons did.
 */
import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function base(props: IconProps) {
  const { size = 20, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function IconPersonPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}

export function IconClipboardCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5" />
      <path d="m9 13 2.2 2.2L16 10.5" />
    </svg>
  );
}

export function IconSync(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8" />
      <path d="M20 4v4h-4" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 16" />
      <path d="M4 20v-4h4" />
    </svg>
  );
}

export function IconWifi(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2 8.5a15.5 15.5 0 0 1 20 0" />
      <path d="M5.5 12.5a10.5 10.5 0 0 1 13 0" />
      <path d="M9 16.3a5.5 5.5 0 0 1 6 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconWifiOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2 8.5c1.9-1.7 4-2.9 6.3-3.6M22 8.5a15.6 15.6 0 0 0-4.7-3.1" />
      <path d="M5.5 12.5a10.5 10.5 0 0 1 4-2.3M18.5 12.5a10.6 10.6 0 0 0-2.6-1.9" />
      <path d="M9 16.3a5.5 5.5 0 0 1 6 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCloudUp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 18a4.5 4.5 0 0 1-.5-9 5.5 5.5 0 0 1 10.7-1.7A4 4 0 0 1 17 18H7Z" />
      <path d="M12 15V9M9.5 11.5 12 9l2.5 2.5" />
    </svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
    </svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
    </svg>
  );
}
