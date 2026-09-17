const API = 'https://api.github.com';
const DAY = 24 * 60 * 60 * 1000;

export const SETTINGS_KEY = 'news';

/** A fine-grained slug: one owner, one name, the characters GitHub allows in either. */
const REPO_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;
const MAX_REPOS = 30;

/**
 * How far back an edition may reach when the browser was shut for days: long enough that a week
 * away is one digest rather than six lost days, short enough that the digest is still a digest.
 */
export const LOOKBACK_DAYS = 7;
/** Detail lines a chip's popover shows before pointing at GitHub for the rest. */
export const POP_ITEMS = 8;
/** How many pull requests, issues and releases are fetched per repository and window. */
const PAGE = 50;
/** Every fetched item is capped to keep the edition small enough for storage.local to hold thirty repositories of it. */
const KEEP = 20;

/** One entry per control on the settings card; `value` is the default. */
export const SWITCHES = [
  { id: 'enabled', label: 'News', value: 1, hint: 'Off leaves the menu without the column, whatever is subscribed.' },
];

export const HOUR = {
  id: 'hour',
  label: 'Edition',
  min: 0,
  max: 23,
  value: 8,
  hint: 'The hour each day the edition is made up. It covers everything since the previous one — yesterday at the same hour, or further back if the browser was shut.',
};

export const DEFAULTS = { ...Object.fromEntries(SWITCHES.map((item) => [item.id, item.value])), hour: HOUR.value, repos: [] };

export function isRepoName(name) {
  return typeof name === 'string' && name.length <= 140 && REPO_NAME.test(name);
}

/** Case is kept as typed for display, compared without it: itk-dev/Economics is itk-dev/economics. */
function sameRepo(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * Storage is shared state: whatever shape comes back, every switch ends up on or off, the hour is
 * a whole one on the clock, and the repositories are well-formed slugs with no repeats.
 */
export function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const settings = {};
  for (const { id, value } of SWITCHES) {
    const number = Number(source[id]);
    settings[id] = Number.isFinite(number) ? (number >= 1 ? 1 : 0) : value;
  }
  const hour = Number(source.hour);
  settings.hour = Number.isInteger(hour) && hour >= HOUR.min && hour <= HOUR.max ? hour : HOUR.value;

  const repos = [];
  for (const entry of Array.isArray(source.repos) ? source.repos : []) {
    const name = String(entry ?? '').trim();
    if (!isRepoName(name) || repos.some((seen) => sameRepo(seen, name))) continue;
    repos.push(name);
    if (repos.length >= MAX_REPOS) break;
  }
  settings.repos = repos;
  return settings;
}

export function isSubscribed(settings, repo) {
  return (settings?.repos ?? []).some((seen) => sameRepo(seen, repo));
}

/** The list with `repo` added or removed; the same list back when nothing changes. */
export function toggleRepo(settings, repo, subscribe) {
  const name = String(repo ?? '').trim();
  const repos = settings?.repos ?? [];
  const has = repos.some((seen) => sameRepo(seen, name));
  if (subscribe && !has) {
    if (!isRepoName(name)) throw new Error('That is not a repository name. Use owner/repository.');
    if (repos.length >= MAX_REPOS) throw new Error(`gitchop follows at most ${MAX_REPOS} repositories.`);
    return [...repos, name];
  }
  if (!subscribe && has) return repos.filter((seen) => !sameRepo(seen, name));
  return repos;
}

/**
 * When the edition is made up: the most recent `hour` o'clock, local time, that has already
 * passed. Local because the hour is what the person reads it at, not a UTC boundary.
 */
export function editionTime(now, hour) {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  if (at.valueOf() > now) at.setDate(at.getDate() - 1);
  return at.valueOf();
}

/** The `hour` o'clock after `now` — where the alarm for the next edition goes. */
export function nextEditionTime(now, hour) {
  const at = new Date(editionTime(now, hour));
  at.setDate(at.getDate() + 1);
  return at.valueOf();
}

/**
 * What an edition covers. Made up daily, it runs from the previous edition's cutoff to its own —
 * yesterday at the same hour, on an ordinary day. Shut the browser for a long weekend and Monday's
 * edition reaches back to Friday's instead of losing the days between, up to a week; with no
 * previous edition it is the plain day. Asked again for the same edition — a manual refresh, a
 * repository subscribed at noon — it keeps the window it had, so the header does not move.
 */
export function editionWindow(now, hour, previous = null) {
  const until = editionTime(now, hour);
  const day = until - DAY;
  const before = Date.parse(previous?.until ?? '');
  const from = Date.parse(previous?.since ?? '');
  let since = day;
  if (!Number.isNaN(before)) {
    if (before === until && !Number.isNaN(from) && from < until) since = from;
    else since = Math.max(until - LOOKBACK_DAYS * DAY, Math.min(before, day));
  }
  return { since: new Date(since).toISOString(), until: new Date(until).toISOString() };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The rest of the menu is English; the clock is too, rather than whatever the locale would make of 08:00. */
function clock(ms) {
  const at = new Date(ms);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** "since yesterday 08:00", "since Friday 08:00", "since 3 Sep 08:00" — the header's one fact. */
export function describeSince(sinceIso, now = Date.now()) {
  const since = Date.parse(sinceIso ?? '');
  if (Number.isNaN(since)) return '';
  const startOf = (ms) => new Date(new Date(ms).toDateString()).valueOf();
  const days = Math.round((startOf(now) - startOf(since)) / DAY);
  const at = new Date(since);
  const time = clock(since);
  if (days <= 0) return `since ${time}`;
  if (days === 1) return `since yesterday ${time}`;
  if (days < 7) return `since ${WEEKDAYS[at.getDay()]} ${time}`;
  return `since ${at.getDate()} ${MONTHS[at.getMonth()]} ${time}`;
}

function within(iso, window) {
  const at = Date.parse(iso ?? '');
  return !Number.isNaN(at) && at >= Date.parse(window.since) && at < Date.parse(window.until);
}

function firstLine(text) {
  return String(text ?? '').split('\n')[0].trim().slice(0, 140);
}

function login(user) {
  return String(user?.login ?? '').slice(0, 60);
}

/**
 * Commits become one fact — how many, by whom — and the most recent few, so the popover can show
 * what the count is made of. The author is the GitHub login when GitHub matched one, else the name
 * on the commit, so a rebased or unlinked commit still counts as somebody's.
 */
export function shapeCommits(list, window, branch) {
  const commits = (Array.isArray(list) ? list : []).filter((entry) => within(entry?.commit?.committer?.date ?? entry?.commit?.author?.date, window));
  const authors = [];
  const recent = [];
  for (const entry of commits) {
    const name = login(entry.author) || String(entry.commit?.author?.name ?? '').trim().slice(0, 60);
    if (name && !authors.some((seen) => seen.toLowerCase() === name.toLowerCase())) authors.push(name);
    if (recent.length < KEEP) {
      recent.push({
        sha: String(entry.sha ?? '').slice(0, 7),
        message: firstLine(entry.commit?.message),
        author: name,
        url: String(entry.html_url ?? ''),
      });
    }
  }
  return { count: commits.length, authors, branch: String(branch ?? '').slice(0, 120), recent };
}

function shapeIssueLike(item) {
  return {
    number: Number(item.number) || 0,
    title: firstLine(item.title),
    url: String(item.html_url ?? ''),
    author: login(item.user),
  };
}

/**
 * A pull request is news for one reason at a time: merged beats opened beats closed without
 * merging, and a pull request opened and merged inside the window shows once, as merged.
 */
export function shapePulls(list, window) {
  const merged = [];
  const opened = [];
  const closed = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== 'object' || !item.html_url) continue;
    if (within(item.merged_at, window)) merged.push(shapeIssueLike(item));
    else if (within(item.created_at, window)) opened.push(shapeIssueLike(item));
    else if (item.state === 'closed' && within(item.closed_at, window)) closed.push(shapeIssueLike(item));
  }
  return { merged: merged.slice(0, KEEP), opened: opened.slice(0, KEEP), closed: closed.slice(0, KEEP) };
}

/** The issues endpoint returns pull requests too; anything carrying a pull_request key is not an issue. */
export function shapeIssues(list, window) {
  const opened = [];
  const closed = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== 'object' || !item.html_url || item.pull_request) continue;
    if (within(item.created_at, window)) opened.push(shapeIssueLike(item));
    else if (item.state === 'closed' && within(item.closed_at, window)) closed.push(shapeIssueLike(item));
  }
  return { opened: opened.slice(0, KEEP), closed: closed.slice(0, KEEP) };
}

/** Drafts are not published; a prerelease is, and says so. */
export function shapeReleases(list, window) {
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && typeof item === 'object' && !item.draft && within(item.published_at, window))
    .map((item) => ({
      tag: String(item.tag_name ?? '').slice(0, 80),
      name: firstLine(item.name),
      url: String(item.html_url ?? ''),
      prerelease: Boolean(item.prerelease),
    }))
    .slice(0, KEEP);
}

export function emptyDigest(repo) {
  return {
    repo,
    url: `https://github.com/${repo}`,
    private: false,
    commits: { count: 0, authors: [], branch: '', recent: [] },
    pulls: { merged: [], opened: [], closed: [] },
    issues: { opened: [], closed: [] },
    releases: [],
    error: null,
  };
}

export function isQuiet(digest) {
  if (!digest) return true;
  const { commits, pulls, issues, releases } = digest;
  return (
    (commits?.count ?? 0) === 0 &&
    (pulls?.merged?.length ?? 0) + (pulls?.opened?.length ?? 0) + (pulls?.closed?.length ?? 0) === 0 &&
    (issues?.opened?.length ?? 0) + (issues?.closed?.length ?? 0) === 0 &&
    (releases?.length ?? 0) === 0
  );
}

/** "tuj", "tuj and jekuno", "tuj, jekuno and marcel", "tuj, jekuno and 4 more" — people, in prose. */
export function listPhrase(names, shown = 2) {
  const list = (names ?? []).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length <= shown + 1) return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return `${list.slice(0, shown).join(', ')} and ${list.length - shown} more`;
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function commitsUrl(digest, window) {
  const branch = encodeURIComponent(digest.commits.branch || 'HEAD');
  return `${digest.url}/commits/${branch}?since=${encodeURIComponent(window.since)}&until=${encodeURIComponent(window.until)}`;
}

/** GitHub's search takes a date range with times in it; the milliseconds are the one thing it will not. */
function stamp(iso) {
  return String(iso).replace(/\.\d{3}Z$/, 'Z');
}

/** GitHub's own list of exactly this — the pull requests merged inside the window, say. */
function searchUrl(digest, list, qualifiers, field, window) {
  const query = `${qualifiers} ${field}:${stamp(window.since)}..${stamp(window.until)}`;
  return `${digest.url}/${list}?q=${encodeURIComponent(query)}`;
}

function issueItems(list) {
  return (list ?? []).map((item) => ({
    title: item.title || `#${item.number}`,
    detail: [`#${item.number}`, item.author].filter(Boolean).join(' · '),
    url: item.url,
  }));
}

const plain = (text) => ({ text });

/** A fact the reader can hover or land on: its popover lists `items`, and Enter opens `url`. */
function chip(text, kind, url, items, total = items.length) {
  return { text, chip: { kind, url, items: items.slice(0, POP_ITEMS), total } };
}

/**
 * "2 pull requests merged, 1 opened and 1 closed without merging." The noun rides on the first
 * part only; the rest are a number and a verb, which is how the sentence would be said aloud.
 */
function clause(segments, parts, noun, kind) {
  if (parts.length === 0) return;
  parts.forEach((part, index) => {
    if (index > 0) segments.push(plain(index === parts.length - 1 ? ' and ' : ', '));
    const text = index === 0 ? `${plural(part.count, noun)} ${part.verb}` : `${part.count} ${part.verb}`;
    segments.push(chip(text, kind, part.url, part.items));
    if (part.tail) segments.push(plain(part.tail));
  });
  segments.push(plain('. '));
}

/**
 * What one repository's day becomes on screen: a few sentences, most newsworthy first — a release
 * outranks everything, then the commits as one count, then the pull requests, then the issues.
 * Every fact in them is a chip: its popover lists what it is made of, and its link opens GitHub's
 * own list of exactly that, cut to the window. Segments are plain text or a chip, and the menu
 * draws them in order. A quiet day is no segments, and the menu says so.
 */
export function proseFor(digest, window) {
  const segments = [];

  const releases = digest.releases ?? [];
  if (releases.length > 0) {
    const [first] = releases;
    const items = releases.map((release) => ({
      title: release.name && release.name !== release.tag ? `${release.tag} — ${release.name}` : release.tag,
      detail: release.prerelease ? 'prerelease' : 'release',
      url: release.url,
    }));
    if (releases.length === 1) {
      segments.push(plain(first.prerelease ? 'Published prerelease ' : 'Released '), chip(first.tag, 'release', first.url, items));
      if (first.name && first.name !== first.tag) segments.push(plain(` — ${first.name}`));
    } else {
      const tags = listPhrase(releases.map((release) => release.tag));
      segments.push(plain('Released '), chip(tags, 'release', `${digest.url}/releases`, items));
    }
    segments.push(plain('. '));
  }

  const commits = digest.commits ?? {};
  if (commits.count > 0) {
    const items = (commits.recent ?? []).map((entry) => ({
      title: entry.message || entry.sha,
      detail: [entry.sha, entry.author].filter(Boolean).join(' · '),
      url: entry.url,
    }));
    segments.push(chip(plural(commits.count, 'commit'), 'commits', commitsUrl(digest, window), items, commits.count));
    if (commits.branch) segments.push(plain(` to ${commits.branch}`));
    const who = listPhrase(commits.authors);
    if (who) segments.push(plain(` by ${who}`));
    segments.push(plain('. '));
  }

  const pulls = digest.pulls ?? {};
  const pullParts = [];
  if (pulls.merged?.length > 0) {
    pullParts.push({ count: pulls.merged.length, verb: 'merged', url: searchUrl(digest, 'pulls', 'is:pr is:merged', 'merged', window), items: issueItems(pulls.merged) });
  }
  if (pulls.opened?.length > 0) {
    pullParts.push({ count: pulls.opened.length, verb: 'opened', url: searchUrl(digest, 'pulls', 'is:pr', 'created', window), items: issueItems(pulls.opened) });
  }
  if (pulls.closed?.length > 0) {
    pullParts.push({ count: pulls.closed.length, verb: 'closed', tail: ' without merging', url: searchUrl(digest, 'pulls', 'is:pr is:closed is:unmerged', 'closed', window), items: issueItems(pulls.closed) });
  }
  clause(segments, pullParts, 'pull request', 'pull');

  const issues = digest.issues ?? {};
  const issueParts = [];
  if (issues.opened?.length > 0) {
    issueParts.push({ count: issues.opened.length, verb: 'opened', url: searchUrl(digest, 'issues', 'is:issue', 'created', window), items: issueItems(issues.opened) });
  }
  if (issues.closed?.length > 0) {
    issueParts.push({ count: issues.closed.length, verb: 'closed', url: searchUrl(digest, 'issues', 'is:issue is:closed', 'closed', window), items: issueItems(issues.closed) });
  }
  clause(segments, issueParts, 'issue', 'issue');

  if (segments.length > 0) segments[segments.length - 1] = plain('.');
  return segments;
}

/** The same sentences as one string, for anywhere without chips — the settings page, a tooltip. */
export function proseText(segments) {
  return (segments ?? []).map((segment) => segment.text).join('');
}

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function explain(status, anonymous) {
  if (status === 401) return 'GitHub rejected the token.';
  if (status === 404) return anonymous ? 'Not found — a private repository needs a token that can see it.' : 'Not found, or the token cannot see it.';
  if (status === 403 || status === 429) return anonymous ? 'GitHub rate-limited the request. A token raises the limit.' : 'GitHub rate-limited the request.';
  if (status === 451) return 'GitHub has taken the repository down.';
  return `GitHub returned ${status}.`;
}

async function get(path, token) {
  const response = await fetch(`${API}${path}`, { headers: headers(token) });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

/**
 * The repository itself: proves the name, canonicalises its case and says which branch is the
 * one that matters. Throws with a sentence the menu and the settings page can show as it is.
 */
export async function lookupRepo(repo, token) {
  const [owner, name] = String(repo).split('/');
  const result = await get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, token);
  if (!result.ok) throw Object.assign(new Error(explain(result.status, !token)), { status: result.status });
  const body = result.body ?? {};
  return {
    fullName: String(body.full_name ?? repo),
    url: String(body.html_url ?? `https://github.com/${repo}`),
    private: Boolean(body.private),
    branch: String(body.default_branch ?? ''),
    archived: Boolean(body.archived),
  };
}

/**
 * One repository's window, in four requests after the lookup: the commits on the default branch
 * inside it, the pull requests and issues that moved lately, and the recent releases. Everything
 * is filtered here against the window, because only the commits endpoint takes an `until`.
 */
export async function fetchDigest(repo, window, token) {
  const about = await lookupRepo(repo, token);
  const base = `/repos/${about.fullName.split('/').map(encodeURIComponent).join('/')}`;
  const branch = about.branch ? `&sha=${encodeURIComponent(about.branch)}` : '';
  const since = encodeURIComponent(window.since);
  const until = encodeURIComponent(window.until);

  const [commits, pulls, issues, releases] = await Promise.all([
    get(`${base}/commits?since=${since}&until=${until}&per_page=100${branch}`, token),
    get(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=${PAGE}`, token),
    get(`${base}/issues?state=all&since=${since}&sort=updated&direction=desc&per_page=${PAGE}`, token),
    get(`${base}/releases?per_page=20`, token),
  ]);

  // An empty repository answers 409 to /commits; that is a quiet day, not a failure.
  const failed = [commits, pulls, issues, releases].find((part) => !part.ok && part.status !== 409);
  if (failed) throw Object.assign(new Error(explain(failed.status, !token)), { status: failed.status });

  return {
    ...emptyDigest(about.fullName),
    url: about.url,
    private: about.private,
    commits: shapeCommits(commits.ok ? commits.body : [], window, about.branch),
    pulls: shapePulls(pulls.body, window),
    issues: shapeIssues(issues.body, window),
    releases: shapeReleases(releases.body, window),
  };
}
