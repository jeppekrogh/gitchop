// The year is local time, so the clock the tests run against is pinned first.
process.env.TZ = 'Europe/Copenhagen';

import assert from 'node:assert';
import {
  DEFAULTS,
  SWITCHES,
  bestOf,
  buildQuery,
  sanitizeSettings,
  shapeContributions,
  yearWindow,
} from '../src/lib/contributions.js';

// Settings: one switch, on or off, on by default.
assert.deepEqual(sanitizeSettings(), DEFAULTS, 'nothing stored means the defaults');
assert.deepEqual(sanitizeSettings(null), DEFAULTS);
assert.deepEqual(sanitizeSettings('junk'), DEFAULTS);
assert.deepEqual(DEFAULTS, { enabled: 1 }, 'the number is in the menu until switched off');
assert.equal(sanitizeSettings({ enabled: '0' }).enabled, 0);
assert.equal(sanitizeSettings({ enabled: 7 }).enabled, 1, 'anything at or above one is on');
assert.equal(sanitizeSettings({ enabled: {} }).enabled, 1, 'a non-number falls back to the default');
for (const item of SWITCHES) assert.ok(item.label && item.hint, `${item.id} carries its settings-page text`);

// The window: this calendar year, local time, from the first instant of January to now.
const at = Date.parse('2026-09-22T10:00:00+02:00');
const window = yearWindow(at);
assert.equal(window.year, 2026);
assert.equal(window.from, '2025-12-31T23:00:00.000Z', 'midnight in Copenhagen on January the 1st, which is still New Year’s Eve in UTC');
assert.equal(window.to, new Date(at).toISOString());
assert.equal(yearWindow(Date.parse('2027-01-01T00:30:00+01:00')).year, 2027, 'half past midnight on New Year’s Day is the new year here, whatever UTC says');
assert.equal(yearWindow(Date.parse('2026-01-01T00:00:00+01:00')).from, new Date(Date.parse('2026-01-01T00:00:00+01:00')).toISOString(), 'the window can start now');

// The query asks the viewer for one number and who they are, over exactly that window.
const query = buildQuery(window);
assert.match(query.query, /viewer/);
assert.match(query.query, /\blogin\b/);
assert.match(query.query, /contributionsCollection\(from: \$from, to: \$to\)/);
assert.match(query.query, /contributionCalendar \{ totalContributions \}/, 'the calendar total is the figure the profile prints');
assert.deepEqual(query.variables, { from: window.from, to: window.to });

// Shaping: a login and a whole number; anything short of a calendar is no answer.
const answer = (total, login = 'jeppekrogh') => ({ viewer: { login, contributionsCollection: { contributionCalendar: { totalContributions: total } } } });
assert.deepEqual(shapeContributions(answer(1234)), { login: 'jeppekrogh', total: 1234 });
assert.deepEqual(shapeContributions(answer('12')), { login: 'jeppekrogh', total: 12 }, 'a numeric string is a number');
assert.equal(shapeContributions(answer(-3)).total, 0, 'never below nought');
assert.equal(shapeContributions(answer(0)).total, 0, 'nought is an answer, not a failure');
assert.equal(shapeContributions(answer(5, null)).login, '', 'no login is an empty string');
assert.equal(shapeContributions(null), null);
assert.equal(shapeContributions({}), null);
assert.equal(shapeContributions({ viewer: { login: 'x' } }), null, 'no calendar is no answer');
assert.equal(shapeContributions(answer('lots')), null, 'a count that is not a number is no answer');

// The highest count wins: a token that sees fewer repositories counts fewer, never more.
assert.deepEqual(
  bestOf([{ login: 'a', total: 10 }, null, { login: 'a', total: 42 }, { login: 'a', total: 7 }]),
  { login: 'a', total: 42 },
);
assert.deepEqual(bestOf([{ login: 'a', total: 0 }]), { login: 'a', total: 0 }, 'a single nought is still the answer');
assert.equal(bestOf([]), null);
assert.equal(bestOf([null, undefined]), null);
assert.equal(bestOf(), null);

console.log('contributions ok');
