# Built.at Sheets viewer

Minimal HTML preview: `https://sheets.built.at/A1?id=SHEET_ID` (uppercase `ID` also works). Each request fetches A1 directly from Google's CSV export and returns its HTML as the entire page. No header, sidebar, iframe, loading screen, storage, or viewer cache. A small ellipsis menu offers Copy source and page links listed directly beneath Copy source from column B. Optional `gid` selects a worksheet. Open pages check for edits about once a second while visible and reload when the sheet changes; no deployment is required for content changes. Google response and save propagation time still apply. HTML runs under an opaque-origin CSP sandbox with scripts enabled.

Cloudflare Pages viewer adapted from the original prototype. No signup, registry, D1, Apps Script, push subscription, Google credentials, or application caching.

URLs: `https://sheets.built.at/?id=SHEET_ID` and `?id=SHEET_ID&slug=about`. Optional `gid=123` selects a worksheet; otherwise Google selects the first worksheet.

Column A is HTML, Markdown, plain text, or a standalone HTTP(S) redirect URL or bare domain (assumed HTTPS). Column B is the slug. An explicit `home` row supplies the homepage anywhere in the worksheet, including row 1. Optional content/slug headers are ignored. Blank slugs are skipped and duplicate normalized slugs are reported. Navigation follows row order.

Every page load, page navigation, and Refresh fetches a direct CSV export from Google Sheets (not G-Viz) through `/api/sheet`, with no-store directives and a timestamp. Google response/propagation time remains outside the viewer's control. HTML executes inside an opaque-origin sandbox; scripts and forms work without access to the viewer's origin. Matched relative page links preserve the Sheet ID. Other links open separately. No Sheet contents are stored by the application.

Deploy as a Cloudflare Pages Git project: repository root directory `sheets-viewer`, build command blank, output directory `public`. Pages Functions in `functions/` provide Sheet retrieval. Node 22+ is sufficient for `npm test`. Connect `sheets.built.at` using Pages Custom domains.

Utility menu configuration: edit DEFAULT_UTILITY_ITEMS in public/utility-menu.js to add labels, links, or supported actions. Copy source copies the original cell text, not rendered HTML. An empty configuration injects no menu. URL options: menu=0 hides the utility entirely; pages=0 keeps only Copy source. Page links use /a1?id=SHEET_ID&slug=about and preserve gid. Legacy /?id=SHEET_ID&slug=about links render with the same minimal utility instead of a toolbar. Each navigation still fetches fresh data.

## Automatic updates

Visible pages check a small revision endpoint about once a second with at most one request in flight. The endpoint fetches current public sheet values directly from Google. When the revision changes, the page reloads so HTML, CSS, scripts and menu links all update together. Hidden tabs pause checking and check immediately when visible again. Failed requests back off. Google save and export propagation can add delay. Add `live=0` to disable automatic updates.

A Google Drive push implementation was evaluated but notifications did not arrive within 45 seconds in the end-to-end check. The final implementation uses short active-page checks instead, requires no Google credential, and has no separate Worker or Durable Object.

## Workbook theme and menu

- **Theme → A1** accepts plain CSS and applies it to all HTML and Markdown pages from the workbook. For example, `body { background: pink; }`. Leave A1 blank for the page's own styles.
- **Settings → A1:B1** accepts `Show default menu` in A1 and `FALSE` in B1 to hide the top-right ellipsis. A Google Sheets checkbox in B1 works too. Use `TRUE` or clear B1 to show the menu again.

Both tabs are optional. Changes to these cells participate in the same live updates as page edits.
