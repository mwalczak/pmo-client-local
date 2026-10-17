// App-wide state and domain constants shared by the views.
import { api } from "./api.js";

export const STATUSES = [
  { id: "reported", label: "Reported" },
  { id: "accepted", label: "Accepted" },
  { id: "in_progress", label: "In progress" },
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
