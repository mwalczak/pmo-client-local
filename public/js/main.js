// Login, navigation and hash routing.
import { api, setKey, setUnauthorizedHandler } from "./api.js";
import { app, isAdmin, reloadProjects, store, load } from "./state.js";
import { $, html, toast } from "./ui.js";
import board from "./views/board.js";
import milestones from "./views/milestones.js";
import projects from "./views/projects.js";
import users from "./views/users.js";
import apps from "./views/apps.js";
import events from "./views/events.js";
import account from "./views/account.js";

const ROUTES = { board, milestones, projects, users, apps, events, account };
const LS_KEY = "pmo.key", LS_PROJECT = "pmo.project";

// --- auth ---------------------------------------------------------------------

async function connect(key) {
  setKey(key);
  app.me = await api.me();
  app.key = key;
  store(LS_KEY, key);
  app.projectKey = load(LS_PROJECT);
  await reloadProjects();
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("me").textContent = app.me.kind === "user" ? `${app.me.name || app.me.email} · ${app.me.role}` : `app: ${app.me.name}`;
  renderNav();
  route();
}

function showLogin(message = "") {
  app.me = null;
  app.key = null;
  setKey(null);
  $("view").innerHTML = "";
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("login-error").textContent = message;
  $("key-input").focus();
}

setUnauthorizedHandler(() => {
  if (!app.me) return; // during login the form shows the error itself
  store(LS_KEY, null);
  document.querySelectorAll("dialog").forEach((d) => d.close());
  showLogin("Your key was rejected. Enter it again.");
});

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  $("login-error").textContent = "";
  try {
    await connect($("key-input").value.trim());
    $("key-input").value = "";
  } catch (err) {
    showLogin(err.status === 401 ? "Invalid API key." : err.message);
  } finally {
    btn.disabled = false;
  }
});

$("logout").addEventListener("click", () => {
  store(LS_KEY, null);
  showLogin();
});

// --- navigation ---------------------------------------------------------------

const allowed = (view) => !view.adminOnly || isAdmin();

function renderNav() {
  $("nav").innerHTML = html`${Object.entries(ROUTES).filter(([, v]) => allowed(v)).map(([id, v]) =>
    html`<a href="#/${id}" data-route="${id}">${v.label}</a>`)}`;
}

function renderProjectSelect() {
  const sel = $("project");
  sel.innerHTML = app.projects.length
    ? html`${app.projects.map((p) => html`<option value="${p.key}">${p.key} · ${p.name}</option>`)}`
    : "<option>No projects</option>";
  if (app.projectKey) sel.value = app.projectKey;
}

app.bus.addEventListener("projects", renderProjectSelect);

$("project").addEventListener("change", (e) => {
  app.projectKey = e.target.value;
  store(LS_PROJECT, app.projectKey);
  route();
});

function route() {
  if (!app.me) return;
  let id = location.hash.replace(/^#\/?/, "") || "board";
  if (!ROUTES[id] || !allowed(ROUTES[id])) id = "board";
  const view = ROUTES[id];
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === id));
  $("project").classList.toggle("hidden", !view.usesProject);
  renderProjectSelect();
  store(LS_PROJECT, app.projectKey);

  // A fresh element per mount, so listeners from the previous view don't linger.
  const root = document.createElement("main");
  root.id = "view";
  root.className = `view view-${id}`;
  $("view").replaceWith(root);
  if (view.usesProject && !app.projectKey) {
    root.innerHTML = html`<p class="empty">No projects yet. ${isAdmin() ? html`<a href="#/projects">Create one</a>.` : ""}</p>`;
    return;
  }
  try {
    view.mount(root);
  } catch (err) {
    console.error(err);
    toast(err.message, true);
  }
}

window.addEventListener("hashchange", route);

// --- boot -----------------------------------------------------------------------

(async () => {
  const saved = load(LS_KEY);
  if (!saved) return showLogin();
  try {
    await connect(saved);
  } catch (err) {
    showLogin(err.status === 401 ? "Saved key is no longer valid." : err.message);
  }
})();
