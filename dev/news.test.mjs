// The edition hour is local time, so the clock the tests run against is pinned first.
process.env.TZ = 'Europe/Copenhagen';

import assert from 'node:assert';
import {
  DEFAULTS,
  HOUR,
  LOOKBACK_DAYS,
  ROWS_PER_REPO,
  SWITCHES,
  describeSince,
  editionTime,
  editionWindow,
  emptyDigest,
  isQuiet,
  isRepoName,
  isSubscribed,
  nameAuthors,
  nextEditionTime,
  rowsFor,
  sanitizeSettings,
  shapeCommits,
  shapeIssues,
  shapePulls,
  shapeReleases,
  toggleRepo,
} from '../src/lib/news.js';

// Settings: one switch, an hour on the clock, and a list of well-formed repository names.
assert.deepEqual(sanitizeSettings(), DEFAULTS, 'nothing stored means the defaults');
assert.deepEqual(sanitizeSettings(null), DEFAULTS);
assert.deepEqual(sanitizeSettings('junk'), DEFAULTS);
assert.deepEqual(DEFAULTS, { enabled: 1, hour: 8, repos: [] }, 'on, at eight, following nothing yet');
assert.equal(sanitizeSettings({ enabled: '0' }).enabled, 0);
assert.equal(sanitizeSettings({ hour: 23 }).hour, 23);
assert.equal(sanitizeSettings({ hour: 24 }).hour, HOUR.value, 'an hour off the clock is the default');
assert.equal(sanitizeSettings({ hour: 7.5 }).hour, HOUR.value, 'a whole hour or nothing');
assert.deepEqual(
  sanitizeSettings({ repos: ['itk-dev/economics', ' ITK-dev/Economics ', 'not a repo', 'a/b/c', 42, 'os2display/display-api-service'] }).repos,
  ['itk-dev/economics', 'os2display/display-api-service'],
  'case is one repository, junk is dropped, trimming happens first',
);
assert.equal(sanitizeSettings({ repos: Array.from({ length: 40 }, (_, i) => `owner/repo-${i}`) }).repos.length, 30, 'capped');
for (const item of SWITCHES) assert.ok(item.label && item.hint, `${item.id} carries its settings-page text`);

assert.ok(isRepoName('itk-dev/economics'));
assert.ok(isRepoName('Leantime/leantime.io'));
assert.ok(!isRepoName('economics'), 'no owner');
assert.ok(!isRepoName('itk-dev/'), 'no name');
assert.ok(!isRepoName('-itk/economics'), 'owners cannot start with a hyphen');
assert.ok(!isRepoName('itk dev/economics'));
assert.ok(!isRepoName(null));

// Subscribing and unsubscribing; the same list back when nothing changes.
const following = sanitizeSettings({ repos: ['itk-dev/economics'] });
assert.ok(isSubscribed(following, 'ITK-DEV/ECONOMICS'), 'membership ignores case');
assert.ok(!isSubscribed(following, 'itk-dev/gitchop'));
assert.deepEqual(toggleRepo(following, 'itk-dev/gitchop', true), ['itk-dev/economics', 'itk-dev/gitchop']);
assert.equal(toggleRepo(following, 'ITK-dev/economics', true), following.repos, 'already there: untouched');
assert.deepEqual(toggleRepo(following, 'ITK-dev/economics', false), []);
assert.equal(toggleRepo(following, 'itk-dev/gitchop', false), following.repos, 'not there: untouched');
assert.throws(() => toggleRepo(following, 'nonsense', true), /owner\/repository/);
assert.throws(() => toggleRepo({ repos: Array.from({ length: 30 }, (_, i) => `o/r${i}`) }, 'o/one-more', true), /at most 30/);

// The edition: the most recent eight o'clock that has passed, local time.
const at = (text) => Date.parse(text);
assert.equal(editionTime(at('2026-09-17T09:30:00+02:00'), 8), at('2026-09-17T08:00:00+02:00'), 'past eight: today');
assert.equal(editionTime(at('2026-09-17T07:59:00+02:00'), 8), at('2026-09-16T08:00:00+02:00'), 'before eight: yesterday');
assert.equal(editionTime(at('2026-09-17T08:00:00+02:00'), 8), at('2026-09-17T08:00:00+02:00'), 'on the hour counts');
assert.equal(nextEditionTime(at('2026-09-17T09:30:00+02:00'), 8), at('2026-09-18T08:00:00+02:00'), 'the alarm goes tomorrow');
assert.equal(nextEditionTime(at('2026-09-17T07:59:00+02:00'), 8), at('2026-09-17T08:00:00+02:00'), 'or in a minute');
assert.equal(
  nextEditionTime(at('2026-10-24T09:00:00+02:00'), 8) - editionTime(at('2026-10-24T09:00:00+02:00'), 8),
  25 * 60 * 60 * 1000,
  'across the autumn clock change the next edition is still at eight, so that day is 25 hours long',
);

// The window: yesterday at eight on an ordinary day, back to the previous edition after a break.
const now = at('2026-09-17T09:30:00+02:00');
const fresh = editionWindow(now, 8);
assert.deepEqual(fresh, { since: '2026-09-16T06:00:00.000Z', until: '2026-09-17T06:00:00.000Z' }, 'no previous edition: one day');

const monday = at('2026-09-21T09:00:00+02:00');
const friday = editionWindow(at('2026-09-18T09:00:00+02:00'), 8);
assert.deepEqual(
  editionWindow(monday, 8, friday),
  { since: friday.until, until: '2026-09-21T06:00:00.000Z' },
  'after a weekend away, Monday reaches back to Friday',
);
assert.deepEqual(editionWindow(now, 8, fresh), fresh, 'asked again for the same edition, the window stays put');
assert.deepEqual(
  editionWindow(now, 8, { since: '2026-09-15T06:00:00.000Z', until: fresh.until }),
  { since: '2026-09-15T06:00:00.000Z', until: fresh.until },
  'a same-edition refresh keeps a longer window too',
);
const away = editionWindow(at('2026-09-01T09:00:00+02:00'), 8);
assert.equal(
  editionWindow(now, 8, away).since,
  new Date(at(fresh.until) - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  'a fortnight away is capped at a week',
);
assert.deepEqual(editionWindow(now, 8, { since: 'junk', until: 'junk' }), fresh, 'an unreadable previous edition is no edition');
assert.deepEqual(
  editionWindow(at('2026-09-17T21:00:00+02:00'), 20, fresh),
  { since: '2026-09-16T18:00:00.000Z', until: '2026-09-17T18:00:00.000Z' },
  'moving the hour later the same day: a plain day ending at the new hour',
);

// The header's one fact.
assert.equal(describeSince('2026-09-16T06:00:00.000Z', now), 'since yesterday 08:00');
assert.equal(describeSince('2026-09-18T06:00:00.000Z', monday), 'since Friday 08:00');
assert.equal(describeSince('2026-09-01T06:00:00.000Z', now), 'since 1 Sep 08:00');
assert.equal(describeSince('2026-09-17T06:00:00.000Z', now), 'since 08:00', 'the same day is just the hour');
assert.equal(describeSince(null, now), '');
assert.equal(describeSince('garbage', now), '');

// Shaping: what GitHub sends, filtered to the window, cut down to what a row needs.
const window = fresh;
const inside = '2026-09-16T12:00:00Z';
const before = '2026-09-15T12:00:00Z';
const commit = (date, over = {}) => ({
  sha: 'abc',
  author: { login: 'tuj' },
  commit: { message: 'Fix the thing\n\nLonger body', author: { name: 'Thomas', date }, committer: { date } },
  ...over,
});
const commits = shapeCommits(
  [
    commit(inside, { commit: { message: 'Newest first', author: { name: 'T', date: inside }, committer: { date: inside } } }),
    commit(inside, { author: { login: 'TUJ' } }),
    commit(inside, { author: null, commit: { message: 'Unlinked', author: { name: 'Someone Else', date: inside }, committer: { date: inside } } }),
    commit(before),
  ],
  window,
  'main',
);
assert.equal(commits.count, 3, 'the one before the window is dropped');
assert.deepEqual(commits.authors, ['tuj', 'Someone Else'], 'logins deduplicate without case; an unlinked commit falls back to the name');
assert.equal(commits.branch, 'main');
assert.equal(commits.latest, 'Newest first', 'the first line of the newest message');
assert.deepEqual(shapeCommits(null, window, ''), { count: 0, authors: [], branch: '', latest: '' });

const pr = (number, over = {}) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/a/b/pull/${number}`,
  user: { login: 'tuj' },
  state: 'open',
  created_at: before,
  merged_at: null,
  closed_at: null,
  ...over,
});
const pulls = shapePulls(
  [
    pr(1, { state: 'closed', merged_at: inside, closed_at: inside, created_at: inside }),
    pr(2, { created_at: inside }),
    pr(3, { state: 'closed', closed_at: inside }),
    pr(4),
    pr(5, { state: 'closed', merged_at: before, closed_at: before }),
    { title: 'no url' },
    null,
  ],
  window,
);
assert.deepEqual(pulls.merged.map((pull) => pull.number), [1], 'opened and merged inside the window shows once, as merged');
assert.deepEqual(pulls.opened.map((pull) => pull.number), [2]);
assert.deepEqual(pulls.closed.map((pull) => pull.number), [3], 'closed without merging');
assert.deepEqual(pulls.merged[0], { number: 1, title: 'PR 1', url: 'https://github.com/a/b/pull/1', author: 'tuj' });

const issues = shapeIssues(
  [
    pr(10, { created_at: inside, html_url: 'https://github.com/a/b/issues/10' }),
    pr(11, { state: 'closed', closed_at: inside, html_url: 'https://github.com/a/b/issues/11' }),
    pr(12, { created_at: inside, pull_request: { url: 'x' } }),
    pr(13),
  ],
  window,
);
assert.deepEqual(issues.opened.map((issue) => issue.number), [10]);
assert.deepEqual(issues.closed.map((issue) => issue.number), [11]);

const releases = shapeReleases(
  [
    { tag_name: 'v2.4.0', name: 'Pull requests beside the menu', html_url: 'https://github.com/a/b/releases/tag/v2.4.0', published_at: inside, draft: false, prerelease: false },
    { tag_name: 'v2.5.0-rc1', name: '', html_url: 'https://github.com/a/b/releases/tag/v2.5.0-rc1', published_at: inside, draft: false, prerelease: true },
    { tag_name: 'v3', name: 'Draft', html_url: 'https://github.com/a/b/releases/tag/v3', published_at: null, draft: true },
    { tag_name: 'v2.3.0', name: 'Old', html_url: 'https://github.com/a/b/releases/tag/v2.3.0', published_at: before, draft: false },
  ],
  window,
);
assert.deepEqual(
  releases.map((release) => [release.tag, release.prerelease]),
  [['v2.4.0', false], ['v2.5.0-rc1', true]],
  'drafts and old releases are out; prereleases are in and say so',
);

// Rows: a release outranks everything, then the commits line, then pull requests, then issues.
const digest = {
  ...emptyDigest('itk-dev/economics'),
  commits,
  pulls,
  issues,
  releases,
};
assert.ok(!isQuiet(digest));
assert.ok(isQuiet(emptyDigest('a/b')));
assert.ok(isQuiet(null));
assert.deepEqual(rowsFor(emptyDigest('a/b'), window), [], 'a quiet day is no rows, and the menu says so');

const rows = rowsFor(digest, window);
assert.deepEqual(
  rows.map((row) => [row.kind, row.tail]),
  [
    ['release', 'release'],
    ['release', 'prerelease'],
    ['commits', 'tuj, Someone Else'],
    ['pull', 'merged'],
    ['pull', 'opened'],
    ['pull', 'closed'],
    ['issue', 'opened'],
    ['issue', 'closed'],
  ],
);
assert.equal(rows[0].title, 'v2.4.0 — Pull requests beside the menu', 'tag and name, when the name adds something');
assert.equal(rows[1].title, 'v2.5.0-rc1', 'a nameless release is its tag');
assert.equal(rows[2].title, '3 commits to main');
assert.equal(rows[2].tip, 'Newest first', 'the latest message rides along as the tooltip');
assert.equal(
  rows[2].url,
  `https://github.com/itk-dev/economics/commits/main?since=${encodeURIComponent(window.since)}&until=${encodeURIComponent(window.until)}`,
  'the commits row opens GitHub’s own list, cut to the window',
);
assert.equal(rows[3].title, 'PR 1');
assert.equal(rows[3].author, 'tuj');

const busy = {
  ...emptyDigest('a/b'),
  pulls: { merged: Array.from({ length: 12 }, (_, i) => ({ number: i, title: `Merged ${i}`, url: `https://github.com/a/b/pull/${i}`, author: 'x' })), opened: [], closed: [] },
};
const capped = rowsFor(busy, window);
assert.equal(capped.length, ROWS_PER_REPO, 'a busy repository is cut to the cap, the tail included');
assert.deepEqual(capped[ROWS_PER_REPO - 1], { kind: 'more', title: '5 more on GitHub', tail: '', url: 'https://github.com/a/b/pulse' });
assert.equal(rowsFor(busy, window, 12).length, 12, 'exactly at the cap, no tail is needed');
assert.equal(rowsFor({ ...emptyDigest('a/b'), commits: { count: 1, authors: ['solo'], branch: '', latest: '' } }, window)[0].title, '1 commit', 'singular, and no branch when none is known');

assert.equal(nameAuthors([]), '');
assert.equal(nameAuthors(['tuj']), 'tuj');
assert.equal(nameAuthors(['tuj', 'jekuno']), 'tuj, jekuno');
assert.equal(nameAuthors(['tuj', 'jekuno', 'marcel', 'anna']), 'tuj, jekuno +2');

console.log('news ok');
