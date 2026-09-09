# Changelog

Reconstructed from the development history; this project has no git history before 2.0.0 to derive
it from.

## Unreleased

- A **Menu delay** slider in Settings sets the beat between the blade leaving the screen and the
  menu rising into the cut — from none at all, where the menu is there the instant the cut lands,
  to long enough for the dark to settle first. It was a fixed 140 ms on the aftermath's clock; the
  default still is, so nothing changes until the slider moves. Like the rest of the aftermath it
  stretches with **Speed**, and the settings page shows the wait that produces rather than the
  stored number, so the figure next to the slider is the one you are waiting through.
- **Preview chop** now raises an empty panel where the menu would be. The delay is a beat between
  two things and the preview only ever showed the first of them; it also stays until the menu has
  arrived, instead of leaving as soon as the dark had settled.

## 2.2.1

- Firefox 140 is now the minimum. The `data_collection_permissions` block in the Gecko settings —
  which AMO's disclosure form reads, and which has been mandatory there since November 2025 — is
  only understood from Firefox 140 on desktop, so claiming support back to 115 meant those users
  never got the browser's own consent prompt, and AMO warned about the mismatch on every upload.
  Nothing else changed: ESR 128 has been out of support for a year, ESR 115 survives only on
  Windows 7–8.1 and macOS 10.12–10.14, and github.com asks for a current browser regardless.

## 2.2.0

- The chop can be tuned in Settings: an **Effect** switch turns the whole animation off — the dot
  then opens the menu instantly — **Colour** is two rows of nine named swatches (steel is the
  classic blade, any other paints the blade, sparks and light), **Epicness** is one dial from a
  clean quiet cut to a full action scene — the glow deepens first, then sparks fly, then light
  bursts from the cut — and **Speed** runs from slow motion to double pace. Speed drives the slice
  itself; the aftermath — the dark spilling open, the light, the embers and the menu — trails it,
  keeping its slow drama however fast the blade is, and the two only fully agree at the slowest
  setting. A **Preview chop** button plays the result, saved or not, over the settings page itself
  and clears the moment the effect is over — there is no menu behind it to wait for.
- The chop itself now opens the page instead of fading it: the blade still crosses in the clear,
  but the dark then spills out of the finished cut — the line splits into two glowing edges that
  sweep apart and cool while the menu rises into the opening — where it used to fade in flat after
  a pause. The screen-wide flash is gone at every setting; at higher epicness the impact is a burst
  of light along the cut instead. `prefers-reduced-motion` still collapses everything to a plain
  fade regardless of the settings.
- The dot is now claimed before the content script touches a single extension API, so a tab that
  cannot reach the effect settings — the add-on reloaded underneath it, storage briefly gone —
  falls back to the default chop instead of ignoring the key. Registering the listener last meant
  any failure on the way to it left the page with no listener at all, and pressing `.` did nothing.

## 2.1.0

- A Chrome package alongside Firefox, which Edge and Brave take unchanged. Nothing in `src/` is
  conditional; the two disagree only about the background script, so `dev/build.mjs` derives a
  manifest per browser from the one in the repo root. Chrome refuses to load a Manifest V3 extension
  that mentions `background.scripts`, which is why one shared manifest was not enough.
- Both stores now call the extension "gitchop for GitHub" — consistent with Spacebar Review for
  GitHub, and findable next to the unrelated service that had the name first. Only the display name
  changed: the add-on ID, the AMO listing URL and every internal identifier stay as they were, so
  this arrives as an update rather than a second listing.
- Tagging a commit builds both packages and attaches them to a GitHub release. Store uploads stay
  manual; `dev/RELEASING.md` has the steps and what each store asks for.
- The settings page no longer says "Firefox" when explaining host permissions, since Chrome can have
  site access narrowed to "on click" and reaches the same card.
- Packaging now refuses to build when a manifest entry, an options-page `src`, or a relative
  `import` does not resolve. With no bundler between `src/` and the browser, those only used to
  surface after installing.
- `dev/package.sh` is gone; `node dev/build.mjs` replaces it.

## 2.0.0

- Classic tokens are the recommended path again: one token with `repo` and `gist` covers every
  organisation, with no owner approval to arrange. Fine-grained tokens remain supported as the
  tighter option.
- Tokens are sealed with AES-GCM under a random key before being written, so none is stored as
  recognisable `ghp_…` text. Documented as obfuscation rather than protection — the key is
  necessarily reachable by the extension.
- A token carrying a write-granting scope is labelled in the settings page.

## 1.9.1

- **Stop backup**, which leaves the gist and the tokens alone. Removing every token was previously
  the only way to stop syncing.

## 1.9.0

- Any number of tokens can be saved, because a fine-grained token has exactly one resource owner and
  two organisations therefore need two. The index builds from all of them and merges.
- A failing token no longer sinks the whole index build; the settings page names the one that failed.
- Gist operations find their own token by trying each and remembering which worked.

## 1.8.0

- Fine-grained token guidance, with the exact permissions spelled out.
- The settings page reports what a token actually is — fine-grained or classic, and a classic token's
  scopes, read from the `x-oauth-scopes` response header.
- The repository index reports **which accounts** it reached. A fine-grained token that was never
  granted an organisation returns a successful response with less in it, and this is the only way to
  see that.

## 1.7.0

- No row in the menu becomes a clickable link without passing a URL scheme check. Repository results
  and in-repo destinations previously set an `href` unvalidated.
- Data read back from the gist is treated as untrusted: sanitised, non-`http(s)` URLs dropped rather
  than stored, and the list capped.

## 1.6.1

- The toolbar icon shows a red `!` when Firefox has not granted access to `github.com`, and the
  settings page leads with a card that requests it. Without the grant the content script never runs
  and the `.` key does nothing, with nothing to explain it.

## 1.6.0

- **Private repository search.** GitHub's search will not return private repositories, so gitchop
  builds its own list from `/user/repos` and matches it locally — instantly, with no request per
  keystroke, ranked exact name over prefix over substring.
- A token is now independent of gist backup; private search no longer requires switching on sync.

## 1.5.0

- The panel is a fixed size and no longer resizes as you type. Reserving a block for the search
  results was not enough: filtering the links away moved far more.

## 1.4.0

- The list settles 110 ms after the last keystroke instead of rebuilding on every one, so a quickly
  typed word is one visual change rather than three. Any key that acts on the list flushes it first.

## 1.3.1

- `Manage links` is now `Settings`, matching the page it opens.

## 1.3.0

- The cut runs right to left, and faster: 240 ms.

## 1.2.0

- The version is shown at the foot of the settings page.

## 1.1.2

- Placeholder examples use `octocat/hello-world` rather than naming a real project.

## 1.1.1

- The in-repo list is Pull requests and Issues only.

## 1.1.0

- <kbd>→</kbd> on a repository opens the places inside it; <kbd>←</kbd> comes back. Works on saved
  links that point at a repository as well as on search results.

## 1.0.0

- First submission-ready build: data collection declared in the manifest, MIT licence, privacy
  policy, and a packaging script that stages a clean copy.
- Repositories belonging to accounts you have linked are ranked above the rest of GitHub.
