// Issue dialogs: details/edit, attachments, history, and "new issue".
import { api } from "../api.js";
import {
  app, PRIORITIES, STATUSES, canTriage, isAdmin, projectByKey, statusLabel, typeLabel, platformLabel, typeOptions,
} from "../state.js";
import {
  html, el, openDialog, confirmDialog, formHtml, readForm, formDialog, diff, toast, fmtDate, fmtSize,
} from "../ui.js";

// --- event log rendering (shared with the Events view) ----------------------

function short(v) {
  if (v == null) return "∅";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

export function changesHtml(changes) {
  const entries = Object.entries(changes ?? {});
  if (!entries.length) return "";
  return html`<ul class="changes">${entries.map(([field, v]) => {
    const isDelta = v && typeof v === "object" && !Array.isArray(v) && ("from" in v || "to" in v);
    return isDelta
      ? html`<li><b>${field}</b>: <s>${short(v.from)}</s> → ${short(v.to)}</li>`
      : html`<li><b>${field}</b>: ${short(v)}</li>`;
  })}</ul>`;
}

export const actorLabel = (a) => a?.name || a?.email || a?.kind || "—";

// --- issue dialog -----------------------------------------------------------

// onChange(updatedIssue) after a save, onChange(null, key) after a delete.
export async function openIssue(key, { onChange } = {}) {
  let issue;
  try {
    issue = await api.issues.get(key);
  } catch (err) {
    return toast(`Couldn't open ${key}: ${err.message}`, true);
  }
  const project = projectByKey(issue.project) ?? (await api.projects.get(issue.project).catch(() => null));
  const milestones = canTriage() ? await api.milestones.list(issue.project).catch(() => []) : [];
  const objectUrls = [];

  const body = el(`<div>
    <nav class="tabs">
      <button type="button" data-tab="details" class="active">Details</button>
      <button type="button" data-tab="attachments">Attachments</button>
      <button type="button" data-tab="history">History</button>
    </nav>
    <div class="tab-panel"></div>
  </div>`);
  const panel = body.querySelector(".tab-panel");

  const ctx = openDialog({
    title: issue.title,
    subtitle: issue.key,
    body,
    wide: true,
    onClose: () => objectUrls.forEach(URL.revokeObjectURL),
  });

  const tabs = { details: renderDetails, attachments: renderAttachments, history: renderHistory };
  body.querySelector(".tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    body.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    ctx.setError("");
    tabs[btn.dataset.tab]();
  });
  renderDetails();

  // Details -------------------------------------------------------------------

  function editableFields() {
    const own = app.me?.kind === "user" && issue.reporter.id === app.me.id;
    const platformField = {
      name: "platform", label: "Platform", type: "select", value: issue.platform ?? "",
      options: [["", "—"], ...(project?.platforms ?? []).map((p) => [p.id, p.label])],
    };
    if (canTriage()) {
      return [
        { name: "title", label: "Title", required: true, value: issue.title, wrapClass: "span2" },
        { name: "description", label: "Description", type: "textarea", value: issue.description ?? "", rows: 6, wrapClass: "span2" },
        { name: "status", label: "Status", type: "select", value: issue.status, options: STATUSES.map((s) => [s.id, s.label]) },
        { name: "duplicate_of", label: "Duplicate of", value: issue.duplicate_of ?? "", placeholder: `${issue.project}-1`, hint: "Required for status Duplicate." },
        { name: "type", label: "Type", type: "select", value: issue.type, options: typeOptions(project) },
        { name: "priority", label: "Priority", type: "select", value: issue.priority, options: PRIORITIES.map((p) => [p, p]) },
        platformField,
        {
          name: "milestone_id", label: "Milestone", type: "select", value: issue.milestone?.id ?? "",
          options: [["", "—"], ...milestones.map((m) => [m.id, m.state === "closed" ? `${m.name} (closed)` : m.name])],
        },
        { name: "private", label: "Private (admins and the reporter only)", type: "checkbox", value: issue.private, wrapClass: "span2" },
      ];
    }
    if (own) {
      return [
        { name: "title", label: "Title", required: true, value: issue.title, wrapClass: "span2" },
        { name: "description", label: "Description", type: "textarea", value: issue.description ?? "", rows: 6, wrapClass: "span2" },
        platformField,
      ];
    }
    return [];
  }

  function metaHtml() {
    const rows = [
      ["Status", statusLabel(issue.status)],
      ["Priority", issue.priority],
      ["Type", typeLabel(project, issue.type)],
      ["Platform", issue.platform ? platformLabel(project, issue.platform) : "—"],
      ["Milestone", issue.milestone?.name ?? "—"],
      ["Duplicate of", issue.duplicate_of],
      ["Private", issue.private ? "yes" : "no"],
      ["Reporter", [issue.reporter.name, issue.reporter.email].filter(Boolean).join(" · ") || "—"],
      ["Source app", issue.source_app ?? "—"],
      ["Created", fmtDate(issue.created_at)],
      ["Updated", fmtDate(issue.updated_at)],
    ].filter(([, v]) => v != null);
    return html`<dl class="meta-list">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
  }

  function renderDetails() {
    const fields = editableFields();
    if (!fields.length) {
      panel.innerHTML = html`${metaHtml()}<div class="desc">${issue.description || "No description."}</div>`;
      ctx.setActions([]);
      return;
    }
    const readonly = [
      ["Reporter", [issue.reporter.name, issue.reporter.email].filter(Boolean).join(" · ") || "—"],
      ["Source app", issue.source_app ?? "—"],
      ["Created", fmtDate(issue.created_at)],
      ["Updated", fmtDate(issue.updated_at)],
    ];
    panel.innerHTML = html`${formHtml(fields)}
      <dl class="meta-list compact">${readonly.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
    const form = panel.querySelector("form");
    form.classList.add("grid2");
    form.addEventListener("submit", (e) => e.preventDefault());

    ctx.setActions([
      ...(isAdmin() ? [{ label: "Delete issue", kind: "danger", left: true, onClick: remove }] : []),
      { label: "Close" },
      { label: "Save", kind: "primary", onClick: () => save(form, fields) },
    ]);
  }

  async function save(form, fields) {
    const values = readForm(form, fields);
    const original = {
      ...issue,
      description: issue.description ?? "",
      platform: issue.platform ?? "",
      milestone_id: issue.milestone?.id ?? "",
      duplicate_of: issue.duplicate_of ?? "",
    };
    const patch = diff(original, values);
    if ("platform" in patch && patch.platform === "") patch.platform = null;
    if ("milestone_id" in patch && patch.milestone_id === "") patch.milestone_id = null;
    if (values.status === "duplicate") {
      if (!values.duplicate_of) throw new Error("Enter the key of the original issue.");
      if (patch.status || patch.duplicate_of) patch.duplicate_of = values.duplicate_of.toUpperCase();
    } else {
      delete patch.duplicate_of;
    }
    if (!Object.keys(patch).length) {
      toast("Nothing changed.");
      return false;
    }
    issue = await api.issues.update(issue.key, patch);
    ctx.dialog.querySelector("h3").textContent = issue.title;
    onChange?.(issue);
    toast(`${issue.key} saved`);
    renderDetails();
    return false;
  }

  async function remove() {
    if (!(await confirmDialog(`Delete ${issue.key} permanently? Use this for spam and the like.`))) return false;
    await api.issues.delete(issue.key);
    onChange?.(null, issue.key);
    toast(`${issue.key} deleted`);
  }

  // Attachments ---------------------------------------------------------------

  async function renderAttachments() {
    ctx.setActions([{ label: "Close" }]);
    panel.innerHTML = `<p class="muted">Loading…</p>`;
    let list;
    try {
      list = await api.attachments.list(issue.key);
    } catch (err) {
      panel.innerHTML = html`<p class="error">${err.message}</p>`;
      return;
    }
    panel.innerHTML = html`
      <div class="upload">
        <input type="file" multiple accept="image/*,video/*,.heic,.avif">
        <button class="btn primary" type="button" data-upload>Upload</button>
        <small class="hint">Images or videos, up to 20 per issue.</small>
      </div>
      ${list.length ? "" : html`<p class="empty">No attachments.</p>`}
      <div class="attachments">${list.map((a, i) => html`
        <figure class="attachment" data-index="${i}">
          <div class="preview">${a.kind === "video"
            ? html`<button class="btn" type="button" data-play>▶ Load video</button>`
            : html`<span class="muted">Loading…</span>`}</div>
          <figcaption>
            <b title="${a.filename ?? ""}">${a.filename ?? a.id.slice(0, 8)}</b>
            <span class="muted">${a.kind} · ${fmtSize(a.size)} · ${a.uploaded_by ?? "—"} · ${fmtDate(a.created_at)}</span>
            <span class="row-actions">
              <button class="btn small" type="button" data-download>Download</button>
              <button class="btn small danger" type="button" data-delete>Delete</button>
            </span>
          </figcaption>
        </figure>`)}</div>`;

    const blobUrl = async (a) => {
      if (!a._url) {
        a._url = URL.createObjectURL(await api.attachments.blob(a.id));
        objectUrls.push(a._url);
      }
      return a._url;
    };

    panel.querySelectorAll(".attachment").forEach(async (fig) => {
      const a = list[fig.dataset.index];
      if (a.kind !== "image") return;
      try {
        fig.querySelector(".preview").innerHTML = html`<img src="${await blobUrl(a)}" alt="${a.filename ?? ""}">`;
      } catch (err) {
        fig.querySelector(".preview").innerHTML = html`<span class="error">${err.message}</span>`;
      }
    });

    panel.querySelector("[data-upload]").addEventListener("click", async (e) => {
      const files = [...panel.querySelector("input[type=file]").files];
      if (!files.length) return toast("Choose a file first.", true);
      e.target.disabled = true;
      for (const f of files) {
        try {
          await api.attachments.upload(issue.key, f);
          toast(`Uploaded ${f.name}`);
        } catch (err) {
          toast(`${f.name}: ${err.message}`, true);
        }
      }
      renderAttachments();
    });

    panel.querySelector(".attachments").addEventListener("click", async (e) => {
      const fig = e.target.closest(".attachment");
      if (!fig) return;
      const a = list[fig.dataset.index];
      try {
        if (e.target.closest("[data-play]")) {
          e.target.disabled = true;
          fig.querySelector(".preview").innerHTML = html`<video controls src="${await blobUrl(a)}"></video>`;
        } else if (e.target.closest("[data-download]")) {
          const link = el(html`<a href="${await blobUrl(a)}" download="${a.filename ?? a.id}"></a>`);
          document.body.append(link);
          link.click();
          link.remove();
        } else if (e.target.closest("[data-delete]")) {
          if (!(await confirmDialog(`Delete ${a.filename ?? "this attachment"}?`))) return;
          await api.attachments.delete(a.id);
          toast("Attachment deleted");
          renderAttachments();
        }
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  // History -------------------------------------------------------------------

  async function renderHistory() {
    ctx.setActions([{ label: "Close" }]);
    panel.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      const events = await api.issues.events(issue.key);
      panel.innerHTML = events.length
        ? html`<ol class="timeline">${events.map((ev) => html`<li>
            <div><b>${actorLabel(ev.actor)}</b> <span class="tag">${ev.action}</span> <span class="muted">${fmtDate(ev.at)}</span></div>
            ${changesHtml(ev.changes)}
          </li>`)}</ol>`
        : html`<p class="empty">No history.</p>`;
    } catch (err) {
      panel.innerHTML = html`<p class="error">${err.message}</p>`;
    }
  }
}

// --- new issue --------------------------------------------------------------

export function newIssueDialog(project, milestones, { onCreated } = {}) {
  const types = typeOptions(project);
  const fields = [
    { name: "type", label: "Type", type: "select", value: types[0]?.[0], options: types },
    { name: "title", label: "Title", required: true },
    { name: "description", label: "Description", type: "textarea" },
  ];
  if (project.platforms.length) {
    fields.push({ name: "platform", label: "Platform", type: "select", options: [["", "—"], ...project.platforms.map((p) => [p.id, p.label])] });
  }
  if (canTriage()) {
    fields.push({ name: "priority", label: "Priority", type: "select", value: "P3", options: PRIORITIES.map((p) => [p, p]) });
    if (milestones.length) {
      fields.push({ name: "milestone_id", label: "Milestone", type: "select", options: [["", "—"], ...milestones.filter((m) => m.state === "open").map((m) => [m.id, m.name])] });
    }
    fields.push(
      { name: "reporter_email", label: "Reporter e-mail", type: "email", required: app.me.kind === "app", hint: app.me.kind === "app" ? "Apps must name the reporter." : "Leave empty to report as yourself. A new e-mail gets an account and a key." },
      { name: "reporter_name", label: "Reporter name" },
    );
  }
  fields.push(
    { name: "private", label: "Private", type: "checkbox" },
    { name: "files", label: "Attachments", type: "file", multiple: true, accept: "image/*,video/*,.heic,.avif" },
  );

  formDialog({
    title: `New issue in ${project.key}`,
    fields,
    submitLabel: "Create issue",
    onSubmit: async (v) => {
      const body = { type: v.type, title: v.title, description: v.description || null, private: v.private };
      if (v.platform) body.platform = v.platform;
      if (v.priority) body.priority = v.priority;
      if (v.milestone_id) body.milestone_id = v.milestone_id;
      if (v.reporter_email) body.reporter = { email: v.reporter_email, name: v.reporter_name || null };
      const issue = await api.issues.create(project.key, body);
      for (const f of v.files) {
        try {
          await api.attachments.upload(issue.key, f);
        } catch (err) {
          toast(`${f.name}: ${err.message}`, true);
        }
      }
      toast(`Created ${issue.key}`);
      onCreated?.(issue);
    },
  });
}
