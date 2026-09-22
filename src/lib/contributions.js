const GRAPHQL = 'https://api.github.com/graphql';

export const SETTINGS_KEY = 'contributions';

/** One entry per control on the settings card; `value` is the default. */
export const SWITCHES = [
  {
    id: 'enabled',
    label: 'Contributions',
    value: 1,
    hint: 'Off takes the number out of the menu; the head of the panel is the title alone, as it was.',
  },
];

export const DEFAULTS = Object.fromEntries(SWITCHES.map((item) => [item.id, item.value]));

/** Storage is shared state: whatever shape comes back, every switch ends up on or off. */
export function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const settings = {};
  for (const { id, value } of SWITCHES) {
    const number = Number(source[id]);
    settings[id] = Number.isFinite(number) ? (number >= 1 ? 1 : 0) : value;
  }
  return settings;
}

/**
 * The year as the person lives it — local time, which is also the clock GitHub's own calendar has
 * drawn its squares by since it learned about time zones. `from` is the first instant of January
 * the 1st, `to` is now; GitHub allows at most a year between them, which a calendar year never
 * exceeds. Half past midnight on New Year's Day is the new year here even while UTC is still on
 * the old one.
 */
export function yearWindow(now = Date.now()) {
  const at = new Date(now);
  const year = at.getFullYear();
  return { year, from: new Date(year, 0, 1, 0, 0, 0, 0).toISOString(), to: at.toISOString() };
}

/**
 * One number, and whose it is. The calendar total is what the profile page prints under the graph,
 * so it is the figure the person already knows; the breakdown into commits, reviews and the rest
 * does not add up to it exactly and is left out rather than explained.
 */
export function buildQuery(window) {
  return {
    query: `
query($from: DateTime!, $to: DateTime!) {
  viewer {
    login
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions }
    }
  }
}`.trim(),
    variables: { from: window.from, to: window.to },
  };
}

/** What one token's answer becomes. Null when GitHub sent no calendar, which is a failure to the caller. */
export function shapeContributions(data) {
  const viewer = data?.viewer;
  const total = Number(viewer?.contributionsCollection?.contributionCalendar?.totalContributions);
  if (!viewer || typeof viewer !== 'object' || !Number.isFinite(total)) return null;
  return { login: String(viewer.login ?? '').trim(), total: Math.max(0, Math.round(total)) };
}

/**
 * A classic token sees every repository the account can reach and a fine-grained one sees a single
 * owner's, so two tokens can count the same year differently. The highest count is the closest to
 * what the profile shows: a repository a token cannot see is left out of its count, never counted
 * twice, so the largest answer is the most complete one.
 */
export function bestOf(results) {
  let best = null;
  for (const result of results ?? []) {
    if (!result || !Number.isFinite(result.total)) continue;
    if (!best || result.total > best.total) best = result;
  }
  return best;
}

function explain(status, errors) {
  const messages = (errors ?? []).map((error) => error?.message).filter(Boolean);
  const types = new Set((errors ?? []).map((error) => error?.type).filter(Boolean));
  if (status === 401) return 'GitHub rejected the token.';
  if (status === 403 || status === 429) return 'GitHub rate-limited the request. It will try again shortly.';
  if (types.has('INSUFFICIENT_SCOPES') || messages.some((message) => /scope|permission/i.test(message))) {
    return 'The token cannot read your contributions. A classic token with repo can; a fine-grained one counts only what it is allowed to see.';
  }
  if (messages.length > 0) return `GitHub said: ${messages[0].slice(0, 160)}`;
  if (status && status !== 200) return `GitHub returned ${status}.`;
  return 'GitHub did not answer.';
}

/** One token's count for the window. Throws with a sentence the settings page can show as it is. */
export async function fetchContributions(token, window) {
  const response = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(buildQuery(window)),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const shaped = shapeContributions(payload?.data);
  if (!response.ok || !shaped) throw new Error(explain(response.status, payload?.errors));
  return shaped;
}
