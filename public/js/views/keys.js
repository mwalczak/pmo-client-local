// API key list with create/revoke, used for my keys, users' keys and apps' keys.
import { api } from "../api.js";
import { app } from "../state.js";
import { html, el, openDialog, confirmDialog, formDialog, showSecret, tableHtml, onActions, toast, fmtDate } from "../ui.js";

// list(): Promise<ApiKey[]>, create(body): Promise<NewApiKey>
export function keysPanel({ list, create, createHint }) {
  const root = el(`<div class="keys"><div class="toolbar"><span class="spacer"></span><button class="btn primary" type="button" data-new>+ New key</button></div><div data-list><p class="muted">Loading…</p></div></div>`);
  let keys = [];
  const isCurrent = (k) => app.key?.startsWith(k.prefix);

  async function refresh() {
    try {
      keys = await list();
    } catch (err) {
      root.querySelector("[data-list]").innerHTML = html`<p class="error">${err.message}</p>`;
      return;
    }
    root.querySelector("[data-list]").innerHTML = tableHtml(keys, [
      { label: "Name", render: (k) => html`${k.name ?? "—"}${isCurrent(k) ? html` <span class="tag accent">this session</span>` : ""}` },
      { label: "Prefix", render: (k) => html`<code>${k.prefix}…</code>` },
      { label: "Created", render: (k) => fmtDate(k.created_at) },
      { label: "Last used", render: (k) => fmtDate(k.last_used_at) },
      { label: "Status", render: (k) => (k.revoked_at ? html`<span class="tag">revoked ${fmtDate(k.revoked_at)}</span>` : html`<span class="tag ok">active</span>`) },
      { label: "", className: "actions", render: (k) => (k.revoked_at ? "" : html`<button class="btn small danger" data-action="revoke">Revoke</button>`) },
    ], "No keys.");
  }

  root.querySelector("[data-new]").addEventListener("click", () => formDialog({
    title: "New API key",
    fields: [{ name: "name", label: "Name", placeholder: "e.g. claude agent", hint: createHint }],
    submitLabel: "Create key",
    onSubmit: async ({ name }) => {
      const k = await create({ name: name || null });
      showSecret("New API key", k.key);
      refresh();
    },
  }));

  onActions(root, {
    revoke: async (i) => {
      const k = keys[i];
      const warning = isCurrent(k) ? " This is the key you are logged in with: you will be logged out." : "";
      if (!(await confirmDialog(`Revoke key ${k.prefix}…?${warning}`, { label: "Revoke" }))) return;
      try {
        await api.revokeKey(k.id);
        toast("Key revoked");
        refresh();
      } catch (err) {
        toast(err.message, true);
      }
    },
  });

  refresh();
  return root;
}

export function keysDialog(title, opts) {
  openDialog({ title, body: keysPanel(opts), wide: true, actions: [{ label: "Close" }] });
}
