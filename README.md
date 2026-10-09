# Merge

A document workspace that processes files in the browser. There is no document upload API, analytics, account database, or document storage. The preview is hosted privately with Sites.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4173`. Open the built site through HTTP, rather than opening `index.html` directly. Source modules and packages are compiled into `dist/`.

```sh
npm test
npm audit
```

Tests cover the application DOM, real PDF/DOCX/XLSX/ZIP generation and reading, file limits, error handling, and HTTP security headers. They do not replace visual testing across browsers or a penetration test.

## Behavior

- Merge PDFs: copies pages in the selected order, preserving their dimensions and appearance.
- Merge text: joins extracted document text with separators.
- Compare: highlights added and removed text from two documents.
- Convert and edit: work with extracted text. Original document formatting, images, tracked changes, headers, and footers are not retained.
- Excel output: copies all sheet values from spreadsheet inputs, without formulas, macros, or original formatting. Text inputs become one column of text; strings beginning with `=` stay strings.
- JSON output: exports parsed JSON where possible. Text becomes a `content` field; merged inputs become a list of named documents.
- ZIP: preserves the original files and disambiguates duplicate names. Compression does not guarantee a smaller result for already compressed documents.
- Scanned PDFs: can be merged as pages, but text extraction requires OCR, which is not included.

## Security controls

The header theme toggle stores only `light` or `dark` under `merge.theme` in the visitor's browser `localStorage`. It never sends that preference to the server. Without a saved choice, the theme follows the operating system. If browser storage is blocked, the toggle works for the current page only.

Dependencies are pinned with a lockfile and bundled locally. There are no runtime CDN scripts or third-party font requests. PDF.js evaluation is disabled. Uploaded names and document contents are rendered as text, not HTML. DOCX extraction rejects XML entities and reads the document body only. Excel exports remove executable formulas and macros.

The site applies a restrictive Content Security Policy, no-referrer policy, MIME sniffing protection, framing restrictions, and permission restrictions. `_headers` is included in the deployment output; the local server also applies the headers directly.

Limits: 30 files, 20 MB per file, 60 MB total, 300 PDF pages, 2 million extracted characters, and bounded Office ZIP expansion and spreadsheet dimensions. These reduce resource exhaustion risks but cannot guarantee that all malformed or hostile documents are harmless. Preserved PDF pages and ZIP originals are not malware sanitization.

Review dependency advisories regularly. A clean `npm audit` means no reported vulnerabilities in its database at the time of the check, not a security guarantee. SheetJS is installed from its official distribution because the public npm package is outdated.

## Deployment

### GitHub Pages

The repository includes `.github/workflows/pages.yml`. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. Pushing to `main` then installs locked dependencies, builds, tests, and publishes the contents of `dist/` automatically.

Do not select **Deploy from a branch → / (root)**: the repository root contains source files, and `app.js` and the PDF worker are produced only by the build. Publishing source directly gives a page that looks correct but cannot process documents.

Assets use relative URLs, so the same build works at `https://joaopedroparreira.github.io/Merge/` and at the private test site's root. Theme preferences are kept locally and separately for each origin. GitHub Pages uses the CSP and referrer metadata in the HTML; it does not apply the additional `_headers` configuration used by the test host.

### Private test site

`.openai/hosting.json` identifies the private Sites deployment. The production output is `dist/`; document processing remains local to each visitor. The bundled Noto Sans font supports Portuguese PDF text and includes its license under `public/assets/`.
