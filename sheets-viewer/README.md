# Built.at Sheets viewer

Minimal HTML preview: `https://sheets.built.at/A1?id=SHEET_ID` (uppercase `ID` also works). Each request fetches A1 directly from Google's CSV export and returns its HTML as the entire page. No header, sidebar, iframe, loading screen, storage, or viewer cache. A small ellipsis menu offers Copy source and page links listed directly beneath Copy source from column B. Optional `gid` selects a worksheet. Refresh after editing A1; no deployment is required for content changes. Google response and save propagation time still apply. HTML runs under an opaque-origin CSP sandbox with scripts enabled.

Cloudflare Pages viewer adapted from the original prototype. No signup, registry, D1, Apps Script, scheduled work, or application caching.

URLs: `https://sheets.built.at/?id=SHEET_ID` and `?id=SHEET_ID&slug=about`. Optional `gid=123` selects a worksheet; otherwise Google selects the first worksheet.

Column A is HTML, Markdown, plain text, or a standalone HTTP(S) redirect URL. Column B is the slug. An explicit `index` row supplies the homepage anywhere in the worksheet, including row 1. Optional content/slug headers are ignored. Blank slugs are skipped and duplicate normalized slugs are reported. Navigation follows row order.

Every page load, page navigation, and Refresh fetches a direct CSV export from Google Sheets (not G-Viz) through `/api/sheet`, with no-store directives and a timestamp. Google response/propagation time remains outside the viewer's control. HTML executes inside an opaque-origin sandbox; scripts and forms work without access to the viewer's origin. Matched relative page links preserve the Sheet ID. Other links open separately. No Sheet contents are stored by the application.

Deploy as a Cloudflare Pages Git project: repository root directory `sheets-viewer`, build command blank, output directory `public`. Pages Functions in `functions/` provide Sheet retrieval. Node 22+ is sufficient for `npm test`. Connect `sheets.built.at` using Pages Custom domains.

Utility menu configuration: edit DEFAULT_UTILITY_ITEMS in public/utility-menu.js to add labels, links, or supported actions. Copy source copies the original cell text, not rendered HTML. An empty configuration injects no menu. URL options: menu=0 hides the utility entirely; pages=0 keeps only Copy source. Page links use /a1?id=SHEET_ID&slug=about and preserve gid. Legacy /?id=SHEET_ID&slug=about links render with the same minimal utility instead of a toolbar. Each navigation still fetches fresh data.
