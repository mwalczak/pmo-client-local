// The action log (admin only), with every filter the API supports.
import { api } from "../api.js";
import { app } from "../state.js";
import { html, el, formHtml, readForm, tableHtml, toast, fmtDate } from "../ui.js";
import { openIssue, changesHtml, actorLabel } from "./issue.js";

const PAGE = 50;
const ENTITIES = ["issue", "attachment", "project", "milestone", "user", "app", "key"];

export default {
  label: "Events",
  adminOnly: true,
  mount(root) {
    let events = [];
    let nextOffset = null;
    let query = {};

    const fields = [
      { name: "project", label: "Project", type: "select", options: [["", "Any"], ...app.projects.map((p) => [p.key, p.key])] },
      { name: "issue", label: "Issue", placeholder: "DM-12" },
      { name: "action", label: "Action", placeholder: "issue.updated" },
      { name: "entity", label: "Entity", type: "select", options: [["", "Any"], ...ENTITIES.map((e) => [e, e])] },
      { name: "entity_id", label: "Entity ID", placeholder: "uuid" },
      { name: "user_id", label: "User", type: "select", options: [["", "Any"]] },
      { name: "app_id", label: "App", type: "select", options: [["", "Any"]] },
      { name: "since", label: "Since", type: "datetime" },
      { name: "until", label: "Until", type: "datetime" },
    ];

    root.innerHTML = html`
      <details class="filters" open><summary>Filters</summary>
        <div data-form></div>
        <div class="toolbar"><button class="btn primary" data-search>Search</button><button class="btn" data-reset>Reset</button><span class="spacer"></span><span class="muted" data-count></span></div>
      </details>
      <div data-list><p class="muted">Loading…</p></div>
      <div class="more hidden"><button class="btn" data-more>Load more</button></div>`;
    const form = el(formHtml(fields));
    form.classList.add("grid-filters");
    form.addEventListener("submit", (e) => { e.preventDefault(); search(); });
    root.querySelector("[data-form]").append(form);

    // Fill user and app pickers in the background.
    api.users.list({ limit: 200 }).then((page) => {
      form.elements.user_id.innerHTML += page.items.map((u) => html`<option value="${u.id}">${u.name ?? u.email}</option>`).join("");
    }).catch(() => {});
    api.apps.list().then((apps) => {
      form.elements.app_id.innerHTML += apps.map((a) => html`<option value="${a.id}">${a.name}</option>`).join("");
    }).catch(() => {});

    function search() {
      const v = readForm(form, fields);
      query = {
        ...v,
        issue: v.issue.toUpperCase(),
        since: v.since ? new Date(v.since).toISOString() : "",
        until: v.until ? new Date(v.until).toISOString() : "",
      };
      load();
    }
    root.querySelector("[data-search]").addEventListener("click", search);
    root.querySelector("[data-reset]").addEventListener("click", () => { form.reset(); search(); });
    root.querySelector("[data-more]").addEventListener("click", () => load(nextOffset));

    async function load(offset = 0) {
      try {
        const page = await api.events.list({ ...query, limit: PAGE, offset });
        events = offset ? [...events, ...page.items] : page.items;
        nextOffset = page.next_offset ?? null;
      } catch (err) {
        root.querySelector("[data-list]").innerHTML = html`<p class="error">${err.message}</p>`;
        return;
      }
      root.querySelector("[data-count]").textContent = `${events.length}${nextOffset != null ? "+" : ""} events`;
      root.querySelector(".more").classList.toggle("hidden", nextOffset == null);
      root.querySelector("[data-list]").innerHTML = tableHtml(events, [
        { label: "When", render: (e) => html`<span class="nowrap">${fmtDate(e.at)}</span>` },
        { label: "Actor", render: (e) => html`${actorLabel(e.actor)} <span class="muted small">${e.actor.kind}</span>` },
        { label: "Action", render: (e) => html`<span class="tag">${e.action}</span>` },
        {
          label: "Target",
          render: (e) => e.issue
            ? html`<button class="link" data-issue="${e.issue}">${e.issue}</button>`
            : html`${e.entity}${e.project ? ` · ${e.project}` : ""} <code class="muted small" title="${e.entity_id}">${e.entity_id.slice(0, 8)}</code>`,
        },
        { label: "Changes", render: (e) => changesHtml(e.changes) },
      ], "No events match.");
    }

    root.querySelector("[data-list]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-issue]");
      if (btn) openIssue(btn.dataset.issue).catch((err) => toast(err.message, true));
    });

    load();
  },
};
