// Kanban board: one column per status, drag a card to change its status.
import { api } from "../api.js";
import { app, PRIORITIES, STATUSES, canTriage, currentProject, statusLabel, typeLabel, platformLabel, typeOptions } from "../state.js";
import { html, toast } from "../ui.js";
import { openIssue, newIssueDialog } from "./issue.js";

export default {
  label: "Board",
  usesProject: true,
  mount(root) {
    const project = currentProject();
    const filters = { q: "", type: "", priority: "", milestone: app.boardMilestone ?? "", platform: "" };
    app.boardMilestone = null;
    let issues = [];
    let milestones = [];

    root.innerHTML = html`
      <div class="toolbar">
        <input class="input" data-f="q" type="search" placeholder="Filter cards…">
        <select class="input" data-f="type"><option value="">All types</option>${typeOptions(project).map(([id, l]) => html`<option value="${id}">${l}</option>`)}</select>
        <select class="input" data-f="priority"><option value="">All priorities</option>${PRIORITIES.map((p) => html`<option>${p}</option>`)}</select>
        <select class="input" data-f="milestone"><option value="">All milestones</option></select>
        ${project.platforms.length ? html`<select class="input" data-f="platform"><option value="">All platforms</option>${project.platforms.map((p) => html`<option value="${p.id}">${p.label}</option>`)}</select>` : ""}
        <button class="btn" data-refresh>↻ Refresh</button>
        <span class="spacer"></span>
        <span class="muted" data-count></span>
        <button class="btn primary" data-new>+ New issue</button>
      </div>
      <div class="board"></div>`;
    const board = root.querySelector(".board");

    root.querySelectorAll("[data-f]").forEach((input) => {
      input.addEventListener("input", () => { filters[input.dataset.f] = input.value.trim(); render(); });
    });
    root.querySelector("[data-refresh]").addEventListener("click", load);
    root.querySelector("[data-new]").addEventListener("click", () =>
      newIssueDialog(project, milestones, { onCreated: (i) => { issues.unshift(i); render(); } }));

    async function load() {
      root.querySelector("[data-count]").textContent = "Loading…";
      try {
        [issues, milestones] = await Promise.all([
          api.issues.listAll(project.key, { sort: "priority" }),
          api.milestones.list(project.key).catch(() => []),
        ]);
      } catch (err) {
        root.querySelector("[data-count]").textContent = "";
        return toast(`Failed to load issues: ${err.message}`, true);
      }
      const sel = root.querySelector('[data-f="milestone"]');
      sel.innerHTML = html`<option value="">All milestones</option><option value="none">No milestone</option>${milestones.map((m) =>
        html`<option value="${m.id}">${m.name}${m.state === "closed" ? " (closed)" : ""}</option>`)}`;
      sel.value = filters.milestone;
      render();
    }

    function visible() {
      const q = filters.q.toLowerCase();
      return issues.filter((i) =>
        (!filters.type || i.type === filters.type) &&
        (!filters.priority || i.priority === filters.priority) &&
        (!filters.platform || i.platform === filters.platform) &&
        (!filters.milestone || (filters.milestone === "none" ? !i.milestone : i.milestone?.id === filters.milestone)) &&
        (!q || `${i.key} ${i.title} ${i.description ?? ""}`.toLowerCase().includes(q)));
    }

    const card = (i) => html`<article class="card" data-key="${i.key}" draggable="${canTriage()}" style="--prio: var(--${i.priority.toLowerCase()})">
      <span class="key">${i.key}</span>
      <div class="title">${i.title}</div>
      <div class="meta">
        <span class="prio">${i.priority}</span>
        <span class="tag">${typeLabel(project, i.type)}</span>
        ${i.platform ? html`<span class="tag">${platformLabel(project, i.platform)}</span>` : ""}
        ${i.milestone ? html`<span class="tag">◆ ${i.milestone.name}</span>` : ""}
        ${i.private ? html`<span class="tag">private</span>` : ""}
        ${i.duplicate_of ? html`<span>→ ${i.duplicate_of}</span>` : ""}
        ${i.comment_count ? html`<span class="comment-count" title="${i.comment_count} comment${i.comment_count === 1 ? "" : "s"}">💬 ${i.comment_count}</span>` : ""}
      </div>
    </article>`;

    function render() {
      const list = visible();
      root.querySelector("[data-count]").textContent =
        list.length === issues.length ? `${issues.length} issues` : `${list.length} of ${issues.length} issues`;
      board.innerHTML = html`${STATUSES.map((s) => {
        const col = list.filter((i) => i.status === s.id);
        return html`<section class="column" data-status="${s.id}">
          <h2><span>${s.label}</span><span>${col.length}</span></h2>
          <div class="cards">${col.map(card)}</div>
        </section>`;
      })}`;
    }

    function applyChange(updated, deletedKey) {
      if (deletedKey) issues = issues.filter((i) => i.key !== deletedKey);
      else issues = issues.map((i) => (i.key === updated.key ? updated : i));
      render();
    }

    board.addEventListener("click", (e) => {
      const c = e.target.closest(".card");
      if (c) openIssue(c.dataset.key, { onChange: applyChange });
    });

    // drag & drop
    let dragKey = null;
    const clearTargets = () => board.querySelectorAll(".drop-target").forEach((c) => c.classList.remove("drop-target"));
    board.addEventListener("dragstart", (e) => {
      const c = e.target.closest(".card");
      if (!c) return;
      dragKey = c.dataset.key;
      c.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragKey);
    });
    board.addEventListener("dragend", () => { clearTargets(); dragKey = null; });
    board.addEventListener("dragover", (e) => {
      if (!dragKey) return;
      // Scroll the board while a card is held near its left/right edge.
      const { left, right } = board.getBoundingClientRect();
      const edge = 80;
      if (e.clientX > right - edge) board.scrollLeft += 20;
      else if (e.clientX < left + edge) board.scrollLeft -= 20;
      const col = e.target.closest(".column");
      if (!col) return;
      e.preventDefault();
      if (!col.classList.contains("drop-target")) { clearTargets(); col.classList.add("drop-target"); }
    });
    board.addEventListener("drop", (e) => {
      const col = e.target.closest(".column");
      if (!col || !dragKey) return;
      e.preventDefault();
      move(dragKey, col.dataset.status);
    });

    async function move(key, status) {
      const issue = issues.find((i) => i.key === key);
      if (!issue || issue.status === status) return;
      const body = { status };
      if (status === "duplicate") {
        const original = prompt(`${key} is a duplicate of which issue? (e.g. ${project.key}-1)`)?.trim().toUpperCase();
        if (!original) return;
        body.duplicate_of = original;
      }
      const prev = { ...issue };
      Object.assign(issue, { status, duplicate_of: body.duplicate_of ?? null });
      render();
      board.querySelector(`.card[data-key="${CSS.escape(key)}"]`)?.classList.add("saving");
      try {
        Object.assign(issue, await api.issues.update(key, body));
        toast(`${key} → ${statusLabel(status)}`);
      } catch (err) {
        Object.assign(issue, prev);
        toast(`Couldn't move ${key}: ${err.message}`, true);
      }
      render();
    }

    load();
  },
};
