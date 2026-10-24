/**
 * Mock project data for the editor (spec 04).
 *
 * No API calls or persistence yet — the sidebar and dialogs operate on these
 * in-memory records only. Replace with real data access when the project API
 * lands.
 */
export interface Project {
  id: string;
  name: string;
  slug: string;
  /** True for shared/collaborator projects; false for projects the user owns. */
  isShared: boolean;
}

export const MOCK_PROJECTS: Project[] = [
  { id: "p-1", name: "Onboarding Flow", slug: "onboarding-flow", isShared: false },
  { id: "p-2", name: "Pricing Page Refresh", slug: "pricing-page-refresh", isShared: false },
  { id: "p-3", name: "Q4 Campaign", slug: "q4-campaign", isShared: false },
  { id: "s-1", name: "Design System Rollout", slug: "design-system-rollout", isShared: true },
  { id: "s-2", name: "Marketing Site Audit", slug: "marketing-site-audit", isShared: true },
];
