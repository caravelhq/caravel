// Component registry: maps ResourceRef.kind → view component.
// Phases 4–6 will add envelope, project, chat entries.

import type { Component } from "vue";
import DashboardView from "../views/DashboardView.vue";
import FileView from "../views/FileView.vue";
import ReportView from "../views/ReportView.vue";
import LegacyPageView from "../views/LegacyPageView.vue";
import type { ResourceRef } from "./refs";

const registry: Partial<Record<ResourceRef["kind"], Component>> = {
  dashboard: DashboardView,
  file: FileView,
  report: ReportView,
  legacy: LegacyPageView,
};

export function getViewComponent(kind: ResourceRef["kind"]): Component | null {
  return registry[kind] ?? null;
}
