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

/**
 * @typedef {Object} FullUser
 * @property {string} id
 * @property {string} name
 * @property {boolean} isAdmin
 * @property {string} color
 * @property {string} avatar_emoji
 * @property {"en"|"nl"} ui_language
 * @property {{ auto_speak: boolean, preferred_mode: string, daily_goal: number }} settings
 * @property {string} created_at
 */

/**
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<FullUser[]>}
 */
export async function fetchUsers({ fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/users", { credentials: "include" });
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(`GET /api/users failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {object} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<FullUser>}
 */
export async function createUser(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (response.status === 409) {
    throw new Error("duplicate");
  }
  if (!response.ok) {
    throw new Error(`POST /api/users failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} id
 * @param {object} patch
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<FullUser>}
 */
export async function updateUser(id, patch, { fetchFn = fetch } = {}) {
  const response = await fetchFn(`/api/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`PUT /api/users/${id} failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} id
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<void>}
 */
export async function deleteUser(id, { fetchFn = fetch } = {}) {
  const response = await fetchFn(`/api/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`DELETE /api/users/${id} failed with status ${response.status}`);
  }
}

/**
 * @typedef {Object} Year
 * @property {string} id
 * @property {string} label
 * @property {boolean} is_current
 * @property {string} start_date
 * @property {string} end_date
 */

/**
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<Year[]>}
 */
export async function fetchYears({ fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/years", { credentials: "include" });
  if (!response.ok) {
    throw new Error(`GET /api/years failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {object} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<Year>}
 */
export async function createYear(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/years", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (!response.ok) {
    throw new Error(`POST /api/years failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} id
 * @param {object} patch
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<Year>}
 */
export async function updateYear(id, patch, { fetchFn = fetch } = {}) {
  const response = await fetchFn(`/api/years/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`PUT /api/years/${id} failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @typedef {Object} Course
 * @property {string} id
 * @property {string} user_id
 * @property {string} year_id
 * @property {string} name
 * @property {string} emoji
 * @property {string} color
 * @property {string|null} language
 * @property {"self_grade"|"mcq"|"mixed"|"ask"} default_mode
 * @property {string} created_at
 */

/**
 * @param {string} [userId]
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<Course[]>}
 */
export async function fetchCourses(userId, { fetchFn = fetch } = {}) {
  const path = userId
    ? `/api/courses?userId=${encodeURIComponent(userId)}`
    : "/api/courses";
  const response = await fetchFn(path, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`GET ${path} failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {object} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<Course>}
 */
export async function createCourse(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/courses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST /api/courses failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} id
 * @param {object} patch
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<Course>}
 */
export async function updateCourse(id, patch, { fetchFn = fetch } = {}) {
  const response = await fetchFn(`/api/courses/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`PUT /api/courses/${id} failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} id
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<void>}
 */
export async function deleteCourse(id, { fetchFn = fetch } = {}) {
  const response = await fetchFn(`/api/courses/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(
      `DELETE /api/courses/${id} failed with status ${response.status}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * @param {string} courseId
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<object[]>}
 */
export async function fetchCards(courseId, { fetchFn = fetch } = {}) {
  const path = `/api/cards?courseId=${encodeURIComponent(courseId)}`;
  const response = await fetchFn(path, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`GET ${path} failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {object} body  Must include course_id, question, answer
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
export async function createCard(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST /api/cards failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} id
 * @param {string} courseId
 * @param {object} patch
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
export async function updateCard(id, courseId, patch, { fetchFn = fetch } = {}) {
  const path = `/api/cards/${encodeURIComponent(id)}?courseId=${encodeURIComponent(courseId)}`;
  const response = await fetchFn(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`PUT /api/cards/${id} failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} id
 * @param {string} courseId
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<void>}
 */
/**
 * @param {{ courseId: string, mode: string }} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ sessionId: string, cards: object[] }>}
 */
export async function startSession(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST /api/sessions failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {{ sessionId: string, items: object[] }} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
export async function postAttempts(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST /api/attempts failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @param {string} sessionId
 * @param {{ cards_studied: number, cards_correct: number }} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
export async function closeSession(sessionId, body, { fetchFn = fetch } = {}) {
  const response = await fetchFn(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PUT /api/sessions/${sessionId} failed with status ${response.status}`);
  }
  return response.json();
}

export async function deleteCard(id, courseId, { fetchFn = fetch } = {}) {
  const path = `/api/cards/${encodeURIComponent(id)}?courseId=${encodeURIComponent(courseId)}`;
  const response = await fetchFn(path, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status === 403) {
    throw new Error("forbidden");
  }
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`DELETE /api/cards/${id} failed with status ${response.status}`);
  }
}

/**
 * @param {{ courseId: string }} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ enriched: number }>}
 */
export async function enrichCards(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/cards/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (response.status === 403) throw new Error("forbidden");
  if (response.status === 502) throw new Error("claude_error");
  if (!response.ok) throw new Error(`POST /api/cards/enrich failed: ${response.status}`);
  return response.json();
}

/**
 * @param {{ courseId: string, imageBase64: string, mimeType: string }} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ candidates: object[] }>}
 */
export async function importCards(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/cards/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (response.status === 403) throw new Error("forbidden");
  if (response.status === 422) throw new Error("parse_error");
  if (response.status === 502) throw new Error("claude_error");
  if (!response.ok) throw new Error(`POST /api/cards/import failed: ${response.status}`);
  return response.json();
}

/**
 * @param {{ courseId: string, cards: object[] }} body
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ cards: object[] }>}
 */
export async function batchCreateCards(body, { fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/cards/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (response.status === 403) throw new Error("forbidden");
  if (!response.ok) throw new Error(`POST /api/cards/batch failed: ${response.status}`);
  return response.json();
}
