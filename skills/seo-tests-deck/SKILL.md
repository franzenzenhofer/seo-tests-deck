---
name: seo-tests-deck
description: Use when someone asks for the "3 SEO Tests" deck for a website, a PageSpeed Insights + "JS turned off" + Google Search Console live-test check of start, list and detail pages, a screenshot deck with red/green boxes and IS / SHOULD comments per page type, or a quick technical-SEO health check of one URL per template that ends in a pdf / pptx / html deck.
---

# 3 SEO Tests deck

One deck per site. Per page type (start page, list page, detail page, ...) it runs three tests on
one real URL, takes the screenshots, and turns your review into slides:

1. **PageSpeed Insights (mobile)** - the pagespeed.web.dev report, score 80+ passes.
2. **"JS turned off"** - iPhone 13 viewport, JavaScript on vs off: above-the-fold and main
   content must be visible without JS, visible links must be real links.
3. **Google Search Console live test** - URL Inspection -> Test live URL -> View tested page:
   Google's screenshot must show the rendered page, render-critical resources must load.

The deck is built with [whitedeck](https://github.com/franzenzenhofer/whitedeck) (installed with
this package) as html, pdf, pptx and, on macOS with Keynote, key.

## The deck, slide by slide

| # | slide | whitedeck layout | content |
|---|---|---|---|
| 1 | Title | `title-left` | `3 SEO Tests`, site link, `Footer: <author> / DD.MM.YYYY`, brand logo bottom-right on every slide |
| 2 | Overview | `title-bullets-left` | "3 SEO Tests to do 80% of technical onpage/onsite SEO right!" with the pass rule of each test (the builder emits it) |
| 3 | At a glance | `title-bullets-left` | "N of M page types pass all 3 SEO tests", then per test "x of y ok" (PSI also the score range) |
| per page | Section | `section-left` | page type + URL link |
| | PSI | `scope-shot` | `SCOPE: <page type> (<url>)` + PSI logo, mobile report from the gauge down to the first audit group, red border below 80, caption = PSI analysis URL |
| | JS off | `scope-compare` | Chrome logo, columns `JS on` (initial), `JS on` (after the consent click, when a banner was found), `JS off`; red border on the shot that shows the problem; IS / SHOULD notes |
| | GSC | `scope-shot-notes` | Search Console logo, live-test panel (red border when not ok) + page-resources panel (green border), IS / SHOULD notes, caption = inspect URL |

Test order is always PSI, JS, GSC. Page types appear in the order of the pages file. A test that
was not captured has no slide. Slide count = 3 + pages x (1 + captured tests).

## Workflow

```bash
# 1. pages file: one "Page Type: URL" per line, # starts a comment
cat > pages.txt <<'EOF'
Start Page: https://www.example.com/
List Page: https://www.example.com/category/
Detail Page: https://www.example.com/product/123
EOF

# 2. capture. PSI scores swing 15+ points between runs: use --repeat 5 for a real deck (every
#    run is kept as shots/<slug>-psi-run<k>.png, the WORST run goes on the slide, manifest.json
#    keeps all scores). ~8 min per page with --repeat 5.
seo-tests-deck capture --pages pages.txt --out runs/example-2026-10-07 --tests psi,js --repeat 5
#    with the GSC test (needs a Google session, see below):
seo-tests-deck capture --pages pages.txt --out runs/example-2026-10-07 --property sc-domain:example.com --repeat 5

# 3. LOOK at every screenshot in runs/.../shots/ (the render check below is mandatory),
#    then write the findings
seo-tests-deck findings-template --run runs/example-2026-10-07 > runs/example-2026-10-07/findings.json
#    ... edit findings.json (rubric below) ...

# 4. build: "all" = every format this machine can produce (key only on macOS with Keynote)
seo-tests-deck build --run runs/example-2026-10-07 --out runs/example-2026-10-07/deck --formats all

# 5. check every slide: renders deck/check/slide-NN.png + all-slides.png and measures every text
#    box in the real browser layout; anything outside its box or the slide is listed and the
#    command exits 1. Fix (shorter IS / SHOULD lines) and rebuild, never hand over an overflow.
seo-tests-deck check --deck runs/example-2026-10-07/deck
```

Options: `build --author "Your Name" --logo your-logo.png` sets the footer author and the logo
on every slide (default: f19n and its logo). Re-running `capture` into the same run directory
merges by page and test, so one failed page or test can be captured again alone.

## Google session for the GSC test

Search Console has no screenshot API, so the capture drives the web UI in a browser that is
signed in to a Google account with access to the property. `--tests psi,js` never needs it.
The session is resolved in this order:

1. `--cdp <ws-url>` or env `SEO_TESTS_DECK_CDP`: connect to an already running, signed-in
   Chrome/Chromium (start it with `--remote-debugging-port=9222`, read the
   `webSocketDebuggerUrl` from `http://127.0.0.1:9222/json/version`).
2. `--profile <dir>` or env `SEO_TESTS_DECK_PROFILE`: a persistent browser profile.
3. env `SEO_TESTS_DECK_CDP_COMMAND`: a command whose last stdout line is a CDP websocket url.
4. a `google-team-login` command on PATH (a maintainer's shared browser; ignore it otherwise).
5. the default profile `~/.seo-tests-deck/google-profile`.

The default needs one sign-in: `seo-tests-deck login` opens Chromium on that profile; sign in,
check that Search Console shows your property, quit the browser (macOS: Cmd+Q). The command
verifies the login; every later `capture` reuses the profile headless. If a capture stops with
"Google session is not signed in", run `seo-tests-deck login` again. Never copy Google cookies
from one browser into another: Google treats a second browser presenting the same session as
theft and signs out every holder.

## The render check (mandatory, this is where a wrong analysis is caught)

A wrong IS line is worse than no deck. Before writing the GSC or JS findings:

1. Open `shots/<slug>-gsc-render-compare.png`: left the real browser (JS on, after consent),
   right Google's render (`<slug>-gsc-render.png`). Name EVERY visible difference, element by
   element: which image, badge, logo, block, text or button is present left and missing or broken
   right. A broken-image icon with alt text means THAT element failed, not the picture behind it.
   Example: the hero photo renders fine, but a small partner badge is broken, and the
   page-resources panel says why: its image lives on a legacy subdomain whose robots.txt blocks
   Googlebot. The IS line is "partner badge not rendered: image on legacy subdomain blocked by
   robots.txt", NOT "hero image not rendered".
2. Cross-check every difference against `shots/<slug>-gsc-resources.png` (page resources): a
   blocked or failing resource of the site itself explains a missing element; third-party
   trackers (consent tools, error trackers, ad and tag managers) blocked by robots.txt explain
   nothing visible.
3. Same for JS: compare `js-on-after` (or `js-on`) with `js-off` element by element before
   writing "renders without JS".
4. If you cannot explain a difference, say so in the IS line ("X missing in Google's render,
   cause not visible in page resources"). Never guess a cause.
5. PSI with `--repeat`: quote the range in the handover ("PSI mobile 49-68 over 5 runs, worst
   run on the slide").

A capture that fails (GSC answering "Something went wrong" twice is the usual one) is recorded
under `errors` in `manifest.json`; the run continues and exits 1 with a summary. Re-run that page
later, or hand over without that slide and say so. Never fake a slide.

## findings.json - the comments are your judgement, made from the screenshots

```json
{
  "brand": "example.com",
  "date": "07.10.2026",
  "pages": {
    "detail-page": {
      "psi": { "status": "not-ok", "is": [], "should": [] },
      "js": {
        "status": "not-ok",
        "highlight": ["on"],
        "is": ["cookie banner initially displayed"],
        "should": ["display cookie banner after minimal user interaction"]
      },
      "gsc": {
        "status": "not-ok",
        "is": ["cookie banner covers the main content in Google's render"],
        "should": ["display cookie banner after minimal user interaction"]
      }
    }
  }
}
```

Rubric (keep the voice: short, lower-case, no full stops):

- **PSI**: `not-ok` when the mobile performance score is below 80; 90+ is green. No notes on
  this slide; without a PSI finding the border follows the score.
- **JS**: compare `js-on` / `js-on-after` / `js-off`. `not-ok` when above-the-fold or main
  content is missing without JS, a carousel / hero / list is a JS rendering dependency, visible
  links are not links, or a cookie banner covers the above-the-fold content. `highlight` names
  the shots that show the problem (`on` = banner covering content, `off` = missing content).
  Typical lines: `cookie banner initially displayed`, `carousel rendering is a JS dependency`,
  `main content not rendered without JS`; SHOULD: `display cookie banner after minimal user
  interaction`, `fix carousel rendering -> must render without JS`. When everything renders:
  status `ok`, `is: []` -> the slide prints `IS (ok)` / `no JS rendering dependencies`.
- **GSC**: `not-ok` when Google's render shows a cookie banner or overlay instead of content,
  the main content is missing, or render-critical resources of the site itself (JS, CSS, images
  above the fold) are blocked or fail. `ok` -> `IS (ok)` / `rendered page shows the main content`.
- Every `not-ok` JS or GSC finding needs at least one `is` line (the builder refuses otherwise).
  A passing test may also be written as `is: ["OK"]`.

## Verification before handover (on the `check/` slide images, every slide)

- `check` exits 0; the number of `check/slide-NN.png` files equals 3 + pages x (1 + captured
  tests) and you have looked at each one, not only the contact sheet.
- No text outside its box or the slide, no overlapping boxes, no stretched or cut-off screenshot.
- Every scope slide: SCOPE line with the right page type + URL, tool logo top-right, brand logo
  bottom-right, caption link present (PSI analysis URL with `form_factor=mobile`, GSC URL with
  `inspect?resource_id=`).
- Screenshots readable (gauge digits legible, phone shots not stretched), red border only where
  a finding says so.
- Links clickable in every delivered format. Look at the PDF pages too: it is what most readers
  get. On macOS, open the `.key` once in Keynote and step through all slides.

## Files

- `src/capture/psi.ts` pagespeed.web.dev mobile report clip + score; `src/capture/js.ts`
  iPhone 13 JS on / consent click / JS off; `src/capture/gsc*.ts` Search Console live test
  through the UI; `src/capture/google-*.ts` the pluggable Google session and `login`.
- `src/build/deck-md.ts` emits the whitedeck markdown; `src/findings.ts` validates the review;
  `src/build/check.ts` renders every finished slide to PNG and measures overflow.
- `assets/` the bundled logos (default brand logo, PageSpeed Insights, Chrome, Search Console).
