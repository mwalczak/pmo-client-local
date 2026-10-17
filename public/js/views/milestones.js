// Milestones of the selected project.
import { api } from "../api.js";
import { app, isAdmin, currentProject } from "../state.js";
import { html, formDialog, confirmDialog, tableHtml, onActions, toast, diff, fmtDay } from "../ui.js";

const OPEN = new Set(["reported", "accepted", "in_progress"]);

function fields(m = {}) {
  const f = [
    { name: "name", label: "Name", required: true, value: m.name, placeholder: "v1.0" },
    { name: "description", label: "Description", type: "textarea", value: m.description ?? "", rows: 3 },
    { name: "due_on", label: "Due on", type: "date", value: m.due_on ?? "" },
  ];
  if (m.id) f.push({ name: "state", label: "State", type: "select", value: m.state, options: [["open", "Open"], ["closed", "Closed"]] });
  return f;
}

export default {
  label: "Milestones",
  usesProject: true,
  mount(root) {
    const project = currentProject();
    let state = "";
    let milestones = [];
    let counts = new Map();

    root.innerHTML = html`
      <div class="toolbar">
        <select class="input" data-state>
          <option value="">All milestones</option><option value="open">Open</option><option value="closed">Closed</option>
        </select>
        <span class="spacer"></span>
        ${isAdmin() ? html`<button class="btn primary" data-new>+ New milestone</button>` : ""}
      </div>
      <div data-list><p class="muted">Loading…</p></div>`;

    root.querySelector("[data-state]").addEventListener("change", (e) => { state = e.target.value; load(); });
    root.querySelector("[data-new]")?.addEventListener("click", () => formDialog({
      title: `New milestone in ${project.key}`,
      fields: fields(),
      submitLabel: "Create",
      onSubmit: async (v) => {
        await api.milestones.create(project.key, { name: v.name, description: v.description || null, due_on: v.due_on || null });
        toast(`Milestone ${v.name} created`);
        load();
      },
    }));

    async function load() {
      try {
        const [list, issues] = await Promise.all([
          api.milestones.list(project.key, state || undefined),
          api.issues.listAll(project.key).catch(() => []),
        ]);
        milestones = list;
        counts = new Map();
        for (const i of issues) {
          if (!i.milestone) continue;
          const c = counts.get(i.milestone.id) ?? { open: 0, total: 0 };
          c.total++;
          if (OPEN.has(i.status)) c.open++;
          counts.set(i.milestone.id, c);
        }
      } catch (err) {
        root.querySelector("[data-list]").innerHTML = html`<p class="error">${err.message}</p>`;
        return;
      }
      render();
    }

    function render() {
      const today = new Date().toISOString().slice(0, 10);
      root.querySelector("[data-list]").innerHTML = tableHtml(milestones, [
        { label: "Name", render: (m) => html`<b>${m.name}</b>${m.description ? html`<div class="muted small">${m.description}</div>` : ""}` },
        { label: "Due", render: (m) => html`<span class="${m.state === "open" && m.due_on && m.due_on < today ? "overdue" : ""}">${fmtDay(m.due_on)}</span>` },
        { label: "State", render: (m) => html`<span class="tag ${m.state === "open" ? "ok" : ""}">${m.state}</span>` },
        {
          label: "Issues",
          render: (m) => {
            const c = counts.get(m.id) ?? { open: 0, total: 0 };
            const pct = c.total ? Math.round(((c.total - c.open) / c.total) * 100) : 0;
            return html`<div class="progress" title="${pct}% closed"><span style="width:${pct}%"></span></div><span class="muted small">${c.open} open · ${c.total} total</span>`;
          },
        },
        {
          label: "", className: "actions",
          render: (m) => html`<button class="btn small" data-action="board">Board</button>${isAdmin() ? html`
            <button class="btn small" data-action="edit">Edit</button>
            <button class="btn small" data-action="toggle">${m.state === "open" ? "Close" : "Reopen"}</button>
            <button class="btn small danger" data-action="delete">Delete</button>` : ""}`,
        },
      ], "No milestones.");
    }

    onActions(root, {
      board: (i) => { app.boardMilestone = milestones[i].id; location.hash = "#/board"; },
      edit: async (i) => {
        let m;
        try { m = await api.milestones.get(milestones[i].id); } catch (err) { return toast(err.message, true); }
        formDialog({
          title: `Edit ${m.name}`,
          fields: fields(m),
          onSubmit: async (v) => {
            const patch = diff({ ...m, description: m.description ?? "", due_on: m.due_on ?? "" }, v);
            if ("due_on" in patch && patch.due_on === "") patch.due_on = null;
            if (!Object.keys(patch).length) return;
            await api.milestones.update(m.id, patch);
            toast("Milestone saved");
            load();
          },
        });
      },
      toggle: async (i) => {
        const m = milestones[i];
        try {
          await api.milestones.update(m.id, { state: m.state === "open" ? "closed" : "open" });
          load();
        } catch (err) {
          toast(err.message, true);
        }
      },
      delete: async (i) => {
        const m = milestones[i];
        if (!(await confirmDialog(`Delete milestone ${m.name}? Its issues stay, without a milestone.`))) return;
        try {
          await api.milestones.delete(m.id);
          toast("Milestone deleted");
          load();
        } catch (err) {
          toast(err.message, true);
        }
      },
    });

    load();
  },
};
