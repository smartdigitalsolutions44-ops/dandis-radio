# Dandi's Radio

A static, no-login music page. Plain HTML, CSS and JavaScript; no dependencies, backend, API keys or build service required.

Live (GitHub Pages): https://smartdigitalsolutions44-ops.github.io/dandis-radio/

Older host: https://work-radio-dandy-nov7.colorfulmacaron1.chatgpt.site/ (no longer updated)

Easy address: https://is.gd/dandiradio (points to the GitHub Pages site). The older https://is.gd/dandisradio and https://is.gd/dandyradio still go to the old ChatGPT host and cannot be changed.

## Run locally

With Node.js installed, open a terminal in this folder and run:

```sh
node server.mjs
```

Open http://127.0.0.1:4317. Stop with Ctrl+C. Opening `dist/index.html` directly can prevent embedded media working properly; use the server.

## Publish on GitHub or another static host

The website is everything inside `dist/`. Upload those files to a static host, or configure GitHub Pages to publish that directory through a workflow. Alternatively put the contents of `dist/` at your Pages publishing root. Keep relative asset links together. No installation or build step is needed.

When changing the domain, update the canonical and Open Graph URL in `dist/index.html`, `dist/robots.txt`, `dist/sitemap.xml`, and the homepage in the lyrics client identification header. The is.gd links are permanent redirects to the current Sites address, so obtain a new short link if moving the site. Never assume they update automatically.

The Desktop export deliberately excludes the hosted checkout's `.git` and `.openai` folders. It contains no tokens or account credentials. Claude can initialize it as a fresh GitHub repository. Published to GitHub. GitHub Pages serves the `gh-pages` branch, which holds the contents of `dist/`. To redeploy after changes: `git subtree push --prefix dist origin gh-pages`.

## Main files

- `dist/index.html`: page layout, metadata, text.
- `dist/style.css`: charcoal player layout, optional backgrounds, mobile styling.
- `dist/app.js`: SoundCloud player, next/previous, shuffle, search, filters and saved custom links.
- `dist/tracks.js`: the shipped song catalog.
- `dist/lyrics.js`: LRCLIB search and readable lyrics. It does not sync to playback time.
- `dist/manifest.webmanifest` and `dist/icon.svg`: browser/home-screen identity.
- `server.mjs`: small local HTTP server.
- `verify.cjs`, `verify-lyrics.cjs`: Node checks using a small mocked DOM and mocked player. These do not prove playback on a work scanner.

## Music coverage and limitations

100 song names were exposed by the public Spotify playlist embed. This is not confirmation that the source playlist has only 100 tracks. The source URL is recorded in `soundcloud-import.json`.

57 exact artist/version matches (28 added 2026-11-07) were checked against SoundCloud's public metadata, including duration and embedding policy. Only tracks with `ALLOW`/`MONETIZE`, full duration, and public embedding are in the ready queue. 1 identified match was preview-only, 1 was blocked, and 41 are not verified. They remain visible in the `To find` filter. There is no Spotify playback or login in the website.

SoundCloud controls playback and may show ads or apply device, network, geographic or future catalog restrictions. The work scanner has not been tested. No DRM or subscription bypass, downloading, rehosting or audio extraction is used. Custom links are checked by the widget when possible and saved only in localStorage on that browser. A custom link is not a verified imported match.

Lyrics are fetched from LRCLIB when requested. Search failures and rate limiting are handled. Lyrics are not bundled or stored on this host.

## Updating matched songs

`soundcloud-import.json` contains source metadata. `soundcloud-evidence.json` records the checked public SoundCloud metadata. `build-catalog.mjs` has the manually reviewed index-to-track-ID mapping and verifies policies and duration before producing `dist/tracks.js`:

```sh
node build-catalog.mjs
node verify.cjs
node verify-lyrics.cjs
```

Do not map a remix, cover, speed variant or different artist solely because the title resembles a source song. Leave unresolved songs unmatched. `collect-soundcloud.mjs` and the candidate JSON files are maintenance tools for checking public metadata; they do not retrieve audio.

The page allows indexing and has a sitemap. Google indexing is not immediate or guaranteed. Use the short address in Chrome's address bar or bookmark it as Dandi's Radio.
