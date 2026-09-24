/**
 * One page at a time. The rail names every page under three headings, the page chosen is the only
 * one in the layout, and the choice is kept — in the hash, so a reload lands where it left off,
 * and in localStorage, so the next visit does too. Every page stays in the document, hidden,
 * because each card's module finds its elements when it loads. The rail is buttons rather than anchors:
 * the harness loads this page into a frame under a <base>, where a #hash link would navigate the
 * frame away; here the hash is only ever written, and only where writing it is allowed.
 */
const KEY = 'gitchop:settings:page';

const rail = document.querySelector('.rail');
const items = [...rail.querySelectorAll('.rail-item')];
const panes = [...document.querySelectorAll('.pane[data-page]')];

function known(id) {
  return items.some((item) => item.dataset.page === id) ? id : null;
}

function remembered() {
  try {
    return known(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function remember(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* a page that cannot remember still pages */
  }
  try {
    if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
  } catch {
    /* the frame in the harness may refuse; the choice is still kept above */
  }
}

/** The page named, or the one remembered, or the rail's default, or the first; says which it settled on. */
export function show(id) {
  const page = known(id) ?? remembered() ?? known(rail.dataset.default) ?? items[0].dataset.page;
  for (const pane of panes) pane.hidden = pane.dataset.page !== page;
  for (const item of items) {
    if (item.dataset.page === page) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  remember(page);
  return page;
}

export function mount() {
  for (const item of items) item.addEventListener('click', () => show(item.dataset.page));
  // Up and down walk the rail and Home and End jump to its ends, each landing on the page it names.
  rail.addEventListener('keydown', (event) => {
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const item = items[Math.max(0, Math.min(items.length - 1, next))];
    item.focus();
    show(item.dataset.page);
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
}
