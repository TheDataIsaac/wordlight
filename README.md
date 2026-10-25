# Wordlight
Wordlight · Church Media: scripture, songs, slides and graphics for church services, with outputs for OBS and screens.

## Web studio

Open [Wordlight](https://wordlight.2-31-15-0.sslip.io). To host your own copy, see [deploy/hetzner](deploy/hetzner/README.md).

- No ChatGPT login and no account. Shows are saved in your browser on that computer; use **Export library** and
  **Import shows** to back them up or move them to another computer or browser.
- The browser needs internet to open the site and for online Bible versions. For services without internet, use
  the portable package below, which runs on the computer itself.
- OBS outputs, the FreeShow song library and installed Bibles need the Wordlight companion running on the
  presentation laptop. To use them from the web studio, add `https://wordlight.2-31-15-0.sslip.io` to the
  companion's `WORDLIGHT_BRIDGE_ORIGINS` (keep any origins already there), restart the companion, and enter the
  pairing code from the local studio under **OBS & screens** on the site. The browser may ask to allow access to
  devices on the local network; allow it. [deploy/hetzner](deploy/hetzner/README.md#pairing-the-companion-with-a-hosted-studio)
  shows how to set the variable.
- The phone remote works on the local Wi-Fi with the companion, not through the public site.

## Start on Windows
Wordlight runs on your own computer. It needs no account, sign-in or online service to start; the internet is used only for online Bible lookups.

**Portable package (no Node.js or git needed):** download the Wordlight ZIP from https://github.com/TheDataIsaac/wordlight/releases/latest, extract it and double-click **Start Wordlight**. It starts Wordlight in the background and opens it in a window; double-clicking again opens the running Wordlight instead of starting a second one. Closing the window does not stop Wordlight, so OBS outputs keep working; **Stop Wordlight** stops it. **Start with Windows** turns starting at sign-in on or off (optional). Shows, settings and installed Bibles are kept in `%LOCALAPPDATA%\Wordlight\data`, so a newer Wordlight folder can replace an older one without touching them. If another Wordlight version is already running on port 18765, or another program uses that port, Start Wordlight says so and stops nothing.

**From source:** `git clone https://github.com/TheDataIsaac/wordlight.git`, then with Node.js 20 or newer double-click **Start Wordlight.cmd** (or run `node server.mjs --open` on Mac or Linux). The studio opens at http://127.0.0.1:18765. No npm install or API key is needed. To build the portable ZIP: `node tools/build-portable.mjs` (downloads the official Node.js runtime, checked against nodejs.org's SHA256SUMS, and the open Bible packs into build/). `node tools/build-companion-zip.mjs` rebuilds `dist/wordlight-obs-companion.zip` from the current commit. Tests: `npm test`.

## Prepare and present
- In Bible, look up a reference or paste any passage, quote, or text. Set the reference and version labels.
- The version list shows **Pinned** versions first (NKJV and the Yoruba Bible until you change them), then the other built-in versions. **Versions…** opens a searchable list of about 1,250 open translations from bible.helloao.org (name, language, how many books, licence); **Use** looks one up online, a chapter at a time, and **Pin** keeps it at the top. The list is downloaded only when you open it and kept for a day. A version's short name goes on screen with its licence line; a book the version does not include is reported, never filled from another version.
- KJV, ASV, WEB and the Open Yoruba Contemporary Bible can be installed on this computer (**Install for offline use** in the Bible panel; the portable package installs them on first start). Installed versions are looked up locally with no internet; others are looked up online. NKJV comes from your own NKJV file, your API.Bible key, or online from bolls.life (see NKJV passages). To use another version, paste your own text.
- **Browse** beside the reference opens the passage picker: 66 books by section, then chapters and verses side by side. Click the first and last verse (Shift-click extends from the first), or select only a chapter to load it all, then **Load preview**. Verse counts come from a built-in table (KJV numbering; OYCB where it differs), so no network request is made until you load. Recent passages are listed for one-click reloading.
- While you type a reference, matching books are suggested (English and Yoruba names, standard abbreviations such as Jn, Ps or 1 Cor, and three-letter codes such as LUK; accents are optional). Use the arrow keys and Enter, or click a book; Escape closes the list. The chapter and verse you typed are kept. References are tidied before lookup: Luke10;18–20, Lk 10:18 to 20 and Luke 10 : 18 − 20 all become Luke 10:18-20. Unknown or ambiguous books (such as Jo) and unclear ranges (such as Luke 10-11:3) show an error instead of a guess. The same rules apply to Yoruba lookups and to the NKJV paste reference.
- In Words, click any word or type a phrase. Add your explanation and optional Greek/Hebrew details. You can create several word studies. Each selected word has its own highlight color, with presets and a custom color picker. Selecting more words keeps the full passage in the preview. Colors are saved with the session and sent to the presentation together. Highlight-only selections stay on the passage slide; a separate word-study slide appears when you add an explanation or original-language details.
- The Greek/Hebrew dictionary is a search aid, not automatic verse-to-lexicon alignment. Check an entry against the verse before using it. Dictionary senses are not all the meaning of a word in one passage.
- In Design, choose a theme, typeface, highlight color, and slide size. Turn on **Fit Bible and pasted slides to screen** to size each verse or section as large as fits inside the **Fit padding** (0–240 px inside the slide margins): short verses grow, long ones shrink. Text slides have their own **Fit to screen** and padding, which scale heading, subheading and body together. With Fit off, the sizes you set are used and only overflowing text is reduced. Saved designs keep Fit off until you turn it on.
- **Background image** (Design) puts an image behind every full-screen slide of the item: Scripture, text and song slides. Upload a PNG, JPEG or WebP; it is reduced to fit 1920 × 1080 and kept once in the companion's image store, and the item keeps only its id. **Image overlay** lays the theme's own background color over the image (0–80 %, 45 % to start), so the theme's text stays readable on light and dark themes; 0 % shows the image unchanged. A text slide with its own background color keeps that color. The lower third stays transparent. New items take the current background, and **Use this design in all items** includes it.
- Pick a slide thumbnail, then click Send to screen. Draft changes stay off the screen until you send them.
- Double-click a thumbnail to send that slide straight to the screen. A single click only previews it. In select mode, and with Ctrl, Shift or Cmd held, clicks only select.
- Live arrows move through the last deck you sent. Hide screen, beside Send to screen, clears the TV to black. Show screen restores the last sent slide. Your study stays open.
- Long passages and long explanations are split across slides.
- In pasted passages and text slide bodies, a blank line starts a new slide. A single line break stays on the same slide, several blank lines in a row make one break, and a long section still splits to fit. Looked-up verses keep the layout chosen in Bible.

## Items: the service rundown
Each song, Bible reading and presentation is its own **item** in the show. The list at the top of the left column shows the items in order, with their type, name, number of slides, and **LIVE** on the item whose slide is on screen. Choosing an item shows only its slides in the strip; the screen does not change until you send.

- **Add to show** (Songs) puts the song in a new item and selects it. **Replace song in this item** swaps the song in a Song item; Undo is under Songs.
- **Look up** (Bible) changes the current Scripture item, and Previous/Next verse stay in it. From a Song or Presentation item, a lookup makes a new Scripture item. **Add passage as new item** always makes one, for a second reading.
- Templates and Add text slide add slides to the current Presentation item, or make one from a Song or Scripture item. Blank lines in pasted text stay slides inside one item.
- An empty item is used before a new one is made. New items take the current design and word highlight styles (not word explanations).
- **Item actions** (under the list): rename, earlier, later, duplicate, remove (with Undo), **Use this design in all items** and **Use these word styles in all items** (each with Undo; the passage layout and words per slide are left alone so slide ids do not change).
- Older shows load unchanged. An item that mixes songs, Bible and text slides can be **split into items**: each song, the passage with its word studies, and each run of text slides become items, keeping every slide, its order, hidden pages and notes. Split shows how many items it will make, refuses if the slides are interleaved (it never rearranges), and can be undone until one of the new items is changed.

A show can hold up to 60 items. **Older Wordlight versions (including the web version and the stable companion until it is updated) accept at most 30**: a show with more items, saved here, will not open there. Before upgrading, back up the data folder; to go back to an older version, restore that backup rather than data saved by the newer one.

## OBS and screens (local companion)
Run the companion on the OBS computer (Start Wordlight.cmd) and work in its studio at http://127.0.0.1:18765. That studio is the controller: one Send updates every output below.

OBS Browser sources, 1920 × 1080, Local file off, Shutdown source when not visible off:
- Full screen: http://127.0.0.1:18765/?view=output&obs=1
- Lower third (transparent): http://127.0.0.1:18765/?view=lower&obs=1

**OBS & screens** in the studio shows these URLs and how many full-screen and lower-third pages are connected to the companion. That count is the companion's own connections; it does not prove that OBS or a TV is displaying them. Output pages keep their last screen if the companion stops, and reconnect on their own.

Wordlight needs no account or sign-in. To move shows from another copy of Wordlight: Save show (or Export library) there, then Import shows here. Import adds copies and never changes the live screen.

### Web studio connection (optional pairing)
Off unless `WORDLIGHT_BRIDGE_ORIGINS` names an https site that hosts a Wordlight web studio. Then that web version can drive the companion's outputs once paired. In the local studio, **OBS & screens** shows a 12-character code; enter it in the web studio under **OBS & screens** and click Connect. The browser may ask to allow access to devices on the local network; allow it. Each Send then goes to the web presentation window and to the companion. If the companion cannot be reached, the web window still updates and a message says the OBS outputs were not updated. When it comes back, the web studio resends only a Send you made while it was away, and only if the companion has nothing newer. Pairing or reloading the web studio never changes the screen: it shows the companion's current screen instead, and follows screens sent from the local studio, the phone or another web studio at its next status check (every 5 seconds).

Once paired, the web studio also uses this computer's song library (search, open, add to a show, save to the library), its installed Bibles (KJV, ASV, WEB, OYCB and an imported NKJV) and a connected NKJV key, and its image store for background images. If the companion stops, Songs says so with **Retry** and installed versions are looked up online from the same version's online source; another version is never used instead. Removing songs or images, importing, installing Bibles and entering the API.Bible key stay in the local studio.

The bridge accepts the live screen and the song, Bible and image routes below, never shows, only from the configured site and only with the current code. **New code** in the local studio ends the old pairing. The companion still listens on 127.0.0.1 only. The pairing needs a published web version that includes this feature.

### NDI
Wordlight does not send NDI itself; OBS does, with DistroAV. Put both Browser sources in one scene that stays rendered (for example a projector of a "Wordlight NDI Engine" scene) and give each source its own Dedicated NDI output filter, such as "Wordlight Full Screen" and "Wordlight Lower Third". Keep that projector open and OBS not minimised: a source that is not being rendered can send stale frames. The lower third keeps its transparency over NDI. Check each feed on the receiving computer.

### Companion API (local)
- `GET /api/health` – app name, version and build (used by Start Wordlight to recognise a running copy).
- `POST /api/app/quit` – stop Wordlight after pending saves (used by Stop Wordlight; local and JSON only).
- `GET /api/state` – library and live screen (local tools only).
- `GET /api/events?view=output|lower` – live screen stream used by output pages.
- `GET /api/bridge/code` – pairing code and connected output counts (local studio only); `POST` makes a new code.
- `GET /api/bridge/status`, `GET /api/bridge/live` (read the current screen), `POST /api/bridge/live` – web studio bridge (allowed origin and `Authorization: Bearer <code>` required; older screens get 409).
- Through the bridge, with the same checks: `GET /api/bridge/songs`, `/songs/categories`, `/songs/item`, `POST /api/bridge/songs/library`; `GET /api/bridge/bibles`, `/bibles/passage`, `/bible/status`, `/bible/nkjv`; `GET /api/bridge/assets`, `/assets/<id>`, `POST /api/bridge/assets`. Every other route answers 404 through the bridge.
- `GET /api/remote/status`, `POST /api/remote/password|enabled|signout` – phone remote settings (local studio only).
Set `WORDLIGHT_PORT` and `WORDLIGHT_DATA_DIR` to run a separate test copy with its own data. `WORDLIGHT_REMOTE_PORT` moves the phone remote (default 18766); `WORDLIGHT_REMOTE_BIND=127.0.0.1` keeps it off the network for tests.

### Phone remote
A phone on the same Wi-Fi can drive the screen from its browser: Previous/Next, Hide/Show screen, the countdown (start, pause, reset), and choosing a show, scene and slide to **Send to live**. Browsing on the phone never changes the screen or the studio's preview until Send. Every change goes through the same live state as the studio, so OBS full screen, lower third, graphics and timer stay in step. The phone cannot start OBS streaming or recording, edit shows, open files or settings, or reach anything else on the companion.

Turn it on in the local studio: **Phone remote**, set a password (8+ characters), then **Turn on**. The dialog shows this computer's Wi-Fi/Ethernet addresses with a QR code each (the code holds only the address, never the password). Open the address on the phone, for example `http://192.168.1.23:18766/remote`, and enter the password. Nothing to install, no account, no internet: the phone talks only to this computer.

- The remote is off until you turn it on, and has no default password. It runs on its own port (18766); the studio, files, songs, NKJV key and settings stay on 127.0.0.1:18765.
- The password is kept only as a salted scrypt hash in `.wordlight-data/remote.json` (not in exports, `dist/` or git). A damaged file leaves the remote off until a new password is set.
- A phone stays signed in for 12 hours. Changing the password, **Sign out all phones** or **Turn off** signs out every phone at once. Five wrong passwords lock that phone's address for 10 minutes.
- Closing the phone or losing Wi-Fi never changes the screen. The phone reconnects by itself and shows the current screen. Next/Previous carry the screen the phone saw, so a late or repeated tap is refused instead of skipping a slide.
- VPN and virtual adapters (Tailscale, WSL, Hyper-V and similar) are not listed and are refused.
- If the phone cannot open the page: check it is on the same Wi-Fi (guest networks often keep devices apart). If Windows asks whether Node.js may communicate on networks, allow **Private networks** only, and set the Wi-Fi network to Private in Windows Settings. Wordlight does not change firewall settings.

## Direct TV projection
Click Present. Move the presentation window onto your extended display, then click Full screen. The OBS output URLs have no buttons.

## Keys
When you are not typing in a field: → or Page Down moves the live screen to the next slide, ← or Page Up to the previous one (presentation clickers send Page Up/Down), and B hides or restores the screen everywhere. Alt + Enter sends the preview. While a song is on screen: 1–9 jump to that verse, C to the next chorus, G bridge, P pre-chorus, T tag, E ending. They act on the song that is live, never on the preview. Keys do nothing while a dialog is open.

## Saving and backups
The local companion saves to .wordlight-data/session.json beside the app and keeps a copy in .wordlight-data/backups at most every 10 minutes (the newest 20). If session.json is ever unreadable, the companion keeps it as session-damaged-….json and starts from the newest readable backup.
Save show downloads the current show with its scenes; Export library in Shows downloads every show. Import shows restores them without changing the live screen.
Browser storage is local to that browser/profile. There is no cloud account sync. The local server binds to 127.0.0.1 only.

## Internet and sources
Pasted text, saved notes, design, and local projection work offline.
Lookups in installed Bibles work offline. Other verse lookups and the dictionary need internet; previously loaded online results are cached in the browser (NKJV results are not).
The optional Google fonts load after the app starts, so a slow or missing connection never delays the studio or the screen. Until they arrive, or offline, installed fonts are used; projection uses Georgia for serif.
Installed Bibles: official VPL archives from eBible.org (KJV eng-kjv2006, ASV eng-asv, WEB engwebp, OYCB yor), converted to one file per book with the text unchanged except KJV markup ([ ] and ¶) removed for display; each install keeps the archive's own notice.
Online Bible lookup: https://bible-api.com/
Online NKJV (when there is no NKJV file or API.Bible key): https://bolls.life/, one chapter per request as its API documentation asks.
Greek/Hebrew dictionary: BDB / Thayer through https://bolls.life/ (API documentation: https://github.com/Bolls-Bible/bain/blob/master/docs/API.md)
The initial Word / logos study is an editable example. Lexical source: https://biblehub.com/greek/3056.htm
This app does not generate AI interpretation or infer Greek/Hebrew words from English.

## Presentation editor
The Slides tab creates title, content, quote, and split-layout slides from any text. New slides start empty, and a slide without a heading or footer is listed as "Untitled slide". Mix them with Bible passages or turn off Include Bible / pasted passage for text-only decks. Each text slide has a heading, subheading, body, footer, sizes, alignment, bullets, colors, and font controls. Heading, subheading, and body support bold and italic. Select text in an editor field and use Format selected word or phrase, or use the Words tab. Every selected word or phrase has its own highlighter, underline, text-color, outline, or no-color style, with independent bold and italic. Text slide formatting is scoped to that slide. Repeated matching words within that slide share the same styling.

Duplicate, reorder, remove, and undo the most recent slide removal from Slides. Long text continues across slides; oversized text is reduced to fit. Text is escaped before rendering. Font choices use installed system fonts with fallbacks. This is a layout-based presentation editor, not a PPTX importer or free-positioned canvas.

## Live-use release rule
This app is used during live sessions. Keep development in a separate local preview. Do not push source or deploy without an explicit release request from the user. Never refresh or change the live studio or presentation as part of testing.


## Shows and verse navigation
Use **Shows** in the top bar to create, search, rename, duplicate, or remove shows. Use the **Current show** dropdown to switch quickly. Each show has independent content, styling, notes, and slide order. Existing sessions migrate into the first show. Switching or deleting a show does not change the audience output. The live bar identifies the show that was last sent.

Use **Organize slides** to select multiple items, move them earlier/later, duplicate, delete with undo, or copy them to another show. Continuation pages move as one item. Each looked-up verse is a separate organizer item; word studies and text-slide continuation pages remain grouped with their source. **Keep passage as slides** makes independent editable copies so one show can include several scriptures. **Delete slide** is visible above the thumbnails; The selected verse can be deleted without removing the other verses in the range. **Duplicate slide** is beside it, and duplication is also available for selections in the organizer. Undo applies to the most recent deletion and is reset when switching shows or closing/reopening the organizer.

**Previous verse** and **Next verse** appear in Bible and above a Bible preview. They follow the loaded reference, cross chapter/book boundaries, and use the selected passage's translation. Ranges and chapters create one slide per verse with its own reference. Within the loaded range, the buttons move between verse previews; beyond its boundary, they load the adjacent verse. Verse navigation uses the selected verse. The app uses the translation's available verse sequence, including gaps. Navigating changes the preview only. Send to screen remains explicit. Chosen words, explanations, colors, bold/italic, and emphasis belong to the show. Verse and translation changes preserve them exactly, including the selected word. Matching words keep their styles on new passages; absent words stay saved. Keep important passages as slides or export the show.

**Save show** exports the current show with all of its scenes (older Wordlight versions import only its current scene). **Export library** in Shows exports every show. Import accepts both a library and older session files, appending independent copies without overwriting existing shows. Local saves include the whole library; hosted saves remain local to the browser/profile, with no cloud synchronization. Up to 100 shows and 200 text slides per show are supported. Storage-quota failures are reported so the library can be exported. Export files are limited to 60 MB on import; the local save API accepts up to 25 MB.

Validation: core/model tests cover migration, independent copies, bulk ordering/deletion, live snapshots, verse ranges and chapter/book boundaries, saved Bible notes, and existing formatting. Browser QA is performed only on a separate local preview. Production studio/output windows are never refreshed during development.


## Timer overlay
Click **Timer** above the preview. Choose Countdown or Stopwatch, a countdown duration in minutes (decimals accepted), and one of four corners, then apply settings. Start/resume, pause, and reset act on the live timer. **Show overlay** makes it visible; **Hide overlay** removes only the timer. The audience screen's blank control hides everything, including the timer. The timer is independent of shows and continues when switching shows or sending a new deck. It uses timestamps shared with the presentation/OBS output, so both displays show the same time. A countdown stops visually at 00:00 with a red background; there is no sound alarm. Changing only position leaves it running, while changing mode or duration resets it to paused.


## Yoruba and passage layout
The local update adds **Yorùbá · Open Yoruba Contemporary Bible (OYCB)**. Enter a full Yoruba or English book name, or its three-letter code: Luku 10:18-20, Luke 10:18-20, LUK 10, or Luku 10:42-11:2. Cross-chapter selections support up to 10 chapters per lookup. Previous/next crosses chapter and book boundaries. Downloaded chapters are cached for later lookups. This is the Open Yoruba Contemporary Bible, not the Yoruba Bible (YCE) edition.

In Bible, **Passage layout** explicitly selects **One verse per slide** or **Flowing text (split by length)**. The choice is saved per show and can be changed after loading the passage. Words and styling remain unchanged. Pasted text does not supply reliable verse boundaries and uses flowing layout; leave a blank line wherever you want a new slide.

The Yoruba text comes from AO Lab's Free Use Bible API (yor_bib), sourced from eBible.org / Biblica. Scripture copyright: Biblica® Open Yoruba Contemporary Bible™. Copyright © 2009, 2017 by Biblica, Inc. “Biblica” is a trademark registered in the United States Patent and Trademark Office by Biblica, Inc. Used with permission. The text is licensed under CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/. Source and full notice: https://ebible.org/Scriptures/details.php?id=yor and https://www.open.bible/bibles/biblica-open-yoruba-contemporary-bible-2017. Scripture credit accompanies output, saved shows, and copied text slides. Editing the text changes the credit to identify a presenter adaptation and retains the source and ShareAlike notice. This attribution concerns the Bible content, not the application source.

## Refresh and recovery
Shows save immediately in browser storage before the local server's short save delay. A recovery copy keeps the previous valid library. Damaged primary data can recover from it without silently replacing saved shows. Under storage pressure, the app discards expendable verse/dictionary caches before retrying a show save. It never clears saved shows or the live output to free cache space.

On local startup, the app compares save timestamps so a refresh immediately after typing cannot replace newer browser edits with an older disk save. A fresh browser also cannot overwrite saved disk shows with an empty default show. Save errors stay visible across rerenders. Browser storage is still tied to that browser/profile and device; deleting site data removes those saves. Export library remains the portable backup.

### NKJV passages
NKJV is never bundled. Choose **New King James Version (NKJV)** in the Bible panel and look up as usual: references, ranges, whole chapters, Browse and Previous/Next verse all work. Wordlight uses, in order:
1. **Your own NKJV file** (Import NKJV file, below), offline.
2. **Your API.Bible key**, if you connected one in the local studio.
3. Otherwise **bolls.life**, a public Bible API that needs no key ([API documentation](https://github.com/Bolls-Bible/bain/blob/master/docs/API.md)). Wordlight asks it for one chapter at a time, as its documentation requests, keeps at most 12 chapters in memory and saves none. Verse text is reduced to plain text and every slide carries the Thomas Nelson copyright line. If bolls.life cannot be reached, the lookup says so; another version is never used instead.

The line under the reference says which of these is used. **Use your own NKJV (optional)** in the Bible panel holds the file import and the API.Bible key.

Connecting an API.Bible key: paste the key from your API.Bible account and choose **Connect NKJV**. The companion checks that the account can read NKJV before it is marked ready.

- The key stays in the companion: in `.wordlight-data/api-bible.json` (not in git), or in the `WORDLIGHT_API_BIBLE_KEY` environment variable, which then takes precedence. It is never sent to the studio page, browser storage, shows or exports. **Disconnect NKJV** removes a saved key.
- Chapters are fetched whole and kept in the companion's memory for at most an hour and at most 499 verses in total (until API.Bible's caching terms are clarified); nothing is cached in the browser or on disk. A chapter that arrives incomplete is refused rather than shown partly.
- Slides carry the copyright line API.Bible returns, and the show records the provider, Bible id and fetch time. Fair-use reports (FUMS) are sent with an anonymous device id and a session id, without a user id.
- The web version looks up NKJV through the paired companion's file or key when there is one, otherwise from bolls.life directly. The key itself never leaves this computer.
- **Import NKJV file** installs NKJV from your own Bible file (FreeShow .fsb, a VPL text file, or a ZIP with one) so NKJV works offline. Import only a file you are licensed to use; it stays in the data folder, is never shared, and Wordlight never downloads NKJV for you. An imported copy is used before API.Bible and bolls.life.
- Without either, **Use pasted NKJV text instead** still loads your own pasted NKJV text with the publisher notice.

Whether NKJV is available depends on your API.Bible account and plan. Official documentation: [authentication](https://docs.api.bible/quick-start/authentication/), [Bibles](https://docs.api.bible/guides/bibles/), [chapters](https://docs.api.bible/guides/chapters/), [passages](https://docs.api.bible/guides/passages/), [content formats](https://docs.api.bible/resources/content-output-formats/), [fair use](https://docs.api.bible/resources/fair-use/), [referencing verses](https://docs.api.bible/resources/referencing-verses/), and the [terms](https://api.bible/terms-and-conditions).

## Performance notes
The studio rebuilds the slide list only when the content behind it changes, so typing an explanation or switching tabs on a long passage stays responsive. The preview, thumbnails and output skip redrawing when nothing visible changed, and the timer updates the screen once a second rather than restyling it four times a second. Browser saves no longer re-check the save they just wrote; data written by another tab is still validated before it becomes the backup. `performance.test.mjs` covers these shortcuts. Fitting text to the slide always starts again from the design sizes, so a font that arrives late can make text larger again as well as smaller (`dist/fit.mjs`, covered in `slide-breaks.test.mjs`).

## Scenes and selecting slides
Each show has scenes, like scenes in OBS. A scene holds its own passage or range, text slides, styles, chosen words and preview position. Use the scene bar above the slides to switch scenes, rename the current scene, create a **New scene**, or **Save as new scene** to keep the current scene and continue in a copy. For example, keep Luke 10:18-20 in one scene, look up John 3:16-18 in the next, and come back later. **Remove scene** can be undone from the same bar. A show keeps at least one scene and holds up to 30. The show title belongs to the show; each scene has its own name.

Switching scenes changes the preview only. The screen keeps the last slide you sent, and the scene list marks the scene that is on screen. Shows saved before scenes existed open as one scene, Scene 1, with nothing changed. Saves, Export library, Import, Duplicate show and the local companion keep every scene.

Click **Select slides** above the thumbnails, or Ctrl/Shift/Cmd-click a thumbnail, to select slides in the deck. Each slide is selected on its own: one verse, one blank-line section of pasted text, or one continuation page. The bar that appears can select all, clear, move earlier or later, duplicate, delete (with undo), and copy or move the selection to another scene or show. Copies become editable text slides, one per selected slide, in the order shown, so deleted pages stay deleted. Moving can be undone with Undo deletion, which also restores the destination. Editing a passage, slide body or explanation re-splits it into pages, so page-level deletions and positions for that text are cleared. **Organize slides** works with whole items (a passage, a text slide with its continuation pages, a word study).

## Live view in the studio
Beside the editable **Preview** (below it on narrower windows) the studio shows **Live**: a copy of the last slide Wordlight sent, with its show and scene, styling, highlights, credit, timer and hidden state. Editing, switching scenes and switching shows never change it; only Send to screen, double-click, the live arrows and Hide/Show screen do. It mirrors what Wordlight sends to its outputs. It cannot confirm what a TV or OBS actually displays. Choose **Full screen** or **Lower third** above it to see either output.

## Lower third over video
The lower third shows the live slide in a band on a transparent 1920 × 1080 page, for placing over a camera or video in OBS. It follows the same live state as the full-screen output, so one Send (or live arrow) updates both. Hide screen makes the lower third fully transparent. The timer appears in its corner when shown.

The band's text rewraps to the band's own width: line breaks made for the full screen (poetry and pasted lines) become spaces, so a short wide band is used fully; song lyrics keep their lines. The band shows the heading, subheading, slide text, a word study's verse and explanation, the reference and version, and the scripture credit; the small heading and page numbers are left out. Bold and italic follow the slide.

Open **Lower third settings** in the Live pane to set band height and width, distance from the bottom, alignment and side margin, background color and opacity, text color, text size, Fit text to the band, and whether to show the reference. Click **Apply lower third settings**; the settings are kept with the live screen across Send, live arrows, scene and show changes and refresh, and do not change the full-screen output. The band always stays inside the canvas. With Fit on, text uses the largest size up to Text size that fits the band; text that still does not fit makes the band grow upward instead of being cut off.

OBS setup, with the local companion running:
1. Add a Browser source above your video source. Leave Local file off.
2. URL: http://127.0.0.1:18765/?view=lower&obs=1, width 1920, height 1080.
3. Keep the full-screen Browser source (`?view=output&obs=1`) for the projector if you use one.
Use the local companion for this. OBS cannot sign in to the private web version, and Window Capture does not keep transparency. **Open lower third window** opens the same page in a browser window for checking.

## Songs
**Songs** (local studio, or a paired web studio) searches the FreeShow library on this computer by title and category. Wordlight reads FreeShow's index and opens a song's file only when you open the song; it never writes FreeShow files. Open a song to see its arrangement, then **Add to show**: the song is copied into the show (sections, the chosen arrangement, author, copyright and CCLI number as stored), so the show runs offline and is not changed if the library changes. Song slides follow the show's Design, are fitted to the screen and carry the song credit. The section bar under Live jumps to any section of the song on screen.

**New song**, **Edit**, **Export** and **Import song file** work without FreeShow. Lyrics are plain text: a `[Verse 1]` line starts a section, a blank line starts a new slide, and a slide with only `(blank)` is a blank cue. The arrangement is the section labels in order, comma separated, with repeats allowed. Edits change the show's copy only. Import accepts Wordlight song files and FreeShow `.show` files.

Limits (refused with the exact numbers, never cut): 60 songs per show; per song 200 sections, 60 slides per section, 20 arrangements of up to 400 entries, 200,000 characters of lyrics, and each arrangement expanding to at most 1,000 slides and 300,000 characters; per show the chosen arrangements expand to at most 3,000 slides and 2,000,000 characters. Titles up to 300 characters, details such as copyright up to 2,000.

### Song library
The local studio also keeps its own song library in `.wordlight-data/songs/`: one file per song (ids start with `wl-`) and an `index.json` with titles and authors only. Search covers the library and FreeShow together; the source list narrows it to **My library** or **FreeShow**, and library songs carry a **Library** tag. Without FreeShow the library still works and the status line says FreeShow was not found.

In the song editor, **Save in this show** changes the show's copy only. **Save to song library** also saves it to the library: a FreeShow or new song becomes a new library song, and a library song is updated. If the library copy changed since it was opened (another tab, an import), the save is refused and **Save as new song** keeps both. Shows always hold their own copy, so changing or removing a library song never changes a saved show.

**Remove from library** moves the song file to `songs/removed/`. **Export library** downloads every library song as one file (up to 50 MB, the size an import accepts). **Import library** adds the songs from such a file and keeps their library ids, so importing the same file again, or a song repeated within it, is skipped. Songs that fail checks are counted and named; an import that would pass the 5,000-song limit is refused whole. A damaged `index.json` is kept as `index.json.damaged` and reported; nothing is written until it is fixed. If the index cannot be written, a save, import or remove is undone and reported. A missing or unreadable FreeShow library never stops the song library, and **My library** does not read FreeShow at all.

Not yet: FreeShow media and styling (listed when a song opens), and lyric search or CCLI services.

## Graphics output
`http://127.0.0.1:18765/?view=graphics&obs=1` is a transparent 1920 × 1080 page for an OBS Browser source above cameras and video. **Graphics** in the studio sets it up:
- **Logo**: an image you upload, a position (corners or centre), size, margin and opacity.
- **Timer**: the same timer as the slides (start, pause and reset in Timer), with its own position, size and an option to hide at 0:00. Turn the slide timer overlay off if both would be visible in OBS.
- **Background**: a holding colour or image that covers everything under it. It is off until you press Show.
- **Title card**: a title and a subtitle or speaker name.

Settings are edited in the dialog's preview. **Apply settings** sends them (elements already on air update); each **Show** or **Hide** changes only that element. Graphics are not hidden when slides are blanked, and they are not stored in shows.

Images are PNG, JPEG or WebP (SVG is not accepted). Logos are reduced to 512 px wide and backgrounds to 1920 × 1080 before upload. The companion stores up to 40 images (3 MB each) once each, in `.wordlight-data/assets`, and serves them to OBS. **Remove unused from image library** takes the images that neither the graphics nor any show in the local studio use out of the image library; an image on air or in a saved show cannot be removed. Removed images leave the lists, but their files are kept and still served, so a show saved only in a web studio keeps its background; uploading the same image again brings it back. Save show and Export library include each background image the shows use, once; if one cannot be included, nothing is exported. Import stores those images before adding the shows; if an image is damaged, missing or cannot be stored, nothing is imported, and a file without images imports anywhere. Graphics images are not in exports, so to move graphics copy `.wordlight-data/assets` with the session. The web version has no graphics, and a screen sent from the web studio keeps the companion's graphics.

Full screen and lower third keep their own timer overlay and never show the logo, so use either the slide timer overlay or the graphics timer for a given OBS composition.

## Saving to the companion
Edits are kept in the browser first and then saved to the companion. If the companion is unreachable the status says "Not saved to this computer yet", and the save is retried when the connection returns. On reconnect, the newer of the browser and companion copies wins (the same rule as at startup). If the studio opens before the companion is ready, it retries the connection with a growing delay.

