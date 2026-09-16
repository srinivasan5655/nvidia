import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconCloudRain(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 16.5A4.5 4.5 0 0 1 8 7.6 5.5 5.5 0 0 1 18.6 9 4 4 0 0 1 18 17H7.5" />
      <path d="M9 19v1M13 19v1.5M17 19v1" />
    </svg>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 4.5 5.5v5.2c0 4.6 3.1 8.5 7.5 9.8 4.4-1.3 7.5-5.2 7.5-9.8V5.5L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 1 1 13 0c0 5.6-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function IconClipboardCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="m9.5 13 1.8 1.8 3.2-3.6" />
    </svg>
  );
}

export function IconHandRaised(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11.5V6a1.5 1.5 0 0 1 3 0v8.5" />
      <path d="M8 12.5V13c0 4.4 2.4 8 6 8s6-2.6 6-7v-2.5" />
      <path d="M8 12.5c-1.2-.9-2.6-.6-3.2.4-.6 1 .1 2 1.2 2.7L8 17" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M18 16v-5a6 6 0 0 0-12 0v5l-1.5 2h15L18 16Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconMap(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h10M17 6h3M4 12h3M10 12h10M4 18h13M20 18h0" />
      <circle cx="14" cy="6" r="2" />
      <circle cx="7" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </svg>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconGauge(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21a9 9 0 1 1 9-9" />
      <path d="M12 12 16 8" />
      <path d="M12 12v.01" />
      <path d="M6 12H5M8 6.5 7.3 5.7M19 12h-1" />
    </svg>
  );
}

export function IconFileText(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </svg>
  );
}

export function IconCommand(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 22V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v18" />
      <path d="M15 22V11a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11" />
      <path d="M8 6h2M8 10h2M8 14h2M8 18h2" />
    </svg>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function IconLogOut(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function IconChevronUpDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

export function IconFlask(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 2v6.5L4.5 17a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 8.5V2" />
      <path d="M9 2h6" />
      <path d="M7.5 14h9" />
    </svg>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}

export function IconHeartPulse(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h4l2-4 3 8 2-5h7" />
      <path d="M12 20s-6.5-4-9-8.2C1.3 8.4 2.6 5 6 5c1.8 0 3 1 4 2.3C11 6 12.2 5 14 5c3.4 0 4.7 3.4 3 6.8-2.5 4.2-9 8.2-9 8.2Z" />
    </svg>
  );
}

export function IconDollar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2v20" />
      <path d="M17 6.5c0-1.9-2.2-3.5-5-3.5S7 4.6 7 6.5 9.2 9.5 12 9.5s5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" />
    </svg>
  );
}

export function IconMessageSquare(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4h16v12H8l-4 4V4Z" />
      <path d="M8 9h8M8 12.5h5" />
    </svg>
  );
}

export function IconGitBranch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 7v10" />
      <path d="M6 15c0-4 4-6 10-6.5" />
    </svg>
  );
}

export function IconRobot(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2v3" />
      <circle cx="12" cy="3.5" r="1.2" fill="currentColor" stroke="none" />
      <rect x="5" y="7" width="14" height="12" rx="3" />
      <path d="M5 12H3M21 12h-2" />
      <circle cx="9.5" cy="13" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="1.3" fill="currentColor" stroke="none" />
      <path d="M9 17h6" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
