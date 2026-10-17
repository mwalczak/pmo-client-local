// Who am I, and my API keys.
import { api } from "../api.js";
import { app } from "../state.js";
import { html } from "../ui.js";
import { keysPanel } from "./keys.js";

export default {
  label: "Account",
  mount(root) {
    const me = app.me;
    const rows = me.kind === "user"
      ? [["Kind", "user"], ["Name", me.name ?? "—"], ["E-mail", me.email], ["Role", me.role], ["ID", me.id]]
      : [["Kind", "app"], ["Name", me.name], ["Projects", me.projects.join(", ") || "—"], ["ID", me.id]];
    root.innerHTML = html`
      <section class="panel">
        <h2>Me</h2>
        <dl class="meta-list">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
      </section>
      <section class="panel" data-keys>
        <h2>My API keys</h2>
        <p class="muted">Create one per agent or tool, or rotate a key before revoking the old one.</p>
      </section>`;
    root.querySelector("[data-keys]").append(keysPanel({ list: api.myKeys, create: api.createMyKey }));
  },
};
