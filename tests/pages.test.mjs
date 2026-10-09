import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteServer } from '../server.mjs';

test('GitHub Pages subdirectory serves every referenced script and required tool asset', async () => {
    const server = createSiteServer(undefined, { basePath: '/Merge' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/Merge/`;
    try {
        const response = await fetch(base);
        assert.equal(response.status, 200);
        const html = await response.text();
        const paths = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]).filter(value => value !== './');
        for (const path of [...paths, './pdf.worker.min.mjs', './assets/NotoSans-Regular.ttf']) {
            const url = new URL(path, base);
            assert(url.pathname.startsWith('/Merge/'), `Asset escapes the repository path: ${path}`);
            const asset = await fetch(url);
            assert.equal(asset.status, 200, `Missing deployment asset: ${url.pathname}`);
            assert((await asset.arrayBuffer()).byteLength > 0);
        }
        const bundle = await readFile('dist/app.js', 'utf8');
        assert.match(bundle, /\.\/pdf\.worker\.min\.mjs/);
        assert.match(bundle, /\.\/assets\/NotoSans-Regular\.ttf/);
        await readFile('dist/.nojekyll');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
