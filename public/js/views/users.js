// Users: list/search, create, edit role, delete, manage keys.
import { api } from "../api.js";
import { app, ROLES } from "../state.js";
import { html, formDialog, confirmDialog, tableHtml, onActions, toast, diff, fmtDate } from "../ui.js";
import { keysDialog } from "./keys.js";

const PAGE = 50;

export default {
  label: "Users",
  adminOnly: true,
  mount(root) {
    const filters = { email: "", role: "" };
    let users = [];
    let nextOffset = null;

    root.innerHTML = html`
      <div class="toolbar">
        <input class="input" data-f="email" type="search" placeholder="E-mail…">
        <select class="input" data-f="role"><option value="">All roles</option>${ROLES.map((r) => html`<option>${r}</option>`)}</select>
        <span class="spacer"></span>
        <span class="muted" data-count></span>
        <button class="btn primary" data-new>+ New user</button>
      </div>
      <div data-list><p class="muted">Loading…</p></div>
      <div class="more hidden"><button class="btn" data-more>Load more</button></div>`;

    let debounce;
    root.querySelectorAll("[data-f]").forEach((input) => input.addEventListener("input", () => {
      filters[input.dataset.f] = input.value.trim();
      clearTimeout(debounce);
      debounce = setTimeout(() => load(), 300);
    }));
    root.querySelector("[data-more]").addEventListener("click", () => load(nextOffset));

    async function load(offset = 0) {
      try {
        const page = await api.users.list({ ...filters, limit: PAGE, offset });
        users = offset ? [...users, ...page.items] : page.items;
        nextOffset = page.next_offset ?? null;
      } catch (err) {
        root.querySelector("[data-list]").innerHTML = html`<p class="error">${err.message}</p>`;
        return;
      }
      render();
    }

    function render() {
      root.querySelector("[data-count]").textContent = `${users.length}${nextOffset != null ? "+" : ""} users`;
      root.querySelector(".more").classList.toggle("hidden", nextOffset == null);
      root.querySelector("[data-list]").innerHTML = tableHtml(users, [
        { label: "Name", render: (u) => html`${u.name ?? "—"}${u.id === app.me.id ? html` <span class="tag accent">you</span>` : ""}` },
        { label: "E-mail", render: (u) => u.email },
        { label: "Role", render: (u) => html`<span class="tag ${u.role === "admin" ? "accent" : ""}">${u.role}</span>` },
        { label: "Created", render: (u) => fmtDate(u.created_at) },
        {
          label: "", className: "actions",
          render: () => html`<button class="btn small" data-action="edit">Edit</button><button class="btn small" data-action="keys">Keys</button><button class="btn small danger" data-action="delete">Delete</button>`,
        },
      ], "No users match.");
    }

    root.querySelector("[data-new]").addEventListener("click", () => formDialog({
      title: "New user",
      fields: [
        { name: "email", label: "E-mail", type: "email", required: true },
        { name: "name", label: "Name" },
        { name: "role", label: "Role", type: "select", value: "reporter", options: ROLES.map((r) => [r, r]) },
        { name: "send_key", label: "E-mail them an API key", type: "checkbox", value: true },
      ],
      submitLabel: "Create user",
      onSubmit: async (v) => {
        const u = await api.users.create({ email: v.email, name: v.name || null, role: v.role, send_key: v.send_key });
        toast(`User ${u.email} created${v.send_key ? "; key e-mailed" : ""}`);
        load();
      },
    }));

    onActions(root, {
      edit: async (i) => {
        let u;
        try { u = await api.users.get(users[i].id); } catch (err) { return toast(err.message, true); }
        formDialog({
          title: `Edit ${u.email}`,
          fields: [
            { name: "name", label: "Name", value: u.name ?? "" },
            { name: "role", label: "Role", type: "select", value: u.role, options: ROLES.map((r) => [r, r]) },
          ],
          onSubmit: async (v) => {
            const patch = diff({ ...u, name: u.name ?? "" }, v);
            if (!Object.keys(patch).length) return;
            await api.users.update(u.id, patch);
            toast("User saved");
            load();
          },
        });
      },
      keys: (i) => {
        const u = users[i];
        keysDialog(`Keys of ${u.email}`, {
          list: () => api.users.keys(u.id),
          create: (body) => api.users.createKey(u.id, body),
          createHint: "The key is shown to you, not e-mailed.",
        });
      },
      delete: async (i) => {
        const u = users[i];
        if (!(await confirmDialog(`Delete ${u.email} and their keys? Users who reported issues cannot be deleted.`))) return;
        try {
          await api.users.delete(u.id);
          toast("User deleted");
          load();
        } catch (err) {
          toast(err.message, true);
        }
      },
    });

    load();
  },
};
