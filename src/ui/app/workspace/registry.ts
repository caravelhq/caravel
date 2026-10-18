// Component registry: maps ResourceRef.kind → view component.
// report: retired as a tab kind in Phase 3.2 step 5; kept in refs.ts for URL parsing only.

import type { Component } from "vue";
import DashboardView from "../views/DashboardView.vue";
import EnvelopeView from "../views/EnvelopeView.vue";
import FileView from "../views/FileView.vue";
import LegacyPageView from "../views/LegacyPageView.vue";
import type { ResourceRef } from "./refs";

const registry: Partial<Record<ResourceRef["kind"], Component>> = {
  dashboard: DashboardView,
  envelope: EnvelopeView,
  file: FileView,
  legacy: LegacyPageView,
};

export function getViewComponent(kind: ResourceRef["kind"]): Component | null {
  return registry[kind] ?? null;
}
