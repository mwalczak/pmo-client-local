// Apps: server-to-server clients with their own keys and project access.
import { api } from "../api.js";
import { app } from "../state.js";
import { html, formDialog, confirmDialog, showSecret, tableHtml, onActions, toast, diff, fmtDate } from "../ui.js";
import { keysDialog } from "./keys.js";

const projectOptions = () => app.projects.map((p) => [p.key, `${p.key} · ${p.name}`]);

export default {
  label: "Apps",
  adminOnly: true,
  mount(root) {
    let apps = [];

    root.innerHTML = html`
      <div class="toolbar"><span class="spacer"></span><button class="btn primary" data-new>+ New app</button></div>
      <div data-list><p class="muted">Loading…</p></div>`;

    async function load() {
      try {
        apps = await api.apps.list();
      } catch (err) {
        root.querySelector("[data-list]").innerHTML = html`<p class="error">${err.message}</p>`;
        return;
      }
      root.querySelector("[data-list]").innerHTML = tableHtml(apps, [
        { label: "Name", render: (a) => html`<b>${a.name}</b>` },
        { label: "Projects", render: (a) => (a.projects.length ? a.projects.map((k) => html`<span class="tag">${k}</span> `) : "—") },
        { label: "Created", render: (a) => fmtDate(a.created_at) },
        { label: "Updated", render: (a) => fmtDate(a.updated_at) },
        {
          label: "", className: "actions",
          render: () => html`<button class="btn small" data-action="edit">Edit</button><button class="btn small" data-action="keys">Keys</button><button class="btn small danger" data-action="delete">Delete</button>`,
        },
      ], "No apps.");
    }

    root.querySelector("[data-new]").addEventListener("click", () => formDialog({
      title: "New app",
      fields: [
        { name: "name", label: "Name", required: true, placeholder: "dobre-mleko.app" },
        { name: "projects", label: "Projects", type: "checkboxes", required: true, options: projectOptions(), value: [app.projectKey] },
      ],
      submitLabel: "Create app",
      onSubmit: async (v) => {
        const res = await api.apps.create(v);
        showSecret(`Key for ${res.app.name}`, res.key.key, "Store it in the app's server-side configuration: it cannot be shown again.");
        load();
      },
    }));

    onActions(root, {
      edit: async (i) => {
        let a;
        try { a = await api.apps.get(apps[i].id); } catch (err) { return toast(err.message, true); }
        formDialog({
          title: `Edit ${a.name}`,
          fields: [
            { name: "name", label: "Name", required: true, value: a.name },
            { name: "projects", label: "Projects", type: "checkboxes", options: projectOptions(), value: a.projects },
          ],
          onSubmit: async (v) => {
            const patch = diff({ ...a, projects: [...a.projects].sort() }, { ...v, projects: [...v.projects].sort() });
            if (!Object.keys(patch).length) return;
            await api.apps.update(a.id, patch);
            toast("App saved");
            load();
          },
        });
      },
      keys: (i) => {
        const a = apps[i];
        keysDialog(`Keys of ${a.name}`, {
          list: () => api.apps.keys(a.id),
          create: (body) => api.apps.createKey(a.id, body),
          createHint: "To rotate: create a key, deploy it to the app, then revoke the old one.",
        });
      },
      delete: async (i) => {
        const a = apps[i];
        if (!(await confirmDialog(`Delete ${a.name}? Its keys go with it; its issues stay.`))) return;
        try {
          await api.apps.delete(a.id);
          toast("App deleted");
          load();
        } catch (err) {
          toast(err.message, true);
        }
      },
    });

    load();
  },
};
