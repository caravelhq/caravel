// Component registry: maps ResourceRef.kind → view component.
// Phases 4–6 will add envelope, project, chat entries.

import type { Component } from "vue";
import FileView from "../views/FileView.vue";
import ReportView from "../views/ReportView.vue";
import LegacyPageView from "../views/LegacyPageView.vue";
import DashboardPage from "../pages/DashboardPage.vue";
import type { ResourceRef } from "./refs";

// The DashboardView (kind:'dashboard') still uses DashboardPage until Phase 3 step 6.
const registry: Partial<Record<ResourceRef["kind"], Component>> = {
  dashboard: DashboardPage,
  file: FileView,
  report: ReportView,
  legacy: LegacyPageView,
};

export function getViewComponent(kind: ResourceRef["kind"]): Component | null {
  return registry[kind] ?? null;
}
