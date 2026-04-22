/**
 * Thin wrappers around the LexiQuest API. Each function accepts an
 * injected `fetchFn` so unit tests can substitute a scripted
 * implementation without hitting the network.
 */

/**
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<string>}
 */
export async function fetchHelloMessage({ fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/hello");
  if (!response.ok) {
    throw new Error(`GET /api/hello failed with status ${response.status}`);
  }
  const body = await response.json();
  return body.msg;
}

/**
 * @typedef {Object} PublicUser
 * @property {string} id
 * @property {string} name
 * @property {string} avatar_emoji
 * @property {string} color
 */

/**
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<PublicUser[]>}
 */
export async function fetchPublicUsers({ fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/users/public");
  if (!response.ok) {
    throw new Error(`GET /api/users/public failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {{ userId: string, password: string }} creds
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ id: string, name: string, isAdmin: boolean, ui_language: string }>}
 */
export async function login(creds, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(creds),
  });
  if (response.status === 401) {
    throw new Error("invalid credentials");
  }
  if (!response.ok) {
    throw new Error(`POST /api/login failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {{ fetchFn?: typeof fetch }} [options]
 */
export async function fetchMe({ fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/me", { credentials: "include" });
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(`GET /api/me failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {{ ui_language?: "en"|"nl", settings?: object }} patch
 * @param {{ fetchFn?: typeof fetch }} [options]
 */
export async function patchMe(patch, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(`PATCH /api/me failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {{ fetchFn?: typeof fetch }} [options]
 */
export async function logout({ fetchFn = fetch } = {}) {
  await fetchFn("/api/logout", {
    method: "POST",
    credentials: "include",
  });
}
