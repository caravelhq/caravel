// bulk.ts — multi-select bulk-close bar and checkbox handlers.
// Ported from client.js:4515–4642, 6232–6268.

export interface BulkSelected {
  [taskId: string]: { agent: string; defaultStatus: string };
}

export function updateGroupSelectAll(groupEl: Element | null): void {
  if (!groupEl) return;
  const allCb = groupEl.querySelector<HTMLInputElement>(".current-group-select-all");
  if (!allCb) return;
  const rowCbs = groupEl.querySelectorAll<HTMLInputElement>(".current-row-select");
  if (rowCbs.length === 0) return;
  let checkedCount = 0;
  rowCbs.forEach(cb => { if (cb.checked) checkedCount++; });
  if (checkedCount === 0) {
    allCb.checked = false;
    allCb.indeterminate = false;
  } else if (checkedCount === rowCbs.length) {
    allCb.checked = true;
    allCb.indeterminate = false;
  } else {
    allCb.checked = false;
    allCb.indeterminate = true;
  }
}

export function handleRowCheckboxChange(
  ev: Event,
  bulkSelected: BulkSelected,
  updateBulkBar: () => void
): void {
  const cb = ev.target as HTMLInputElement;
  if (!cb || cb.type !== "checkbox") return;

  if (cb.classList.contains("current-row-select")) {
    const taskId = cb.getAttribute("data-task-id") || "";
    const agent = cb.getAttribute("data-task-agent") || "";
    const defaultStatus = cb.getAttribute("data-task-default-status") || "cancelled";
    if (cb.checked) bulkSelected[taskId] = { agent, defaultStatus };
    else delete bulkSelected[taskId];
    updateBulkBar();
    updateGroupSelectAll(cb.closest("[data-project-key]"));
    return;
  }

  if (cb.classList.contains("current-group-select-all")) {
    const groupEl = cb.closest("[data-project-key]");
    const rowCbs = groupEl ? groupEl.querySelectorAll<HTMLInputElement>(".current-row-select") : [];
    rowCbs.forEach(rCb => {
      const rId = rCb.getAttribute("data-task-id") || "";
      const rAgent = rCb.getAttribute("data-task-agent") || "";
      const rStatus = rCb.getAttribute("data-task-default-status") || "cancelled";
      if (cb.checked) {
        bulkSelected[rId] = { agent: rAgent, defaultStatus: rStatus };
        rCb.checked = true;
      } else {
        delete bulkSelected[rId];
        rCb.checked = false;
      }
    });
    updateBulkBar();
  }
}

export function createBulkBar(
  tasksTreeEl: HTMLElement,
  getBulkSelected: () => BulkSelected,
  getMultiSelectActive: () => boolean,
  setMultiSelectActive: (v: boolean) => void,
  clearSelection: () => void,
  rerenderPicker: () => void,
  fetchTasks: () => void
): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "tasks-bulk-bar";
  bar.hidden = true;
  bar.innerHTML =
    '<span class="bulk-bar-count"></span>' +
    '<input type="text" class="bulk-bar-reason" placeholder="Shared reason (optional)…">' +
    '<button type="button" class="bulk-bar-close is-primary"></button>' +
    '<button type="button" class="bulk-bar-clear">Clear</button>' +
    '<button type="button" class="bulk-bar-done">Done</button>' +
    '<span class="bulk-bar-status"></span>';

  const closeBtn = bar.querySelector<HTMLButtonElement>(".bulk-bar-close");
  const clearBtn = bar.querySelector<HTMLButtonElement>(".bulk-bar-clear");
  const doneBtn = bar.querySelector<HTMLButtonElement>(".bulk-bar-done");
  const statusEl = bar.querySelector<HTMLElement>(".bulk-bar-status");
  const reasonEl = bar.querySelector<HTMLInputElement>(".bulk-bar-reason");

  async function submitBulkClose() {
    const selected = getBulkSelected();
    const ids = Object.keys(selected);
    if (ids.length === 0) return;
    const reason = (reasonEl ? reasonEl.value : "").trim();
    if (closeBtn) closeBtn.disabled = true;
    if (statusEl) { statusEl.textContent = "Closing…"; statusEl.className = "bulk-bar-status"; }
    let closed = 0, failed = 0;
    for (const id of ids) {
      const sel = selected[id];
      if (!sel) continue;
      try {
        const res = await fetch("/api/tasks/" + encodeURIComponent(id) + "/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: sel.agent, reason, status: sel.defaultStatus }),
        });
        const data = await res.json();
        if (data && data.ok) closed++;
        else failed++;
      } catch (_) { failed++; }
    }
    clearSelection();
    if (statusEl) {
      statusEl.textContent = failed > 0
        ? "Closed " + closed + " · " + failed + " failed."
        : "Closed " + closed + ".";
      statusEl.className = "bulk-bar-status is-ok";
    }
    if (closeBtn) closeBtn.disabled = false;
    fetchTasks();
  }

  if (closeBtn) closeBtn.addEventListener("click", submitBulkClose);
  if (clearBtn) clearBtn.addEventListener("click", () => { clearSelection(); rerenderPicker(); });
  if (doneBtn) doneBtn.addEventListener("click", () => {
    setMultiSelectActive(false);
    clearSelection();
    tasksTreeEl.classList.remove("is-multiselect-active");
    updateBar();
    rerenderPicker();
  });

  function updateBar() {
    const selected = getBulkSelected();
    const ids = Object.keys(selected);
    const multiActive = getMultiSelectActive();
    if (ids.length === 0 && !multiActive) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const countEl = bar.querySelector<HTMLElement>(".bulk-bar-count");
    if (countEl) countEl.textContent = ids.length > 0 ? ids.length + " selected" : "Select tasks";
    if (closeBtn) {
      closeBtn.textContent = ids.length > 0 ? "Close selected (" + ids.length + ")" : "";
      closeBtn.hidden = ids.length === 0;
    }
    if (clearBtn) clearBtn.hidden = ids.length === 0;
    if (statusEl) statusEl.textContent = "";
  }

  (bar as unknown as HTMLElement & { update: () => void }).update = updateBar;

  if (tasksTreeEl.parentNode) {
    tasksTreeEl.parentNode.insertBefore(bar, tasksTreeEl);
  }
  return bar;
}
