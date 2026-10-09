import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

await mkdir('dist/assets', { recursive: true });
await build({ entryPoints: ['browser.js'], outdir: 'dist', entryNames: 'app', bundle: true, format: 'esm', platform: 'browser', target: ['chrome120', 'firefox128', 'safari17.4'], minify: true, legalComments: 'eof', metafile: false });
await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'dist/pdf.worker.min.mjs');
await copyFile('style.css', 'dist/style.css');
await copyFile('theme.js', 'dist/theme.js');
await copyFile('index.html', 'dist/index.html');
await copyFile('public/_headers', 'dist/_headers');
await copyFile('public/favicon.svg', 'dist/favicon.svg');
for (const name of await readdir('public/assets')) await copyFile(path.join('public/assets', name), path.join('dist/assets', name));
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile('dist/dependency-versions.json', JSON.stringify(manifest.dependencies, null, 2));
console.log('Built self-contained site in dist/');
