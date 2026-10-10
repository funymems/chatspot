import type { SVGProps } from "react";

/**
 * Custom duotone navigation icons (24×24, 1.75 stroke). The soft fill uses
 * currentColor at low opacity, so icons follow the active/inactive colour.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

const soft = { fill: "currentColor", fillOpacity: 0.18, stroke: "none" } as const;

export function DashboardIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="3.5" y="3.5" width="7" height="9" rx="2" {...soft} />
      <rect x="3.5" y="3.5" width="7" height="9" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="2" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="2" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="2" />
    </Base>
  );
}

export function AutomationsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="3.5" y="3.5" width="6" height="5" rx="1.5" {...soft} />
      <rect x="3.5" y="3.5" width="6" height="5" rx="1.5" />
      <rect x="14.5" y="9.5" width="6" height="5" rx="1.5" />
      <rect x="3.5" y="15.5" width="6" height="5" rx="1.5" />
      <path d="M9.5 6h2.5a2 2 0 0 1 2 2v1.5M9.5 18h2.5a2 2 0 0 0 2-2v-1.5" />
    </Base>
  );
}

export function AgentsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 7.5A3.5 3.5 0 0 1 8.5 4h7A3.5 3.5 0 0 1 19 7.5v5a3.5 3.5 0 0 1-3.5 3.5H11l-4 3.5V16a3 3 0 0 1-2-2.8z" {...soft} />
      <path d="M5 7.5A3.5 3.5 0 0 1 8.5 4h7A3.5 3.5 0 0 1 19 7.5v5a3.5 3.5 0 0 1-3.5 3.5H11l-4 3.5V16a3 3 0 0 1-2-2.8z" />
      <path d="M9.5 9v1.5M14.5 9v1.5" />
      <path d="M10 13c1.2.8 2.8.8 4 0" />
    </Base>
  );
}

export function ContactsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="9" cy="8" r="3.5" {...soft} />
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 19.5c.6-3 3-4.8 6-4.8s5.4 1.8 6 4.8" />
      <path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M17.5 14.9c1.8.6 3 2.2 3.4 4.6" />
    </Base>
  );
}

export function ConversationsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3.5 6a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 15.5 6v4A2.5 2.5 0 0 1 13 12.5H8l-3 2.5v-2.7A2.5 2.5 0 0 1 3.5 10z" {...soft} />
      <path d="M3.5 6a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 15.5 6v4A2.5 2.5 0 0 1 13 12.5H8l-3 2.5v-2.7A2.5 2.5 0 0 1 3.5 10z" />
      <path d="M18.5 9.5a2 2 0 0 1 2 2V15a2 2 0 0 1-1.5 1.9v2.6l-3-2.5H12a2 2 0 0 1-2-2v-.5" />
    </Base>
  );
}

export function TemplatesIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="7.5" y="3.5" width="13" height="13" rx="2.5" {...soft} />
      <rect x="7.5" y="3.5" width="13" height="13" rx="2.5" />
      <path d="M4.5 7.5v10a2 2 0 0 0 2 2h10" />
      <path d="M11 8h6M11 11.5h4" />
    </Base>
  );
}

export function AnalyticsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="4" y="13" width="3.5" height="7" rx="1" {...soft} />
      <rect x="10.25" y="9" width="3.5" height="11" rx="1" {...soft} />
      <rect x="16.5" y="5" width="3.5" height="15" rx="1" {...soft} />
      <path d="M4 20.5h16.5" />
      <path d="M5 10.5 10 6l3.5 2.5L19.5 3.5" />
      <path d="M16.5 3.5h3v3" />
    </Base>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.25" {...soft} />
      <circle cx="15" cy="7" r="2.25" />
      <circle cx="9" cy="17" r="2.25" {...soft} />
      <circle cx="9" cy="17" r="2.25" />
    </Base>
  );
}

export type NavIcon = (p: IconProps) => React.ReactElement;
