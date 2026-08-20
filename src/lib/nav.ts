/**
 * Navigation model for the DefenSight console.
 *
 * Grouped by what an analyst is actually doing rather than by the order the
 * features were built — overview first, then the estate being defended, then
 * the controls defending it, then live operations.
 */
import type { Role } from "@/lib/engine/taxonomy";

export interface NavItem {
  href: string;
  label: string;
  /** lucide-react icon name, resolved in the sidebar component. */
  icon: string;
  description: string;
  /** Roles permitted to see this destination. Omitted means all roles. */
  roles?: Role[];
  /** Key of the live badge count this item displays, if any. */
  badge?: "activeThreats" | "openIncidents" | "pendingApprovals" | "unreadAlerts";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "LayoutDashboard",
        description: "Security posture across the AI estate",
      },
      {
        href: "/monitor",
        label: "Live Monitor",
        icon: "Activity",
        description: "Real-time AI request and event stream",
      },
      {
        href: "/analytics",
        label: "Analytics",
        icon: "ChartNoAxesCombined",
        description: "Trends, breakdowns and security reporting",
      },
    ],
  },
  {
    label: "AI Estate",
    items: [
      {
        href: "/applications",
        label: "Applications",
        icon: "AppWindow",
        description: "Registered AI applications and their posture",
      },
      {
        href: "/agents",
        label: "Agents",
        icon: "Bot",
        description: "Agent permissions, behaviour and risk",
      },
      {
        href: "/rag",
        label: "RAG Security",
        icon: "Library",
        description: "Documents, sources, vector stores and retrieval",
      },
      {
        href: "/tools",
        label: "Tool Gateway",
        icon: "Wrench",
        description: "Authorisation for every tool invocation",
        badge: "pendingApprovals",
      },
    ],
  },
  {
    label: "Defense",
    items: [
      {
        href: "/detections",
        label: "Detections",
        icon: "ScanSearch",
        description: "Detection engine output and tuning",
      },
      {
        href: "/guardrails",
        label: "Guardrails",
        icon: "ShieldCheck",
        description: "Input and output controls",
        roles: ["SECURITY_ADMIN", "SECURITY_ANALYST", "VIEWER"],
      },
      {
        href: "/data-protection",
        label: "Data Protection",
        icon: "Lock",
        description: "Sensitive data detection and policies",
      },
      {
        href: "/policies",
        label: "Policies",
        icon: "Scale",
        description: "Centralised security policy engine",
      },
      {
        href: "/risk",
        label: "Risk Engine",
        icon: "Gauge",
        description: "Scoring methodology and factor weights",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/threats",
        label: "Threats",
        icon: "Crosshair",
        description: "Detected threats by type and severity",
        badge: "activeThreats",
      },
      {
        href: "/incidents",
        label: "Incidents",
        icon: "Siren",
        description: "Investigation, attack chains and response",
        badge: "openIncidents",
      },
      {
        href: "/alerts",
        label: "Alerts",
        icon: "BellRing",
        description: "Real-time notifications for critical events",
        badge: "unreadAlerts",
      },
      {
        href: "/simulator",
        label: "Attack Simulator",
        icon: "FlaskConical",
        description: "Validate defensive controls against known attacks",
        roles: ["SECURITY_ADMIN", "SECURITY_ANALYST"],
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        href: "/assistant",
        label: "AI Assistant",
        icon: "Sparkles",
        description: "Ask questions about your security data",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/audit",
        label: "Audit Log",
        icon: "ScrollText",
        description: "Immutable record of every security action",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "Settings",
        description: "Users, roles and platform configuration",
        roles: ["SECURITY_ADMIN"],
      },
    ],
  },
];

/** Flatten to a lookup for breadcrumb and page-title resolution. */
export const NAV_INDEX: Record<string, NavItem> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.href, i]),
);

export function visibleNav(role: Role): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}
