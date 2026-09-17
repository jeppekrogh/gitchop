window.__gitchop = window.__gitchop || {};

(() => {
  const gc = window.__gitchop;
  const api = globalThis.browser ?? globalThis.chrome;

  const SEARCH_AFTER = 3;
  const SEARCH_DELAY = 300;

  /**
   * How long to let typing settle before the list is rebuilt. Long enough that "e", "ec", "eco"
   * is one visual change rather than three, short enough to be imperceptible once you stop. The
   * network wait is separate and longer — the panel settles well before a request goes out.
   */
  const SETTLE = 110;

  /**
   * The repository area is always exactly this many rows tall while a search is on, filled with
   * skeletons or blanks, so the panel does not resize when results land under the cursor.
   */
  const REPO_SLOTS = 5;
  const GHOST_WIDTHS = ['62%', '47%', '71%', '54%', '43%'];

  /** Where you can land inside a repository, likeliest first. */
  const IN_REPO = [
    ['🔀', 'Pull requests', 'pulls'],
    ['🐛', 'Issues', 'issues'],
  ];

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function defaultLabel() {
    return document.title.replace(/\s*[·|—-]\s*GitHub\s*$/i, '').trim().slice(0, 80);
  }

  /** The one row in a lane that is not a pull request: the tail for whatever GitHub holds beyond what was fetched. */
  const MORE_ROW = 'more';

  /** Skeleton rows standing in for a repository the edition has not reached yet. */
  const NEWS_SLOTS = 2;
  /** About how many lines a fact's popover shows before it scrolls. */
  const POP_LINES = 20;

  gc.createMenu = function createMenu({ ctx, links, pulls, news, onClose, onOptions, onLinksChanged }) {
    const panel = node('div', 'gc-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'gitchop links');

    const head = node('div', 'gc-head');
    head.append(node('span', 'gc-title', 'Links'));

    const filter = node('input', 'gc-filter');
    filter.type = 'text';
    filter.placeholder = 'Filter links, or search repositories…';
    filter.autocomplete = 'off';
    filter.spellcheck = false;
    filter.setAttribute('aria-label', 'Filter links or search repositories');

    const list = node('ul', 'gc-list');
    list.setAttribute('role', 'listbox');

    const keys = node('span', 'gc-keys');
    const foot = node('div', 'gc-foot');
    foot.append(keys);

    panel.append(head, filter, list, foot);

    /**
     * The panel and the columns beside it rise into the cut as one slab, so the stage is what the
     * chop animates: the news on the left, the pull requests on the right. Each column only exists
     * when the background said so — a token that can read pull requests and the switch on; the
     * news switch on. Without them the stage is the panel alone, exactly as before.
     */
    const stage = node('div', 'gc-stage');
    stage.dataset.region = 'panel';
    stage.dataset.pulls = String(Boolean(pulls?.show));
    stage.dataset.news = String(Boolean(news?.show) && (news?.repos?.length ?? 0) > 0);
    stage.append(panel);

    // The news column is in the tree whenever the feature is on, and in the layout only while
    // something is subscribed — so the first subscription made from the menu raises it at once,
    // and the last unsubscription lets it go, without the menu being reopened.
    let newsEl = null;
    let newsList = null;
    let newsSince = null;
    if (news?.show) {
      newsEl = node('aside', 'gc-news');
      newsEl.setAttribute('aria-label', 'News from the repositories you follow');
      const newsHead = node('div', 'gc-head');
      newsSince = node('span', 'gc-since');
      newsHead.append(node('span', 'gc-title', 'News'), newsSince);
      newsList = node('ul', 'gc-list gc-lanes');
      newsList.setAttribute('role', 'listbox');
      newsList.setAttribute('aria-label', 'News');
      newsList.tabIndex = -1;
      newsEl.append(newsHead, newsList);
      stage.insertBefore(newsEl, panel);
    }

    let pullsEl = null;
    let pullsList = null;
    if (pulls?.show) {
      pullsEl = node('aside', 'gc-pulls');
      pullsEl.setAttribute('aria-label', 'Pull requests waiting on you');
      const pullsHead = node('div', 'gc-head');
      pullsHead.append(node('span', 'gc-title', 'Pull requests'));
      pullsList = node('ul', 'gc-list gc-lanes');
      pullsList.setAttribute('role', 'listbox');
      pullsList.setAttribute('aria-label', 'Pull requests');
      pullsList.tabIndex = -1;
      pullsEl.append(pullsHead, pullsList);
      stage.append(pullsEl);
    }

    // The full title of a pull request whose row had to cut it short, shown the instant the row is
    // hovered or becomes the cursor. One element for the whole column, moved to whichever row.
    // Shown and hidden by an attribute rather than `hidden`, so it can fade and rise into place.
    const pop = node('div', 'gc-pop');
    pop.dataset.shown = 'false';
    pop.setAttribute('role', 'tooltip');
    pop.setAttribute('aria-hidden', 'true');
    pullsEl?.append(pop);
    let popHover = null;

    function hidePop() {
      pop.dataset.shown = 'false';
      pop.setAttribute('aria-hidden', 'true');
    }

    function popFor(item) {
      const title = item?.querySelector('.gc-pr-title');
      if (!title || title.scrollWidth <= title.clientWidth) {
        hidePop();
        return;
      }
      const box = pullsEl.getBoundingClientRect();
      const row = item.getBoundingClientRect();
      const at = title.getBoundingClientRect();
      // Under the row, starting where the title starts and never past the column's edge. Only when
      // the column has no room left beneath does it go above instead.
      const left = Math.round(at.left - box.left);
      pop.style.left = `${left}px`;
      pop.style.maxWidth = `${Math.round(box.width - left - 14)}px`;
      pop.textContent = title.textContent;
      const below = row.bottom - box.top + 6 + pop.offsetHeight <= box.height - 6;
      pop.dataset.below = String(below);
      pop.style.top = `${Math.round((below ? row.bottom + 6 : row.top - 6) - box.top)}px`;
      pop.dataset.shown = 'true';
      pop.setAttribute('aria-hidden', 'false');
    }

    /** Whatever the mouse is over wins; otherwise the cursor, if it is in this column. */
    function placePop() {
      if (!pullsEl) return;
      if (popHover) popFor(popHover);
      else if (region === 'pulls') popFor(pullsItems[pullsIndex]?.item);
      else hidePop();
    }
    pullsList?.addEventListener('scroll', hidePop, { passive: true });

    /**
     * What a fact in the news is made of — the pull requests behind "2 pull requests merged",
     * every message behind "23 commits" — under the sentence it sits in, the moment the chip is
     * hovered or becomes the cursor. Unlike the title above it is a place to be: every line is a
     * link, a long list scrolls inside it, and once the mouse has opened it, it stays for as long
     * as the mouse is anywhere over the column, so it can be read and scrolled at leisure. It goes
     * when the mouse leaves the column, when another chip is hovered, or when the list scrolls
     * under it. One element for the column, filled per chip.
     */
    const newsPop = node('div', 'gc-pop gc-pop--list');
    newsPop.dataset.shown = 'false';
    newsPop.setAttribute('aria-hidden', 'true');
    newsEl?.append(newsPop);
    let newsHover = null;
    let newsMouseIn = false;
    let newsShown = null;

    function hideNewsPop() {
      newsShown = null;
      newsPop.dataset.shown = 'false';
      newsPop.setAttribute('aria-hidden', 'true');
    }

    function popLine(title, detail, url, more = false) {
      const usable = gc.isSafeUrl(url);
      const line = node(usable ? 'a' : 'div', `gc-pop-item${more ? ' gc-pop-item--more' : ''}`);
      if (usable) {
        line.href = url;
        line.addEventListener('click', (event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
          cancelSearch();
          onClose();
        });
      }
      line.append(node('span', 'gc-pop-title', title));
      if (detail) line.append(node('span', 'gc-pop-detail', detail));
      return line;
    }

    /** Every line the fact is made of; only a fetch that stopped short ends with a line pointing at GitHub. */
    function fillNewsPop(chip) {
      newsPop.textContent = '';
      for (const item of chip.items ?? []) newsPop.append(popLine(item.title, item.detail, item.url));
      if (chip.more) newsPop.append(popLine('more on GitHub', '', chip.url, true));
    }

    /**
     * Under the line the chip sits on, the width of the column's text, and no taller than about
     * twenty lines or the room the column has left beneath — whichever is less — so a long list
     * scrolls inside it rather than running off the column. Above only when beneath is not enough
     * and above has more.
     */
    function newsPopAt(chipEl, chip) {
      if (!chipEl || !chip || (chip.items?.length ?? 0) === 0) {
        hideNewsPop();
        return;
      }
      if (newsShown?.item !== chipEl) {
        fillNewsPop(chip);
        newsPop.scrollTop = 0;
      }
      newsShown = { item: chipEl, chip };
      const box = newsEl.getBoundingClientRect();
      const at = chipEl.getBoundingClientRect();
      const left = 13;
      newsPop.style.left = `${left}px`;
      newsPop.style.width = `${Math.round(box.width - left - 15)}px`;
      newsPop.style.maxHeight = '';
      const natural = newsPop.offsetHeight;
      const line = newsPop.firstElementChild?.offsetHeight || 25;
      const roomBelow = box.height - 6 - (at.bottom - box.top + 6);
      const roomAbove = at.top - box.top - 12;
      const below = natural <= roomBelow || roomBelow >= roomAbove;
      newsPop.style.maxHeight = `${Math.round(Math.max(line * 3, Math.min(line * POP_LINES + 10, below ? roomBelow : roomAbove)))}px`;
      newsPop.dataset.below = String(below);
      newsPop.style.top = `${Math.round((below ? at.bottom + 6 : at.top - 6) - box.top)}px`;
      newsPop.dataset.shown = 'true';
      newsPop.setAttribute('aria-hidden', 'false');
    }

    /**
     * The chip under the mouse wins; otherwise the cursor, while it is in the news. Otherwise a
     * popover the mouse opened stays as long as the mouse is anywhere over the column — that is
     * what lets a long list be scrolled — and goes when it leaves.
     */
    function placeNewsPop() {
      if (!newsEl) return;
      const target = newsHover ?? (region === 'news' ? newsItems[newsIndex] : null);
      if (target) newsPopAt(target.item, target.entry.chip);
      else if (!newsMouseIn) hideNewsPop();
    }
    newsEl?.addEventListener('mouseenter', () => {
      newsMouseIn = true;
    });
    newsEl?.addEventListener('mouseleave', () => {
      newsMouseIn = false;
      newsHover = null;
      placeNewsPop();
    });
    // The chip it hangs from has moved; where to is not worth working out.
    newsList?.addEventListener('scroll', hideNewsPop, { passive: true });

    let current = links.slice();
    let items = [];
    let activeIndex = 0;
    let form = null;
    // Both result sets carry the query they belong to, so a render can never mix a fresh query
    // with results computed for an older one.
    let repos = { query: '', status: 'idle', results: [], error: '' };
    let mine = { query: '', results: [] };
    let searchTimer = null;
    let searchRun = 0;
    let settleTimer = null;
    let localRun = 0;
    let drill = null;
    // Which column the keyboard is in. Focus itself sits on the filter or on the pull requests list;
    // this is the same fact, kept where paint() can read it without asking the DOM.
    let region = 'panel';
    let pullsData = pulls ?? null;
    let pullsItems = [];
    let pullsIndex = 0;
    let pullsRun = 0;
    let newsData = news ?? null;
    let newsItems = [];
    let newsIndex = 0;
    let newsRun = 0;
    let newsBusy = false;

    function subscribed(repo) {
      return (newsData?.settings?.repos ?? []).some((seen) => seen.toLowerCase() === String(repo).toLowerCase());
    }

    /** The subscribe row for one repository — inside it, or as a command when standing on its page. */
    function subscribeEntry(repo, label) {
      const on = subscribed(repo);
      return {
        usable: true,
        url: '',
        icon: on ? '◉' : '◎',
        label: on ? `Unsubscribe${label ? ` ${label}` : ''} from news` : `Subscribe to news${label ? ` for ${label}` : ''}`,
        keywords: 'subscribe follow news unsubscribe unfollow digest',
        reason: '',
        tip: '',
        repo: null,
        run: () => toggleNews(repo, !on),
      };
    }

    /**
     * Commands live in the list rather than as buttons, so they are reachable by typing. The
     * repository you are standing on rarely has a row of its own — the default links point inside
     * it, not at it — so subscribing to it is a command here rather than a level down.
     */
    const ACTIONS = [
      { icon: '＋', label: 'Add this page', keywords: 'add save bookmark current page', run: () => openForm() },
      { icon: '⚙', label: 'Settings', keywords: 'settings manage options edit reorder remove delete sync', run: () => onOptions?.() },
    ];

    function actions() {
      const list = ACTIONS.slice();
      if (newsData?.show && ctx.repoFull) list.splice(1, 0, subscribeEntry(ctx.repoFull, ctx.repoFull));
      return list;
    }

    function linkEntries(query) {
      const needle = query.toLowerCase();
      return current
        .map((link) => {
          const resolved = gc.resolveUrl(link.url, ctx);
          const usable = resolved.missing.length === 0 && gc.isSafeUrl(resolved.url);
          return {
            usable,
            url: resolved.url,
            icon: link.icon || '·',
            label: link.label || link.url,
            reason: usable ? '' : `needs ${resolved.missing.map((key) => `{${key}}`).join(' ') || 'a valid url'}`,
            tip: usable ? resolved.url : '',
            repo: usable ? gc.repoFromUrl(resolved.url) : null,
          };
        })
        .filter((entry) => !needle || `${entry.label} ${entry.url}`.toLowerCase().includes(needle));
    }

    function actionEntries(query) {
      const needle = query.toLowerCase();
      return actions()
        .filter((action) => !needle || `${action.label} ${action.keywords}`.toLowerCase().includes(needle))
        .map((action) => ({
          usable: true,
          url: '',
          icon: action.icon,
          label: action.label,
          reason: '',
          tip: '',
          repo: null,
          run: action.run,
        }));
    }

    function repoEntry(repo) {
      return {
        usable: gc.isSafeUrl(repo.url),
        url: repo.url,
        icon: repo.private ? '◆' : '◇',
        label: repo.fullName,
        reason: '',
        tip: [repo.description, repo.archived ? '(archived)' : ''].filter(Boolean).join(' ') || repo.url,
        repo: repo.fullName,
        owned: repo.owned,
      };
    }

    /** The places inside a repository, and — with the news on — whether its days land in the column. */
    function drillEntries() {
      const entries = IN_REPO.map(([icon, label, path]) => ({
        usable: true,
        url: new URL(`${encodeURIComponent(drill.repo).replace(/%2F/g, '/')}/${path}`, 'https://github.com/').href,
        icon,
        label,
        reason: '',
        tip: '',
        repo: null,
      }));
      if (newsData?.show) entries.push(subscribeEntry(drill.repo, ''));
      return entries;
    }

    function cancelSearch() {
      clearTimeout(searchTimer);
      searchRun += 1;
    }

    function enterDrill(repo) {
      drill = { repo, backIndex: activeIndex };
      activeIndex = 0;
      render();
    }

    function leaveDrill() {
      if (!drill) return false;
      const { backIndex } = drill;
      drill = null;
      activeIndex = backIndex;
      render();
      return true;
    }

    /**
     * Navigating in this tab dismisses the overlay first. The page load is not gitchop's wait,
     * and leaving the menu up through it made an instant Enter look like it was blocked on the
     * repository search still spinning underneath.
     */
    function open(entry, newTab) {
      if (!entry) return;
      if (entry.run) {
        entry.run();
        return;
      }
      if (!entry.usable) return;
      if (newTab) {
        window.open(entry.url, '_blank', 'noopener');
        return;
      }
      cancelSearch();
      onClose();
      window.location.assign(entry.url);
    }

    /** A column is in the layout only while the viewport has room for it; the CSS decides. */
    function pullsVisible() {
      return Boolean(pullsEl) && pullsEl.getClientRects().length > 0;
    }

    function newsVisible() {
      return Boolean(newsEl) && newsEl.getClientRects().length > 0;
    }

    /** The columns the cursor can be in, left to right: only a side column with rows in it counts. */
    function regions() {
      const order = [];
      if (newsVisible() && newsItems.length > 0) order.push('news');
      order.push('panel');
      if (pullsVisible() && pullsItems.length > 0) order.push('pulls');
      return order;
    }

    /**
     * The strip under the panel says what the keys do from wherever the cursor is — the column
     * included, so it has no strip of its own. Only the keys worth telling: moving up and down is
     * not one of them. A pair with no key is a plain word.
     */
    function hint(...pairs) {
      keys.textContent = '';
      for (const [key, label] of pairs) {
        const group = node('span', 'gc-hint');
        if (key) group.append(node('kbd', 'gc-key', key));
        group.append(document.createTextNode(label));
        keys.append(group);
      }
    }

    function paint() {
      items.forEach(({ item }, index) => {
        item.dataset.active = String(index === activeIndex);
      });
      if (region === 'panel') items[activeIndex]?.item.scrollIntoView({ block: 'nearest' });

      pullsItems.forEach(({ item }, index) => {
        item.dataset.active = String(index === pullsIndex);
      });
      if (region === 'pulls') pullsItems[pullsIndex]?.item.scrollIntoView({ block: 'nearest' });

      newsItems.forEach(({ item }, index) => {
        item.dataset.active = String(index === newsIndex);
      });
      if (region === 'news') newsItems[newsIndex]?.item.scrollIntoView({ block: 'nearest' });
      placePop();
      placeNewsPop();

      const order = regions();
      const across = order.includes('pulls');
      const left = order.includes('news');
      // With a column on either side the strip is full; esc is the one key nobody needs telling.
      const close = left && across ? [] : [['esc', 'close']];
      if (region === 'pulls') hint(['enter', 'open'], ['←', 'back'], [null, 'type to search']);
      else if (region === 'news') hint(['enter', 'open'], ['→', 'back'], [null, 'type to search']);
      else if (drill) hint(['enter', 'open'], ['←', 'back']);
      else if (items[activeIndex]?.entry.repo) {
        hint(['enter', 'open'], ['→', 'inside'], ...(left ? [['←', 'news']] : []), ...(across ? [['tab', 'pull requests']] : []));
      } else {
        hint(['enter', 'open'], ...(left ? [['←', 'news']] : []), ...(across ? [['→', 'pull requests']] : []), ...close);
      }
    }

    function section(title) {
      return node('li', 'gc-section', title);
    }

    function note(text) {
      return node('li', 'gc-note', text);
    }

    /** Row-shaped shimmer standing in for a result that has not arrived yet. */
    function skeletons(count, target = list, tall = false) {
      for (let slot = 0; slot < count; slot += 1) {
        const row = node('li');
        const item = node('div', `gc-item gc-item--ghost${tall ? ' gc-pr' : ''}`);
        const bar = node('span', 'gc-bar');
        bar.style.width = GHOST_WIDTHS[slot % GHOST_WIDTHS.length];
        item.append(node('span', 'gc-icon'), bar);
        if (!tall) item.append(node('span', 'gc-tail'));
        row.append(item);
        target.append(row);
      }
    }

    function addItem(entry) {
      const row = node('li');
      row.setAttribute('role', 'option');

      // One gate for every row, whatever built it: nothing becomes clickable without passing the
      // scheme check. Repository results and in-repo destinations come from GitHub's API and from
      // string building, and "probably fine" is not a place to put an href.
      const interactive = entry.usable && !entry.run && gc.isSafeUrl(entry.url);
      const item = node(interactive ? 'a' : 'div', 'gc-item');
      if (interactive) item.href = entry.url;
      else if (!entry.usable) item.dataset.blocked = 'true';
      if (entry.owned) item.dataset.owned = 'true';
      if (entry.tip) item.title = entry.tip;

      // A chevron means there is a level underneath; a plain arrow means Enter is the end of it.
      let tail;
      if (!entry.usable) {
        tail = node('span', 'gc-reason', entry.reason);
      } else {
        tail = node('span', 'gc-tail', entry.repo ? '›' : '→');
        if (entry.repo) {
          tail.title = `Places inside ${entry.repo}`;
          tail.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            enterDrill(entry.repo);
          });
        }
      }
      item.append(node('span', 'gc-icon', entry.icon), node('span', 'gc-label', entry.label), tail);

      const index = items.length;
      const activate = () => {
        if (activeIndex === index) return;
        activeIndex = index;
        paint();
      };
      item.addEventListener('mousemove', activate);
      item.addEventListener('focus', activate);
      item.addEventListener('click', (event) => {
        if (entry.run) {
          event.preventDefault();
          entry.run();
          return;
        }
        // Let the anchor navigate, but get the overlay out of the way of the page load.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
        cancelSearch();
        onClose();
      });

      items.push({ entry, item });
      row.append(item);
      list.append(row);
    }

    function render() {
      list.textContent = '';
      items = [];

      if (drill) {
        list.append(section(drill.repo));
        for (const entry of drillEntries()) addItem(entry);
        activeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
        paint();
        return;
      }

      const query = filter.value.trim();
      // The repository block is reserved from the first character, not the third, so crossing the
      // search threshold changes what is in it and never how tall the panel is.
      const typing = query.length > 0;
      const found = linkEntries(query);
      const actions = actionEntries(query);
      const labelled = [found.length > 0, actions.length > 0, typing].filter(Boolean).length > 1;

      for (const entry of found) addItem(entry);

      if (actions.length > 0) {
        if (labelled) list.append(section('Do'));
        for (const entry of actions) addItem(entry);
      }

      if (typing) {
        list.append(section('Repositories'));

        const local = mine.query === query ? mine.results : [];
        const seen = new Set(local.map((repo) => repo.fullName.toLowerCase()));
        const remote = (repos.query === query ? repos.results : []).filter(
          (repo) => !seen.has(repo.fullName.toLowerCase()),
        );
        const results = [...local, ...remote].slice(0, REPO_SLOTS);
        const pending = query.length >= SEARCH_AFTER && repos.query !== query;

        for (const repo of results) addItem(repoEntry(repo));

        if (query.length < SEARCH_AFTER && results.length === 0) list.append(note('keep typing to search…'));
        else if (pending && results.length < REPO_SLOTS) skeletons(REPO_SLOTS - results.length);
        else if (repos.status === 'error' && results.length === 0) list.append(note(repos.error));
        else if (results.length === 0) list.append(note('no repositories found'));
      }

      if (items.length === 0 && !typing) {
        list.append(note('No links yet.'));
      }

      activeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
      paint();
    }

    /**
     * What one pull request says about itself: the title — that is what you recognise your work
     * by — the repository, dim, with the owner dropped because you know which economics is yours,
     * and how long since it last moved. On the feedback lane the glyph is the verdict. Nothing
     * else: the column is for looking at.
     */
    function pullEntry(pull, lane) {
      let icon = pull.private ? '◆' : '◇';
      if (lane.id === 'reviewed') icon = pull.verdict === 'changes' ? '✗' : '✓';
      return {
        usable: gc.isSafeUrl(pull.url),
        url: pull.url,
        icon,
        verdict: lane.id === 'reviewed' ? pull.verdict : null,
        title: pull.title || `#${pull.number}`,
        repo: pull.repoShort || pull.repo,
        age: pull.age || '',
      };
    }

    function pullRow(entry) {
      const row = node('li');
      row.setAttribute('role', 'option');

      // Same gate as the panel: nothing becomes clickable without passing the scheme check.
      const interactive = entry.usable && gc.isSafeUrl(entry.url);
      const item = node(interactive ? 'a' : 'div', `gc-item gc-pr${entry.kind === MORE_ROW ? ' gc-pr--more' : ''}`);
      if (interactive) item.href = entry.url;
      if (entry.tip) item.title = entry.tip;

      const icon = node('span', 'gc-icon', entry.icon);
      if (entry.verdict) icon.dataset.verdict = entry.verdict;
      // No tail here: the highlight is the cursor, and the age then ends where the divider does.
      item.append(icon, node('span', 'gc-pr-title', entry.title));
      if (entry.repo) item.append(node('span', 'gc-pr-repo', entry.repo));
      if (entry.age) item.append(node('span', 'gc-pr-age', entry.age));

      const index = pullsItems.length;
      const activate = () => {
        if (pullsIndex === index) return;
        pullsIndex = index;
        paint();
      };
      item.addEventListener('mousemove', activate);
      item.addEventListener('mouseenter', () => {
        popHover = item;
        placePop();
      });
      item.addEventListener('mouseleave', () => {
        popHover = null;
        placePop();
      });
      item.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
        cancelSearch();
        onClose();
      });

      pullsItems.push({ entry, item });
      row.append(item);
      return row;
    }

    /**
     * A fact in the prose. The chip is what the cursor lands on and what Enter opens — GitHub's
     * own list of exactly that, cut to the window — and the popover is what it is made of. Same
     * gate as every other row: nothing becomes a link without passing the scheme check.
     */
    function chipEntry(segment) {
      return {
        usable: gc.isSafeUrl(segment.chip.url),
        url: segment.chip.url,
        kind: segment.chip.kind,
        text: segment.text,
        chip: segment.chip,
      };
    }

    function newsChip(entry) {
      const item = node(entry.usable ? 'a' : 'span', 'gc-chip', entry.text);
      if (entry.usable) item.href = entry.url;
      item.dataset.kind = entry.kind;

      const index = newsItems.length;
      const activate = () => {
        if (newsIndex === index) return;
        newsIndex = index;
        paint();
      };
      item.addEventListener('mousemove', activate);
      item.addEventListener('mouseenter', () => {
        newsHover = { item, entry };
        placeNewsPop();
      });
      item.addEventListener('mouseleave', () => {
        newsHover = null;
        placeNewsPop();
      });
      item.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
        cancelSearch();
        onClose();
      });

      newsItems.push({ entry, item });
      return item;
    }

    /** One repository's sentences: plain text and chips, in the order the prose puts them. */
    function proseRow(segments) {
      const row = node('li', 'gc-prose-row');
      const prose = node('p', 'gc-prose');
      for (const segment of segments) {
        if (segment.chip) prose.append(newsChip(chipEntry(segment)));
        else prose.append(document.createTextNode(segment.text));
      }
      row.append(prose);
      return row;
    }

    function repoSection(entry) {
      const row = node('li', 'gc-section gc-section--lane gc-section--repo');
      const name = node('span', null, entry.repo);
      if (entry.private) name.title = 'private repository';
      row.append(name, node('span', 'gc-rule'));
      return row;
    }

    /**
     * One section per subscribed repository, in the order they were subscribed. Before the edition
     * reaches a repository it is two skeleton rows; after, its day as a few sentences — or one
     * quiet line, or the sentence that stands where its day would be. The header says what the
     * whole column covers, once, so the sections need not repeat it. Whether the column is in the
     * layout at all follows the list: the first subscription raises it, the last unsubscription
     * lets it go.
     */
    function renderNews() {
      if (!newsEl) return;
      newsList.textContent = '';
      newsItems = [];
      newsHover = null;
      hideNewsPop();

      const data = newsData ?? {};
      const repos = data.repos ?? [];
      stage.dataset.news = String(repos.length > 0);
      newsSince.textContent = data.sinceLabel ?? '';

      for (const entry of repos) {
        newsList.append(repoSection(entry));
        if (entry.prose === null) {
          skeletons(NEWS_SLOTS, newsList, true);
          continue;
        }
        if (entry.prose.length > 0) {
          newsList.append(proseRow(entry.prose));
        } else {
          const empty = note(entry.error ?? 'nothing new');
          empty.classList.add('gc-note--pr');
          if (entry.error) empty.dataset.error = 'true';
          newsList.append(empty);
        }
      }

      newsIndex = Math.max(0, Math.min(newsIndex, newsItems.length - 1));
      paint();
    }

    /**
     * The edition painted instantly; if the background said it was not this morning's, ask for it
     * and repaint when it lands. A later navigation or subscription owns the result.
     */
    async function refreshNews() {
      if (!newsEl || !newsData?.stale) return;
      const run = ++newsRun;
      let next = null;
      try {
        const response = await api.runtime.sendMessage({ type: 'gitchop:news:refresh' });
        if (response?.ok) next = response;
      } catch {
        /* keep what is already on screen */
      }
      if (run !== newsRun) return;
      if (next) newsData = next;
      renderNews();
    }

    /**
     * Subscribing from the menu: the list is the background's to change, and its answer is the
     * whole state, so the drill row flips, the command under Do flips, and the column gains or
     * loses a section in one repaint. A new repository then has no place in the edition yet, so
     * the refresh that follows fills it in.
     */
    async function toggleNews(repo, subscribe) {
      if (newsBusy) return;
      newsBusy = true;
      const run = ++newsRun;
      let next = null;
      try {
        const response = await api.runtime.sendMessage({ type: subscribe ? 'gitchop:news:subscribe' : 'gitchop:news:unsubscribe', repo });
        if (response?.ok) next = response;
      } catch {
        /* the list stays as it was */
      } finally {
        newsBusy = false;
      }
      if (run !== newsRun || !next) return;
      newsData = next;
      renderNews();
      render();
      refreshNews();
    }

    function laneSection(lane) {
      const row = node('li', 'gc-section gc-section--lane');
      row.append(node('span', null, lane.title), node('span', 'gc-rule'));
      return row;
    }

    /**
     * Before the snapshot, every lane is a few skeleton rows; after, it is exactly as tall as what
     * it holds — every row, or one quiet line when there is nothing — and the lane below moves up
     * to meet it. Nothing is folded away: seeing all three groups at once was weighed against
     * seeing everything in each, and everything won, so the column scrolls when it has to. The
     * column's own height is the panel's, so nothing about the slab changes as results land. Only
     * past what was fetched does a row point at GitHub.
     */
    function renderPulls() {
      if (!pullsEl) return;
      pullsList.textContent = '';
      pullsItems = [];
      popHover = null;
      hidePop();

      const data = pullsData ?? {};
      const lanes = data.lanes ?? [];
      const loaded = lanes.some((lane) => lane.pulls !== null);

      if (!loaded && data.error) {
        pullsList.append(note(data.error));
        paint();
        return;
      }

      for (const lane of lanes) {
        pullsList.append(laneSection(lane));
        if (lane.pulls === null) {
          skeletons(lane.slots, pullsList, true);
          continue;
        }
        for (const pull of lane.pulls) pullsList.append(pullRow(pullEntry(pull, lane)));
        if (lane.pulls.length === 0) {
          const empty = note(lane.empty);
          empty.classList.add('gc-note--pr');
          pullsList.append(empty);
        }
        if (lane.total > lane.pulls.length && gc.isSafeUrl(lane.all)) {
          pullsList.append(
            pullRow({ usable: true, url: lane.all, icon: '…', title: `${lane.total - lane.pulls.length} more on GitHub`, kind: MORE_ROW }),
          );
        }
      }

      pullsIndex = Math.max(0, Math.min(pullsIndex, pullsItems.length - 1));
      paint();
    }

    /**
     * The snapshot painted instantly; if the background said it was stale, ask for a fresh one and
     * repaint when it lands. A later navigation owns the result, exactly as with the search.
     */
    async function refreshPulls() {
      if (!pullsEl || !pullsData?.stale) return;
      const run = ++pullsRun;
      let next = null;
      try {
        const response = await api.runtime.sendMessage({ type: 'gitchop:pulls:refresh' });
        if (response?.ok) next = response;
      } catch {
        /* keep what is already on screen */
      }
      if (run !== pullsRun) return;
      pullsData = next ?? { ...pullsData, error: pullsData.error ?? 'GitHub did not answer.' };
      renderPulls();
    }

    function toPulls() {
      if (!pullsVisible() || pullsItems.length === 0) return;
      region = 'pulls';
      stage.dataset.region = region;
      pullsList.focus({ preventScroll: true });
      paint();
    }

    function toNews() {
      if (!newsVisible() || newsItems.length === 0) return;
      region = 'news';
      stage.dataset.region = region;
      newsList.focus({ preventScroll: true });
      paint();
    }

    function toPanel() {
      region = 'panel';
      stage.dataset.region = region;
      filter.focus({ preventScroll: true });
      paint();
    }

    /** Tab walks the columns left to right and wraps; Shift+Tab walks back. */
    function cycle(delta) {
      const order = regions();
      const next = order[(order.indexOf(region) + delta + order.length) % order.length];
      if (next === 'news') toNews();
      else if (next === 'pulls') toPulls();
      else toPanel();
    }

    function movePulls(delta) {
      if (pullsItems.length === 0) return;
      pullsIndex = (pullsIndex + delta + pullsItems.length) % pullsItems.length;
      paint();
    }

    function moveNews(delta) {
      if (newsItems.length === 0) return;
      newsIndex = (newsIndex + delta + newsItems.length) % newsItems.length;
      paint();
    }

    /**
     * Keys while a side column has the cursor. The arrow that points at the panel comes back to
     * it; anything printable hands the key to the filter: focus moves during keydown, so the
     * character itself arrives there — you are never stuck in a column, you just start typing and
     * you are searching.
     */
    function sideKeys(event, { back, move, current }) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        move(-1);
        return;
      }
      if (event.key === back) {
        event.preventDefault();
        toPanel();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        open(current(), event.metaKey || event.ctrlKey || event.shiftKey);
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) toPanel();
    }

    function pullsKeys(event) {
      sideKeys(event, { back: 'ArrowLeft', move: movePulls, current: () => pullsItems[pullsIndex]?.entry });
    }

    function newsKeys(event) {
      sideKeys(event, { back: 'ArrowRight', move: moveNews, current: () => newsItems[newsIndex]?.entry });
    }

    function scheduleSearch() {
      clearTimeout(searchTimer);
      const query = filter.value.trim();
      if (query.length < SEARCH_AFTER) {
        repos = { query: '', status: 'idle', results: [], error: '' };
        return;
      }

      const run = ++searchRun;
      searchTimer = setTimeout(async () => {
        let next;
        try {
          const response = await api.runtime.sendMessage({ type: 'gitchop:repos', query });
          if (!response?.ok) throw new Error(response?.error ?? 'The search did not answer.');
          next = { query, status: 'done', results: response.results ?? [], error: '' };
        } catch (error) {
          next = { query, status: 'error', results: [], error: String(error.message ?? error) };
        }
        // A later keystroke, or a navigation, already owns the results.
        if (run !== searchRun) return;
        repos = next;
        render();
      }, SEARCH_DELAY);
    }

    /** The local index answers in a millisecond or two, so it is read before every rebuild. */
    async function readMine(query) {
      const run = ++localRun;
      if (query.length < 2) {
        mine = { query: '', results: [] };
        return;
      }
      try {
        const response = await api.runtime.sendMessage({ type: 'gitchop:repos:mine', query });
        if (run !== localRun) return;
        mine = { query, results: response?.ok ? response.results ?? [] : [] };
      } catch {
        if (run !== localRun) return;
        mine = { query, results: [] };
      }
    }

    function move(delta) {
      if (items.length === 0) return;
      activeIndex = (activeIndex + delta + items.length) % items.length;
      paint();
    }

    async function persist(next) {
      const previous = current;
      current = next;
      render();
      try {
        await api.storage.sync.set({ links: current });
        onLinksChanged?.(current);
      } catch (error) {
        // Storage refused it — quota, most likely. Put the list back.
        current = previous;
        render();
        console.error('gitchop: could not save link', error);
      }
    }

    function closeForm() {
      form?.remove();
      form = null;
      filter.hidden = false;
      filter.focus();
    }

    function openForm() {
      if (form) return;
      filter.hidden = true;

      form = node('div', 'gc-form');
      const icon = node('input');
      icon.placeholder = '🔗';
      icon.maxLength = 4;
      icon.setAttribute('aria-label', 'Icon');

      const label = node('input');
      label.placeholder = 'Label';
      label.value = defaultLabel();
      label.setAttribute('aria-label', 'Label');

      const url = node('input', 'gc-form-url');
      url.value = location.href;
      url.setAttribute('aria-label', 'URL');

      const save = node('button', 'gc-btn gc-btn--primary', 'Save');
      const cancel = node('button', 'gc-btn', 'Cancel');
      const actions = node('div', 'gc-form-actions');
      actions.append(cancel, save);

      form.append(icon, label, url, actions);
      panel.insertBefore(form, list);

      const submit = async () => {
        const value = url.value.trim();
        if (!value || !gc.isSafeUrl(value.replace(/\{(\w+)\}/g, 'x'))) {
          url.focus();
          url.select();
          return;
        }
        const link = {
          id: crypto.randomUUID(),
          icon: icon.value.trim().slice(0, 4),
          label: label.value.trim().slice(0, 80) || value,
          url: value,
        };
        closeForm();
        filter.value = '';
        cancelSearch();
        repos = { status: 'idle', results: [], owners: [], error: '' };
        await persist([...current, link]);
      };

      save.addEventListener('click', submit);
      cancel.addEventListener('click', closeForm);
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });

      label.focus();
      label.select();
    }

    filter.addEventListener('input', () => {
      // Typing is a new search, so it always comes back out of a repository.
      drill = null;
      activeIndex = 0;
      scheduleSearch();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(async () => {
        settleTimer = null;
        await readMine(filter.value.trim());
        render();
      }, SETTLE);
    });

    /** Any key that acts on the list needs the list to match what has been typed. */
    function settle() {
      if (!settleTimer) return;
      clearTimeout(settleTimer);
      settleTimer = null;
      render();
    }

    // Clicking dead space in either column must not drop focus to the page, where GitHub's
    // single-key shortcuts would start listening again.
    stage.addEventListener('mousedown', (event) => {
      if (event.target.closest?.('input, button, a')) return;
      event.preventDefault();
    });

    /** Tab stays inside the panel: it wraps at both ends instead of reaching the page behind. */
    function trapTab(event) {
      const stops = [...panel.querySelectorAll('input, a[href], button')].filter((stop) => !stop.hidden);
      if (stops.length === 0) return;
      const here = stops.indexOf(panel.getRootNode().activeElement);
      const edge = event.shiftKey ? 0 : stops.length - 1;
      if (here !== edge) return;
      event.preventDefault();
      stops[event.shiftKey ? stops.length - 1 : 0].focus();
    }

    stage.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (form) closeForm();
        else if (region !== 'panel') toPanel();
        else if (!leaveDrill()) onClose();
        return;
      }
      // With a column on screen, Tab crosses the gutter — left to right, wrapping at the end, and
      // Shift+Tab back; without one, it wraps inside the panel as it always has.
      if (event.key === 'Tab') {
        if (!form && regions().length > 1) {
          event.preventDefault();
          cycle(event.shiftKey ? -1 : 1);
        } else {
          trapTab(event);
        }
        return;
      }
      if (form) return;
      if (region === 'pulls') {
        pullsKeys(event);
        return;
      }
      if (region === 'news') {
        newsKeys(event);
        return;
      }
      settle();

      // Right only takes over once the caret has nowhere left to go, so it still moves the
      // cursor through what you have typed. On a repository row it goes inside; on any other row
      // it crosses to the pull requests, and Left in that column comes back.
      if (event.key === 'ArrowRight' && !drill) {
        const atEnd = filter.selectionStart === filter.value.length && filter.selectionStart === filter.selectionEnd;
        if (!atEnd) return;
        const entry = items[activeIndex]?.entry;
        if (entry?.repo) {
          event.preventDefault();
          enterDrill(entry.repo);
        } else if (pullsVisible() && pullsItems.length > 0) {
          event.preventDefault();
          toPulls();
        }
        return;
      }
      if (event.key === 'ArrowLeft' && drill) {
        event.preventDefault();
        leaveDrill();
        return;
      }
      // Left, likewise, only once the caret is at the start — with nothing typed, that is at once —
      // and crosses to the news; Right in that column comes back.
      if (event.key === 'ArrowLeft' && !drill) {
        const atStart = filter.selectionStart === 0 && filter.selectionEnd === 0;
        if (!atStart || !newsVisible() || newsItems.length === 0) return;
        event.preventDefault();
        toNews();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        move(-1);
        return;
      }
      if (event.key === 'Enter' && panel.getRootNode().activeElement === filter) {
        event.preventDefault();
        open(items[activeIndex]?.entry, event.metaKey || event.ctrlKey || event.shiftKey);
      }
    });

    filter.addEventListener('focus', () => {
      if (region === 'panel') return;
      region = 'panel';
      stage.dataset.region = region;
      paint();
    });

    render();
    renderPulls();
    renderNews();
    refreshPulls();
    refreshNews();

    return {
      element: stage,
      /**
       * Called once the stage is in the page, which is the first moment the columns have a layout
       * to be visible in — so the strip is painted again here, or a fresh snapshot with nothing to
       * refresh would leave it not mentioning them until the cursor moved.
       */
      focus() {
        filter.focus();
        paint();
      },
    };
  };
})();
