/* Adapted from nathanpuls/built-at-sheets-old (index.html). */
const CONFIG = {allowRawHtml:true};
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    function markdownToHtml(markdown) {
      const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
      const html = [];
      let paragraph = [];
      let listOpen = "";
      let blockquote = [];
      let codeBlock = null;

      function getMarkdownTitle() {
        const firstContentLine = lines.find((line) => {
          const trimmed = line.trim();
          return trimmed && !/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) && !trimmed.startsWith("```");
        });

        if (!firstContentLine) return "";

        return firstContentLine
          .trim()
          .replace(/^>\s?/, "")
          .replace(/^#{1,6}\s+/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+[.)]\s+/, "")
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, "$1")
          .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, "$1")
          .replace(/[*_`]/g, "")
          .replace(/\s*\|\s*/g, " ")
          .trim();
      }

      function renderInline(value) {
        return escapeHtml(value)
          .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<img src="$2" alt="$1">')
          .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>')
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/__([^_]+)__/g, "<strong>$1</strong>")
          .replace(/\*([^*]+)\*/g, "<em>$1</em>")
          .replace(/_([^_]+)_/g, "<em>$1</em>")
          .replace(/`([^`]+)`/g, "<code>$1</code>");
      }

      function splitTableRow(line) {
        return line
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
      }

      function isTableSeparator(line) {
        return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
      }

      function isTableRow(line) {
        return line.trim().includes("|");
      }

      function flushParagraph() {
        if (!paragraph.length) return;
        html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
        paragraph = [];
      }

      function closeList() {
        if (!listOpen) return;
        html.push(`</${listOpen}>`);
        listOpen = "";
      }

      function flushBlockquote() {
        if (!blockquote.length) return;
        flushParagraph();
        closeList();
        const quoteHtml = markdownToHtml(blockquote.join("\n"))
          .match(/<article class="preview-content">\s*([\s\S]*?)\s*<\/article>/)?.[1]
          .trim() || renderInline(blockquote.join(" "));
        html.push(`<blockquote>${quoteHtml}</blockquote>`);
        blockquote = [];
      }

      function renderTable(startIndex) {
        const headers = splitTableRow(lines[startIndex]);
        let rowIndex = startIndex + 2;
        const rows = [];

        while (rowIndex < lines.length && isTableRow(lines[rowIndex].trim()) && lines[rowIndex].trim()) {
          rows.push(splitTableRow(lines[rowIndex]));
          rowIndex += 1;
        }

        html.push("<table>");
        html.push("<thead>");
        html.push(`<tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr>`);
        html.push("</thead>");

        if (rows.length) {
          html.push("<tbody>");
          for (const row of rows) {
            html.push(`<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`);
          }
          html.push("</tbody>");
        }

        html.push("</table>");
        return rowIndex - 1;
      }

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        const fence = trimmed.match(/^```(?:\s*([a-z0-9-]+))?\s*$/i);

        if (fence) {
          if (codeBlock) {
            html.push(`<pre><code>${escapeHtml(codeBlock.lines.join("\n"))}</code></pre>`);
            codeBlock = null;
          } else {
            flushBlockquote();
            flushParagraph();
            closeList();
            codeBlock = { language: fence[1] || "", lines: [] };
          }
          continue;
        }

        if (codeBlock) {
          codeBlock.lines.push(line);
          continue;
        }

        if (!trimmed) {
          flushBlockquote();
          flushParagraph();
          closeList();
          continue;
        }

        const quote = trimmed.match(/^>\s?(.*)$/);
        if (quote) {
          blockquote.push(quote[1]);
          continue;
        }

        flushBlockquote();

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          flushParagraph();
          closeList();
          html.push("<hr>");
          continue;
        }

        if (isTableRow(trimmed) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
          flushParagraph();
          closeList();
          index = renderTable(index);
          continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          flushParagraph();
          closeList();
          const level = heading[1].length;
          html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
          continue;
        }

        const unorderedItem = trimmed.match(/^[-*+]\s+(.+)$/);
        if (unorderedItem) {
          flushParagraph();
          if (listOpen !== "ul") {
            closeList();
            html.push("<ul>");
            listOpen = "ul";
          }
          html.push(`<li>${renderInline(unorderedItem[1])}</li>`);
          continue;
        }

        const orderedItem = trimmed.match(/^\d+[.)]\s+(.+)$/);
        if (orderedItem) {
          flushParagraph();
          if (listOpen !== "ol") {
            closeList();
            html.push("<ol>");
            listOpen = "ol";
          }
          html.push(`<li>${renderInline(orderedItem[1])}</li>`);
          continue;
        }

        paragraph.push(trimmed);
      }

      if (codeBlock) html.push(`<pre><code>${escapeHtml(codeBlock.lines.join("\n"))}</code></pre>`);
      flushBlockquote();
      flushParagraph();
      closeList();

      const documentTitle = escapeHtml(getMarkdownTitle());

      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${documentTitle}</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      --accent: #2563eb;
      --accent-soft: #f8fafc;
      --accent-border: #e5e7eb;
      --link-color: #111827;
      margin: 0;
      background: #ffffff;
      color: #111827;
      font-family: inherit;
      letter-spacing: 0;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    .preview-content {
      max-width: 720px;
      margin: 0 auto;
      padding: 64px 20px 80px;
      font-size: 16px;
      line-height: 1.72;
    }

    .preview-content h1,
    .preview-content h2,
    .preview-content h3,
    .preview-content h4 {
      margin: 36px 0 18px;
      font-weight: 680;
      letter-spacing: 0;
    }

    .preview-content h1 {
      font-size: 34px;
      font-weight: 760;
      line-height: 1.18;
    }

    .preview-content h2 {
      font-size: 25px;
      line-height: 1.26;
    }

    .preview-content h3 {
      font-size: 20px;
      line-height: 1.3;
    }

    .preview-content h4 {
      font-size: 18px;
      line-height: 1.35;
    }

    .preview-content > :first-child {
      margin-top: 0;
    }

    .preview-content p,
    .preview-content li {
      font-size: 17px;
      margin: 0 0 16px;
    }

    .preview-content ul,
    .preview-content ol {
      margin: 0 0 20px;
      padding-left: 1.5rem;
    }

    .preview-content a {
      color: #000;
      text-decoration: underline;
      text-decoration-color: #000;
      text-decoration-thickness: 1px;
      text-underline-offset: 0.25em;
    }

    .preview-content blockquote {
      margin: 24px 0;
      padding: 0 0 0 16px;
      border-left: 3px solid var(--accent-border);
      color: #4b5563;
    }

    .preview-content code:not(pre code) {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.92em;
      background: var(--accent-soft);
      color: #111827;
      border-radius: 5px;
      padding: 0.2em 0.4em;
    }

    .preview-content pre {
      background: #f9fafb;
      border: 1px solid var(--accent-border);
      border-radius: 8px;
      padding: 1.25rem;
      margin: 1.5rem 0;
      overflow-x: auto;
    }

    .preview-content pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
      color: inherit;
      font-size: 0.9em;
      line-height: 1.6;
    }

    .preview-content img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 20px 0;
      border-radius: 8px;
    }

    .preview-content hr {
      border: 0;
      border-top: 1px solid var(--accent-border);
      margin: 36px 0;
    }

    .preview-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
      font-size: 15px;
    }

    .preview-content th,
    .preview-content td {
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      text-align: left;
      vertical-align: top;
    }

    .preview-content th {
      background: var(--accent-soft);
      font-weight: 650;
    }
  </style>
</head>
<body>
  <article class="preview-content">
    ${html.join("\n    ")}
  </article>
</body>
</html>`;
    }

    function getRenderableHtml(value) {
      const trimmed = String(value || "").trim();
      const withoutCodeFence = trimmed
        .replace(/^```(?:html|markdown|md)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      if (CONFIG.allowRawHtml && (/^<!doctype html/i.test(withoutCodeFence) || /^<html[\s>]/i.test(withoutCodeFence))) {
        return withoutCodeFence;
      }

      if (CONFIG.allowRawHtml && /^(?:<!--[\s\S]*?-->\s*)*<[a-z][a-z0-9:-]*(?:\s|\/?>)/i.test(withoutCodeFence)) {
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title></head><body>${withoutCodeFence}</body></html>`;
      }

      return markdownToHtml(withoutCodeFence);
    }


export {escapeHtml, markdownToHtml, getRenderableHtml};

