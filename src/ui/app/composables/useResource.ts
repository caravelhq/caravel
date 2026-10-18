import { onMounted, onBeforeUnmount, onActivated, onDeactivated, computed, watch, type Ref, type ComputedRef } from "vue";
import { useLiveStore, type ResourceSpec, type ResourceEntry } from "../stores/live";

/**
 * Binds a resource key on mount and unbinds on unmount.
 * Views never call fetch for live data — this composable is the only entry point.
 *
 * @param key              Stable cache key, e.g. 'state', 'attention', 'envelope:TSK-xxx'
 * @param spec             topics to subscribe to + fetch function
 * @param opts.keepAliveAware  When true, also unbind in onDeactivated and rebind in onActivated
 *                             so deactivated KeepAlive views stop refetching (DEC-0029).
 * @returns                Computed ref to the current ResourceEntry (reactive)
 */
export function useResource(
  key: string | Ref<string>,
  spec: ResourceSpec,
  opts?: { keepAliveAware?: boolean }
): { entry: ComputedRef<ResourceEntry | undefined> } {
  const live = useLiveStore();

  const resolvedKey = (): string =>
    typeof key === "string" ? key : key.value;

  if (opts?.keepAliveAware) {
    // Inside KeepAlive: onMounted fires first, then onActivated fires on the same tick.
    // We track this to skip the double-bind on first mount.
    let skipNextActivated = false;

    onMounted(() => {
      skipNextActivated = true;
      live.bind(resolvedKey(), spec);
    });

    onActivated(() => {
      if (skipNextActivated) { skipNextActivated = false; return; }
      live.bind(resolvedKey(), spec);
    });

    onDeactivated(() => {
      skipNextActivated = false;
      live.unbind(resolvedKey());
    });

    onBeforeUnmount(() => {
      live.unbind(resolvedKey());
    });
  } else {
    onMounted(() => {
      live.bind(resolvedKey(), spec);
    });

    onBeforeUnmount(() => {
      live.unbind(resolvedKey());
    });
  }

  // If key is a ref (e.g. a dynamic taskId), rebind when it changes
  if (typeof key !== "string") {
    watch(key, (newKey, oldKey) => {
      if (oldKey) live.unbind(oldKey);
      live.bind(newKey, spec);
    });
  }

  const entryRef = computed(() => live.entry(resolvedKey()));

  return { entry: entryRef };
}
