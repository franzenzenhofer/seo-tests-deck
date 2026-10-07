# seo-tests-deck

Three technical SEO tests per page type, captured automatically and turned into a slide deck:

1. **PageSpeed Insights (mobile)**: the pagespeed.web.dev report; 80+ passes, 90+ is green.
2. **"JS turned off"**: iPhone 13 viewport, JavaScript on vs off. Above-the-fold and main content
   must be visible without JS, and visible links must be real links.
3. **Google Search Console live test**: URL Inspection, then Test live URL, then View tested page.
   Google's screenshot must show the rendered page.

You list one real URL per page type (start page, list page, detail page, ...). The tool takes the
screenshots. You review them and write short IS / SHOULD findings. The tool then builds the deck
with [whitedeck](https://github.com/franzenzenhofer/whitedeck) as html, pdf, pptx and, on macOS
with Keynote, key. It also works as a [Claude Code](https://claude.com/claude-code) skill: the
agent runs the commands, looks at every screenshot and writes the findings for you.

Runs on macOS, Linux and Windows (Node.js 20 or newer).

## Install

You need [Node.js](https://nodejs.org/) 20+ and git.

**macOS / Linux**

```bash
git clone https://github.com/franzenzenhofer/seo-tests-deck.git
cd seo-tests-deck
npm ci
npx playwright install chromium        # Linux: npx playwright install --with-deps chromium
npm link                               # puts the seo-tests-deck command on your PATH
seo-tests-deck --help
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/franzenzenhofer/seo-tests-deck.git
cd seo-tests-deck
npm ci
npx playwright install chromium
npm link
seo-tests-deck --help
```

`npm ci` also builds the tool (`dist/`) and installs whitedeck as a dependency. The repo's
`.npmrc` allows npm 12 to fetch whitedeck from GitHub (`allow-git=all`).

### Install the Claude Code skill (optional)

macOS / Linux:

```bash
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/seo-tests-deck" ~/.claude/skills/seo-tests-deck
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item -Recurse -Force skills\seo-tests-deck "$env:USERPROFILE\.claude\skills\"
```

Then ask Claude Code for "the 3 SEO tests deck for https://www.your-site.com/".

## 5-minute quickstart (no Google login needed)

```bash
mkdir my-seo-tests && cd my-seo-tests
cat > pages.txt <<'EOF'
Start Page: https://loremipsum.franzai.com/
Detail Page: https://loremipsum.franzai.com/lorem-ipsum-history/
EOF

seo-tests-deck capture --pages pages.txt --out run --tests psi,js
seo-tests-deck findings-template --run run > run/findings.json
seo-tests-deck build --run run --out run/deck --formats all
seo-tests-deck check --deck run/deck
```

On Windows PowerShell, write `pages.txt` with your editor or with
`Set-Content pages.txt "Start Page: https://loremipsum.franzai.com/", "Detail Page: https://loremipsum.franzai.com/lorem-ipsum-history/"`.

Open `run/deck/deck.pdf` (or `deck.pptx`, `deck.html`). The template marks every test as ok.
Now look at the screenshots in `run/shots/` and edit `run/findings.json` (see
[the rubric](skills/seo-tests-deck/SKILL.md#findingsjson---the-comments-are-your-judgement-made-from-the-screenshots)),
then run `build` and `check` again. Replace the URLs with your own site, one URL per page type.

For a real deck use `--repeat 5`: PSI scores swing by 15+ points between runs, so the tool runs
PSI five times and puts the worst run on the slide.

## The GSC test: sign in once

Search Console has no screenshot API, so the tool drives the Search Console web UI in a browser
signed in to a Google account that can see your property.

```bash
seo-tests-deck login     # opens Chromium: sign in, check Search Console shows your property, quit the browser
seo-tests-deck capture --pages pages.txt --out run --property sc-domain:your-site.com --repeat 5
```

`login` keeps the session in `~/.seo-tests-deck/google-profile` (Windows:
`%USERPROFILE%\.seo-tests-deck\google-profile`). Every later capture reuses it, headless. Other
ways to provide the session:

| Option | Use when |
|---|---|
| `--profile <dir>` / `SEO_TESTS_DECK_PROFILE` | you want a different profile directory |
| `--cdp <ws-url>` / `SEO_TESTS_DECK_CDP` | you already run a signed-in Chrome with `--remote-debugging-port=9222` (url from `http://127.0.0.1:9222/json/version`) |
| `SEO_TESTS_DECK_CDP_COMMAND` | a script of yours starts or finds that browser and prints its CDP url as the last line |

`--property` is the property as Search Console names it: `sc-domain:example.com` for a domain
property, `https://www.example.com/` for a URL-prefix property.

## Commands

```
seo-tests-deck capture --pages <file> --out <runDir> [--tests psi,js,gsc] [--property sc-domain:x] [--repeat 5] [--cdp <ws-url> | --profile <dir>]
seo-tests-deck findings-template --run <runDir>
seo-tests-deck build --run <runDir> --out <deckDir> [--formats all|html,pdf,pptx,key] [--author <name>] [--logo <png>]
seo-tests-deck check --deck <deckDir>
seo-tests-deck login [--profile <dir>]
```

- `capture` writes `shots/` and `manifest.json`. A failed test is recorded in the manifest, the
  others go on; re-running into the same directory merges by page and test.
- `build --formats all` produces every format this machine can: html, pdf and pptx everywhere,
  key only on macOS with Keynote. Name a format explicitly and it must succeed.
- `check` renders every slide to `check/slide-NN.png` plus a contact sheet and exits 1 if any
  text runs outside its box.

The deck format, the review rubric and the checklist before handover are in
[skills/seo-tests-deck/SKILL.md](skills/seo-tests-deck/SKILL.md).

## Develop

```bash
npm ci
npx playwright install chromium
npm run gates          # typecheck, lint, test, build
```

The tests use real browsers and real pages (no mocks). `SEO_TESTS_DECK_SKIP_PSI=1` skips the
slow live PageSpeed Insights tests. The GSC test runs only with
`SEO_TESTS_DECK_GSC_PROPERTY=<property>` (and optionally `SEO_TESTS_DECK_GSC_URL`) and a signed-in
Google session.

## License

[MIT](LICENSE)
