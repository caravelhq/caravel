import { onMounted, onBeforeUnmount, computed, watch, type Ref } from "vue";
import { useLiveStore, type ResourceSpec, type ResourceEntry } from "../stores/live";

/**
 * Binds a resource key on mount and unbinds on unmount.
 * Views never call fetch for live data — this composable is the only entry point.
 *
 * @param key   Stable cache key, e.g. 'state', 'attention', 'report:TSK-xxx'
 * @param spec  topics to subscribe to + fetch function
 * @returns     Computed ref to the current ResourceEntry (reactive)
 */
export function useResource(
  key: string | Ref<string>,
  spec: ResourceSpec
): { entry: ReturnType<typeof computed<ResourceEntry | undefined>> } {
  const live = useLiveStore();

  const resolvedKey = (): string =>
    typeof key === "string" ? key : key.value;

  onMounted(() => {
    live.bind(resolvedKey(), spec);
  });

  onBeforeUnmount(() => {
    live.unbind(resolvedKey());
  });

  // If key is a ref (e.g. a dynamic report id), rebind when it changes
  if (typeof key !== "string") {
    watch(key, (newKey, oldKey) => {
      if (oldKey) live.unbind(oldKey);
      live.bind(newKey, spec);
    });
  }

  const entryRef = computed(() => live.entry(resolvedKey()));

  return { entry: entryRef };
}
