// Shared UI helpers: escaping templates, dialogs, forms, toasts.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtVal(v) {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(fmtVal).join("");
  if (v instanceof Raw) return v.s;
  return esc(v);
}

// Tagged template that escapes every interpolation unless it is raw()/html``.
export function html(strings, ...vals) {
  return raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? fmtVal(vals[i]) : ""), ""));
}

export function el(markup) {
  const t = document.createElement("template");
  t.innerHTML = String(markup).trim();
  return t.content.firstElementChild;
}

export const $ = (id) => document.getElementById(id);
export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "—");
export const fmtDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : "—");
export const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// --- toasts ---------------------------------------------------------------

export function toast(message, isError = false) {
  const box = $("toasts");
  const t = el(html`<div class="toast ${isError ? "err" : ""}">${message}</div>`);
  box.append(t);
  while (box.children.length > 4) box.firstElementChild.remove();
  // Re-show so the popover stacks above any dialog opened since.
  if (box.matches(":popover-open")) box.hidePopover();
  box.showPopover();
  setTimeout(() => {
    t.remove();
    if (!box.children.length) box.hidePopover();
  }, isError ? 7000 : 3500);
}

// --- dialogs --------------------------------------------------------------

// Opens a modal. `actions` are footer buttons; an action's onClick may return
// false to keep the dialog open, and any error it throws is shown inline.
export function openDialog({ title, subtitle, body, actions = [], wide = false, onClose }) {
  const dialog = el(html`<dialog class="${wide ? "wide" : ""}">
    <div class="modal-head">
      <div>${subtitle ? html`<span class="key">${subtitle}</span>` : ""}<h3>${title}</h3></div>
      <button class="close" aria-label="Close">×</button>
    </div>
    <div class="modal-body"></div>
    <div class="modal-error error"></div>
    <div class="modal-foot"></div>
  </dialog>`);
  const bodyEl = dialog.querySelector(".modal-body");
  const errEl = dialog.querySelector(".modal-error");
  const foot = dialog.querySelector(".modal-foot");
  if (body instanceof Node) bodyEl.append(body);
  else if (body != null) bodyEl.innerHTML = String(body);

  const close = () => dialog.close();
  const ctx = { dialog, body: bodyEl, close, setError: (m) => { errEl.textContent = m ?? ""; } };

  const renderActions = (list) => {
    foot.innerHTML = "";
    foot.classList.toggle("hidden", !list.length);
    for (const a of list) {
      const btn = el(html`<button class="btn ${a.kind ?? ""}" type="button">${a.label}</button>`);
      if (a.left) btn.classList.add("left");
      btn.addEventListener("click", async () => {
        ctx.setError("");
        const buttons = foot.querySelectorAll("button");
        buttons.forEach((b) => (b.disabled = true));
        try {
          const keepOpen = (await a.onClick?.(ctx)) === false;
          if (!keepOpen) close();
        } catch (err) {
          ctx.setError(err.message);
        } finally {
          buttons.forEach((b) => (b.disabled = false));
        }
      });
      foot.append(btn);
    }
  };
  ctx.setActions = renderActions;
  renderActions(actions);

  dialog.querySelector(".close").addEventListener("click", close);
  dialog.addEventListener("close", () => { onClose?.(); dialog.remove(); });
  document.body.append(dialog);
  dialog.showModal();
  return ctx;
}

export function confirmDialog(message, { title = "Are you sure?", label = "Delete", danger = true } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    openDialog({
      title,
      body: html`<p>${message}</p>`,
      actions: [
        { label: "Cancel" },
        { label, kind: danger ? "danger" : "primary", onClick: () => { ok = true; } },
      ],
      onClose: () => resolve(ok),
    });
  });
}

// Shows a just-created API key once, with a copy button.
export function showSecret(title, key, note = "Copy it now: it cannot be shown again.") {
  const body = el(html`<div>
    <p>${note}</p>
    <div class="secret"><code>${key}</code><button class="btn" type="button">Copy</button></div>
  </div>`);
  body.querySelector("button").addEventListener("click", async (e) => {
    await navigator.clipboard.writeText(key);
    e.target.textContent = "Copied";
  });
  openDialog({ title, body, actions: [{ label: "Done", kind: "primary" }] });
}

// --- forms ----------------------------------------------------------------
// Field: { name, label, type, value, options: [[value, label]], required, placeholder, hint, rows }
// Types: text, email, textarea, select, checkbox, date, datetime, file, checkboxes, choices.

export function formHtml(fields) {
  return html`<form class="form" novalidate>${fields.map(fieldHtml)}</form>`;
}

function fieldHtml(f) {
  const id = `f-${f.name}`;
  const req = f.required ? raw(" required") : "";
  const hint = f.hint ? html`<small class="hint">${f.hint}</small>` : "";
  let input;
  switch (f.type) {
    case "textarea":
      input = html`<textarea id="${id}" name="${f.name}" class="input" rows="${f.rows ?? 5}" placeholder="${f.placeholder ?? ""}"${req}>${f.value ?? ""}</textarea>`;
      break;
    case "choices":
      input = html`<textarea id="${id}" name="${f.name}" class="input mono" rows="${f.rows ?? 4}" placeholder="${f.placeholder ?? "id: Label"}">${formatChoices(f.value)}</textarea>`;
      break;
    case "select":
      input = html`<select id="${id}" name="${f.name}" class="input"${req}>${f.options.map(([v, l]) =>
        html`<option value="${v}"${String(v) === String(f.value ?? "") ? raw(" selected") : ""}>${l}</option>`)}</select>`;
      break;
    case "checkbox":
      return html`<label class="check field ${f.wrapClass ?? ""}"><input type="checkbox" name="${f.name}"${f.value ? raw(" checked") : ""}> ${f.label}${hint}</label>`;
    case "checkboxes":
      input = html`<div class="checks" id="${id}">${f.options.map(([v, l]) =>
        html`<label class="check"><input type="checkbox" name="${f.name}" value="${v}"${(f.value ?? []).includes(v) ? raw(" checked") : ""}> ${l}</label>`)}</div>`;
      break;
    case "file":
      input = html`<input id="${id}" name="${f.name}" type="file" class="input" ${f.multiple ? raw("multiple") : ""} accept="${f.accept ?? ""}">`;
      break;
    case "datetime":
      input = html`<input id="${id}" name="${f.name}" type="datetime-local" class="input" value="${f.value ?? ""}">`;
      break;
    default:
      input = html`<input id="${id}" name="${f.name}" type="${f.type ?? "text"}" class="input" value="${f.value ?? ""}" placeholder="${f.placeholder ?? ""}"${req}>`;
  }
  return html`<label class="field ${f.wrapClass ?? ""}" for="${id}"><span>${f.label}${f.required ? " *" : ""}</span>${input}${hint}</label>`;
}

export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === "checkbox") out[f.name] = form.elements[f.name].checked;
    else if (f.type === "checkboxes") out[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map((i) => i.value);
    else if (f.type === "file") out[f.name] = [...form.elements[f.name].files];
    else if (f.type === "choices") out[f.name] = parseChoices(form.elements[f.name].value);
    else out[f.name] = form.elements[f.name].value.trim();
    if (f.required && (out[f.name] === "" || (Array.isArray(out[f.name]) && !out[f.name].length))) {
      throw new Error(`${f.label} is required.`);
    }
  }
  return out;
}

// Opens a dialog with a form; onSubmit(values) runs the API call.
export function formDialog({ title, subtitle, fields, submitLabel = "Save", onSubmit, extraActions = [] }) {
  const body = el(formHtml(fields));
  const submit = async () => onSubmit(readForm(body, fields));
  body.addEventListener("submit", (e) => e.preventDefault());
  const ctx = openDialog({
    title,
    subtitle,
    body,
    actions: [...extraActions, { label: "Cancel" }, { label: submitLabel, kind: "primary", onClick: submit }],
  });
  body.querySelector("input:not([type=checkbox]), textarea, select")?.focus();
  return ctx;
}

// Fields whose value differs from the original, for PATCH bodies.
export function diff(original, values, map = {}) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const before = map[k] ? map[k](original) : original[k];
    if (JSON.stringify(v ?? null) !== JSON.stringify(before ?? null)) out[k] = v;
  }
  return out;
}

// "id: Label" lines <-> [{id, label}]
export function formatChoices(list) {
  return (list ?? []).map((c) => (c.label && c.label !== c.id ? `${c.id}: ${c.label}` : c.id)).join("\n");
}
export function parseChoices(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(":");
    return i < 0 ? { id: l, label: null } : { id: l.slice(0, i).trim(), label: l.slice(i + 1).trim() || null };
  });
}

// --- tables -----------------------------------------------------------------

// columns: [{ label, render: (row) => html, className }]
export function tableHtml(rows, columns, empty = "Nothing here yet.") {
  if (!rows.length) return html`<p class="empty">${empty}</p>`;
  return html`<div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => html`<th class="${c.className ?? ""}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r, i) => html`<tr data-index="${i}">${columns.map((c) => html`<td class="${c.className ?? ""}">${c.render(r)}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

// Delegates clicks on [data-action] buttons inside `root` to handlers[action](rowIndex, button).
export function onActions(root, handlers) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !root.contains(btn)) return;
    const row = btn.closest("[data-index]");
    handlers[btn.dataset.action]?.(row ? Number(row.dataset.index) : null, btn);
  });
}

export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
