// App-wide state and domain constants shared by the views.
import { api } from "./api.js";

export const STATUSES = [
  { id: "reported", label: "Reported", open: true },
  { id: "accepted", label: "Accepted", open: true },
  { id: "in_progress", label: "In progress", open: true },
  // Display order differs from the API's: in_review is UAT after release, not code review.
  { id: "waiting_for_release", label: "Waiting for release", open: true },
  { id: "in_review", label: "In review (UAT)", open: true },
  { id: "done", label: "Done" },
  { id: "wont_fix", label: "Won't fix" },
  { id: "duplicate", label: "Duplicate" },
];
export const PRIORITIES = ["P1", "P2", "P3", "P4", "P5"];
export const ISSUE_TYPES = ["bug", "idea", "abuse", "todo"];
export const ROLES = ["admin", "reporter"];

export const app = {
  me: null,
  projects: [],
  projectKey: null,
  bus: new EventTarget(),
};

export const isAdmin = () => app.me?.kind === "user" && app.me.role === "admin";
export const isApp = () => app.me?.kind === "app";
// Admins (and apps, within their projects) can triage; the API has the final say.
export const canTriage = () => isAdmin() || isApp();

export const currentProject = () => app.projects.find((p) => p.key === app.projectKey) ?? null;
export const projectByKey = (key) => app.projects.find((p) => p.key === key) ?? null;
export const personLabel = (u) => u.name ?? u.email ?? "—";

// Who issues can be assigned to: any user, admins first. Only admins can list users (and assign).
export function assigneeOptions(users) {
  const sorted = [...users].sort((a, b) => (a.role === "admin" ? 0 : 1) - (b.role === "admin" ? 0 : 1) || personLabel(a).localeCompare(personLabel(b)));
  return [["", "— Unassigned"], ...sorted.map((u) => [u.id, u.name ? `${u.name} (${u.email})` : u.email])];
}

export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? id;

export function typeLabel(project, id) {
  return project?.issue_types.find((t) => t.id === id)?.label ?? id;
}
export function platformLabel(project, id) {
  return project?.platforms.find((p) => p.id === id)?.label ?? id;
}
// Types offered in forms: the project's own, plus every built-in type for admins.
export function typeOptions(project) {
  const opts = (project?.issue_types ?? []).map((t) => [t.id, t.label]);
  if (canTriage()) for (const t of ISSUE_TYPES) if (!opts.some(([id]) => id === t)) opts.push([t, t]);
  return opts;
}

export async function reloadProjects() {
  app.projects = await api.projects.list();
  if (!app.projects.some((p) => p.key === app.projectKey)) app.projectKey = app.projects[0]?.key ?? null;
  app.bus.dispatchEvent(new Event("projects"));
}

export function store(name, value) {
  try { value == null ? localStorage.removeItem(name) : localStorage.setItem(name, value); } catch {}
}
export function load(name) {
  try { return localStorage.getItem(name); } catch { return null; }
}
