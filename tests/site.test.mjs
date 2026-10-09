import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteServer } from '../server.mjs';

test('built site is self-contained with no CDN scripts or inline handlers', async () => {
    const html = await readFile('dist/index.html', 'utf8');
    assert(!/<script[^>]+src=["']https?:/i.test(html));
    assert(!/\son(?:click|load|error)=/i.test(html));
    assert.match(html, /script-src 'self'/);
    assert.match(html, /type="module" src="app.js"/);
    assert(!html.includes('fonts.googleapis.com'));
    await readFile('dist/pdf.worker.min.mjs'); await readFile('dist/assets/NotoSans-Regular.ttf');
});

test('HTTP preview serves the site with security headers and refuses writes or traversal', async () => {
    const server = createSiteServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const response = await fetch(base);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
        assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
        assert.match(await response.text(), /Your documents/);
        for (const resource of ['/app.js', '/style.css', '/pdf.worker.min.mjs', '/assets/NotoSans-Regular.ttf', '/favicon.svg']) assert.equal((await fetch(base + resource)).status, 200);
        assert.equal((await fetch(base, { method: 'POST' })).status, 405);
        assert.equal((await fetch(base + '/..%5cpackage.json')).status, 403);
        assert.equal((await fetch(base + '/.openai/hosting.json')).status, 403);
        assert.equal((await fetch(base + '/missing.txt')).status, 404);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
