// Thin client for every PMO API endpoint (see https://pmo.walczaki.com/docs).

let apiKey = null;
let onUnauthorized = null;

export function setKey(key) { apiKey = key; }
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, { query, body, form, raw } = {}) {
  let url = path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    }
    if (qs.size) url += `?${qs}`;
  }
  const headers = { authorization: `Bearer ${apiKey}` };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  if (res.ok && raw) return res;
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, data?.error, data?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

const get = (path, query) => request("GET", path, { query });
const post = (path, body) => request("POST", path, { body });
const patch = (path, body) => request("PATCH", path, { body });
const del = (path) => request("DELETE", path);
const e = encodeURIComponent;

// Follows `next_offset` until every page is loaded.
async function all(fetchPage, limit = 200) {
  const items = [];
  let offset = 0;
  while (offset != null) {
    const page = await fetchPage({ limit, offset });
    items.push(...page.items);
    offset = page.next_offset ?? null;
  }
  return items;
}

export const api = {
  me: () => get("/v1/me"),
  myKeys: () => get("/v1/me/keys"),
  createMyKey: (body) => post("/v1/me/keys", body),
  revokeKey: (id) => del(`/v1/keys/${e(id)}`),

  projects: {
    list: () => get("/v1/projects"),
    get: (key) => get(`/v1/projects/${e(key)}`),
    create: (body) => post("/v1/projects", body),
    update: (key, body) => patch(`/v1/projects/${e(key)}`, body),
  },

  issues: {
    list: (project, query) => get(`/v1/projects/${e(project)}/issues`, query),
    listAll: (project, query) => all((page) => get(`/v1/projects/${e(project)}/issues`, { ...query, ...page })),
    get: (key) => get(`/v1/issues/${e(key)}`),
    create: (project, body) => post(`/v1/projects/${e(project)}/issues`, body),
    update: (key, body) => patch(`/v1/issues/${e(key)}`, body),
    delete: (key) => del(`/v1/issues/${e(key)}`),
    events: (key) => get(`/v1/issues/${e(key)}/events`),
  },

  comments: {
    list: (issue) => get(`/v1/issues/${e(issue)}/comments`),
    create: (issue, body) => post(`/v1/issues/${e(issue)}/comments`, body),
    update: (id, body) => patch(`/v1/comments/${e(id)}`, body),
    delete: (id) => del(`/v1/comments/${e(id)}`),
  },

  attachments: {
    list: (issue) => get(`/v1/issues/${e(issue)}/attachments`),
    upload: (issue, file) => {
      const form = new FormData();
      form.append("file", file);
      return request("POST", `/v1/issues/${e(issue)}/attachments`, { form });
    },
    blob: async (id) => (await request("GET", `/v1/attachments/${e(id)}`, { raw: true })).blob(),
    delete: (id) => del(`/v1/attachments/${e(id)}`),
  },

  milestones: {
    list: (project, state) => get(`/v1/projects/${e(project)}/milestones`, { state }),
    get: (id) => get(`/v1/milestones/${e(id)}`),
    create: (project, body) => post(`/v1/projects/${e(project)}/milestones`, body),
    update: (id, body) => patch(`/v1/milestones/${e(id)}`, body),
    delete: (id) => del(`/v1/milestones/${e(id)}`),
  },

  users: {
    list: (query) => get("/v1/users", query),
    get: (id) => get(`/v1/users/${e(id)}`),
    create: (body) => post("/v1/users", body),
    update: (id, body) => patch(`/v1/users/${e(id)}`, body),
    delete: (id) => del(`/v1/users/${e(id)}`),
    keys: (id) => get(`/v1/users/${e(id)}/keys`),
    createKey: (id, body) => post(`/v1/users/${e(id)}/keys`, body),
  },

  apps: {
    list: () => get("/v1/apps"),
    get: (id) => get(`/v1/apps/${e(id)}`),
    create: (body) => post("/v1/apps", body),
    update: (id, body) => patch(`/v1/apps/${e(id)}`, body),
    delete: (id) => del(`/v1/apps/${e(id)}`),
    keys: (id) => get(`/v1/apps/${e(id)}/keys`),
    createKey: (id, body) => post(`/v1/apps/${e(id)}/keys`, body),
  },

  events: {
    list: (query) => get("/v1/events", query),
  },
};
