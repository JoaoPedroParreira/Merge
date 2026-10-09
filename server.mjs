import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const securityHeaders = {
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': 'no-store'
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

export function createSiteServer(directory = path.resolve('dist'), { basePath = '' } = {}) {
    return createServer(async (request, response) => {
        for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
        try {
            const url = new URL(request.url, 'http://localhost');
            let pathname = decodeURIComponent(url.pathname);
            if (basePath) {
                if (pathname !== basePath && !pathname.startsWith(basePath + '/')) { response.writeHead(404); response.end(); return; }
                pathname = pathname.slice(basePath.length) || '/';
            }
            const target = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
            const relative = path.relative(directory, target);
            if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part.startsWith('.') || part === '_headers')) {
                response.writeHead(403); response.end(); return;
            }
            if (!(await stat(target)).isFile()) { response.writeHead(404); response.end(); return; }
            const bytes = await readFile(target);
            response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Content-Length': bytes.length });
            response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch { response.writeHead(404); response.end(); }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const server = createSiteServer();
    server.listen(Number(process.env.MERGE_PORT || 4173), '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${server.address().port}`));
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
