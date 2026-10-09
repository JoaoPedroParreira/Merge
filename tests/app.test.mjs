import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { File } from 'node:buffer';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { initApp } from '../script.js';

const html = await readFile('index.html', 'utf8');
function setup(options = {}) {
    const dom = new JSDOM(html, { url: 'https://example.test', runScripts: 'outside-only' });
    const document = dom.window.document;
    const downloads = [];
    const app = initApp(document, { save: async (blob, name) => downloads.push({ blob, name }), loadFont: async () => undefined, readPdf: async () => 'PDF text', ...options });
    return { app, document, downloads, el: id => document.getElementById(id) };
}
const file = (name, text) => new File([text], name);

test('merge, reorder, download, remove and clear use real DOM events safely', async () => {
    const { app, el, document, downloads } = setup();
    assert.equal(el('action-btn').disabled, true);
    app.addFiles([file('<img src=x onerror=bad>.txt', '<script>alert(1)</script>'), file('two.txt', 'second')]);
    assert.equal(document.querySelectorAll('#file-list img').length, 0);
    assert.equal(document.querySelector('.file-name').textContent, '<img src=x onerror=bad>.txt');
    await app.run();
    assert.equal(el('output-text').value, '<script>alert(1)</script>\n\n---\n\nsecond');
    el('filename-input').value = '../unsafe'; await app.download();
    assert.equal(downloads[0].name, '.._unsafe.txt');
    assert.equal(await downloads[0].blob.text(), el('output-text').value);
    document.querySelectorAll('#file-list .file-actions')[1].querySelector('button').click();
    assert.equal(app.getState().files[0].name, 'two.txt');
    assert(el('result-container').classList.contains('hidden'));
    await app.run(); assert(el('output-text').value.startsWith('second'));
    el('clear-btn').click(); assert.equal(app.getState().files.length, 0); assert(el('action-btn').disabled);
});

test('compare renders escaped diff text, selects text downloads, and requires two files', async () => {
    const { app, el, document, downloads } = setup();
    app.setMode('compare'); app.addFiles([file('one.md', 'old\n')]); assert(el('action-btn').disabled);
    app.addFiles([file('two.md', '<img onerror=bad>\n')]); await app.run();
    assert(document.querySelector('.diff-removed')); assert(document.querySelector('.diff-added'));
    assert.equal(document.querySelectorAll('#diff-output img').length, 0);
    await app.download(); assert(downloads[0].name.endsWith('.txt'));
});

test('edited content, rather than the original file, is downloaded as JSON', async () => {
    const { app, el, downloads } = setup();
    app.setMode('edit'); app.addFiles([file('one.json', '{"old":true}')]); await app.run();
    assert.equal(el('output-text').readOnly, false);
    el('output-text').value = '{"new":true}'; el('output-text').dispatchEvent(new (el('output-text').ownerDocument.defaultView.Event)('input'));
    await app.download(); assert.deepEqual(JSON.parse(await downloads[0].blob.text()), { new: true });
});

test('format changes invalidate results and require processing again', async () => {
    const { app, el } = setup();
    app.addFiles([file('one.txt', 'hello')]); await app.run();
    el('extension-select').value = '.json'; el('extension-select').dispatchEvent(new (el('extension-select').ownerDocument.defaultView.Event)('change'));
    assert.equal(app.getState().result, null); assert(el('result-container').classList.contains('hidden'));
    await app.run(); assert(app.getState().result);
});

test('busy state prevents changing files, modes or output while processing', async () => {
    let release;
    const delayed = new Promise(resolve => release = resolve);
    const { app, el } = setup({ readPdf: () => delayed });
    app.setMode('convert'); app.addFiles([file('one.pdf', 'fake')]);
    const running = app.run(); assert(app.getState().busy); assert(el('mode-edit').disabled); assert(el('file-input').disabled);
    app.addFiles([file('two.txt', 'x')]); app.setMode('edit'); el('clear-btn').click();
    assert.equal(app.getState().mode, 'convert'); assert.equal(app.getState().files.length, 1);
    release('ready'); await running;
    assert.equal(app.getState().busy, false); assert.equal(el('output-text').value, 'ready');
});

test('parse failures restore controls and prevent downloads', async () => {
    const { app, el, downloads } = setup();
    app.addFiles([file('bad.json', '{bad}')]); await app.run();
    assert(el('status-message').classList.contains('error')); assert.equal(app.getState().result, null);
    assert.equal(el('action-btn').disabled, false); await app.download(); assert.equal(downloads.length, 0);
});

test('ZIP action downloads an actual archive with all originals', async () => {
    const { app, downloads } = setup();
    app.setMode('compress'); app.addFiles([file('one.txt', 'first'), file('two.txt', 'second')]); await app.run();
    const zip = await JSZip.loadAsync(await downloads[0].blob.arrayBuffer());
    assert.equal(await zip.file('two.txt').async('string'), 'second'); assert.equal(downloads[0].name, 'documents.zip');
});

test('PDF merge UI downloads preserved pages instead of text', async () => {
    const { app, el, downloads } = setup();
    const pdf = await PDFDocument.create(); pdf.addPage([300, 400]); const bytes = await pdf.save();
    app.addFiles([new File([bytes], 'one.pdf'), new File([bytes], 'two.pdf')]); await app.run();
    assert.equal(app.getState().result.kind, 'pdf'); assert.equal(el('copy-btn').disabled, true);
    await app.download(); const result = await PDFDocument.load(await downloads[0].blob.arrayBuffer());
    assert.equal(result.getPageCount(), 2); assert(downloads[0].name.endsWith('.pdf'));
});

test('clipboard errors give a usable fallback and unsupported files leave current files intact', async () => {
    const { app, el } = setup({ clipboard: undefined });
    app.addFiles([file('one.txt', 'hello')]); await app.run(); await app.copy();
    assert.match(el('status-message').textContent, /copy it manually/);
    app.addFiles([file('malware.exe', 'no')]); assert.equal(app.getState().files.length, 1); assert(el('status-message').classList.contains('error'));
});
