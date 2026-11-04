# Built.at Sheets viewer

Cloudflare Pages viewer adapted from the original prototype. No signup, registry, D1, Apps Script, scheduled work, or application caching.

URLs: `https://sheets.built.at/?id=SHEET_ID` and `?id=SHEET_ID&slug=about`. Optional `gid=123` selects a worksheet; otherwise Google selects the first worksheet.

Column A is HTML, Markdown, plain text, or a standalone HTTP(S) redirect URL. Column B is the slug. An explicit `index` row supplies the homepage anywhere in the worksheet, including row 1. Optional content/slug headers are ignored. Blank slugs are skipped and duplicate normalized slugs are reported. Navigation follows row order.

Every page load, page navigation, and Refresh fetches a direct CSV export from Google Sheets (not G-Viz) through `/api/sheet`, with no-store directives and a timestamp. Google response/propagation time remains outside the viewer's control. HTML executes inside an opaque-origin sandbox; scripts and forms work without access to the viewer's origin. Matched relative page links preserve the Sheet ID. Other links open separately. No Sheet contents are stored by the application.

Deploy as a Cloudflare Pages Git project: repository root directory `sheets-viewer`, build command blank, output directory `public`. Pages Functions in `functions/` provide Sheet retrieval. Node 22+ is sufficient for `npm test`. Connect `sheets.built.at` using Pages Custom domains.
