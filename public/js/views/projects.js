// Projects: list, create, configure issue types and platforms.
import { api } from "../api.js";
import { app, isAdmin, reloadProjects } from "../state.js";
import { html, formDialog, tableHtml, onActions, toast, diff, fmtDate, formatChoices, parseChoices } from "../ui.js";

const choicesHint = "One per line as id: Label (the label is optional).";
const norm = (list) => parseChoices(formatChoices(list));

export default {
  label: "Projects",
  mount(root) {
    root.innerHTML = html`
      <div class="toolbar"><span class="spacer"></span>${isAdmin() ? html`<button class="btn primary" data-new>+ New project</button>` : ""}</div>
      <div data-list></div>`;

    function render() {
      root.querySelector("[data-list]").innerHTML = tableHtml(app.projects, [
        { label: "Key", render: (p) => html`<code>${p.key}</code>` },
        { label: "Name", render: (p) => html`<b>${p.name}</b>${p.description ? html`<div class="muted small">${p.description}</div>` : ""}` },
        { label: "Issue types", render: (p) => p.issue_types.map((t) => html`<span class="tag">${t.label}</span> `) },
        { label: "Platforms", render: (p) => (p.platforms.length ? p.platforms.map((t) => html`<span class="tag">${t.label}</span> `) : "—") },
        { label: "Created", render: (p) => fmtDate(p.created_at) },
        {
          label: "", className: "actions",
          render: () => html`<button class="btn small" data-action="board">Board</button><button class="btn small" data-action="milestones">Milestones</button>${isAdmin() ? html`<button class="btn small" data-action="edit">Edit</button>` : ""}`,
        },
      ], "No projects.");
    }

    root.querySelector("[data-new]")?.addEventListener("click", () => formDialog({
      title: "New project",
      fields: [
        { name: "key", label: "Key", required: true, placeholder: "DM", hint: "2–10 uppercase letters and digits, starting with a letter. Cannot be changed later." },
        { name: "name", label: "Name", required: true, placeholder: "Dobre Mleko" },
        { name: "description", label: "Description", type: "textarea", rows: 3 },
        { name: "issue_types", label: "Issue types", type: "choices", placeholder: "bug: Błąd\nidea: Pomysł\nabuse: Nadużycie", hint: `${choicesHint} Empty = bug, idea, abuse, todo.` },
        { name: "platforms", label: "Platforms", type: "choices", placeholder: "web: Web\nandroid: Android\nios: iOS", hint: choicesHint },
      ],
      submitLabel: "Create project",
      onSubmit: async (v) => {
        const p = await api.projects.create({
          key: v.key.toUpperCase(),
          name: v.name,
          description: v.description || null,
          issue_types: v.issue_types.length ? v.issue_types : null,
          platforms: v.platforms.length ? v.platforms : null,
        });
        toast(`Project ${p.key} created`);
        app.projectKey = p.key;
        await reloadProjects();
        render();
      },
    }));

    onActions(root, {
      board: (i) => { app.projectKey = app.projects[i].key; location.hash = "#/board"; },
      milestones: (i) => { app.projectKey = app.projects[i].key; location.hash = "#/milestones"; },
      edit: async (i) => {
        let p;
        try { p = await api.projects.get(app.projects[i].key); } catch (err) { return toast(err.message, true); }
        formDialog({
          title: `Edit ${p.key}`,
          fields: [
            { name: "name", label: "Name", required: true, value: p.name },
            { name: "description", label: "Description", type: "textarea", rows: 3, value: p.description ?? "" },
            { name: "issue_types", label: "Issue types", type: "choices", value: p.issue_types, hint: `${choicesHint} Existing issues keep their type.` },
            { name: "platforms", label: "Platforms", type: "choices", value: p.platforms, hint: `${choicesHint} Issues keep a removed platform.` },
          ],
          onSubmit: async (v) => {
            const patch = diff({ ...p, description: p.description ?? "", issue_types: norm(p.issue_types), platforms: norm(p.platforms) }, v);
            if (!Object.keys(patch).length) return;
            await api.projects.update(p.key, patch);
            toast(`Project ${p.key} saved`);
            await reloadProjects();
            render();
          },
        });
      },
    });

    render();
  },
};
