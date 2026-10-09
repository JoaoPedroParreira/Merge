import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile('index.html', 'utf8');
const script = await readFile('theme.js', 'utf8');
async function setup({ saved, systemDark = false, blocked = false } = {}) {
    const dom = new JSDOM(html, { url: 'https://example.test', runScripts: 'outside-only' });
    const { window } = dom;
    const media = { matches: systemDark, addEventListener: (_, listener) => media.changed = listener };
    window.matchMedia = () => media;
    if (saved) window.localStorage.setItem('merge.theme', saved);
    if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    const loaded = new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve));
    window.eval(script);
    await loaded;
    return { dom, window, media, root: window.document.documentElement, button: window.document.getElementById('theme-toggle') };
}

test('theme follows the system initially, and updates before a user chooses', async () => {
    const { root, media, window, dom } = await setup({ systemDark: true });
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(window.localStorage.length, 0);
    media.matches = false; media.changed(); assert.equal(root.dataset.theme, 'light');
    dom.window.close();
});

test('toggle stores only the theme in this browser and restores it on the next visit', async () => {
    const { root, window, button, media, dom } = await setup();
    button.click(); assert.equal(root.dataset.theme, 'dark');
    assert.equal(window.localStorage.getItem('merge.theme'), 'dark');
    assert.equal(window.localStorage.length, 1);
    assert.equal(window.document.cookie, '');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(button.getAttribute('aria-label'), 'Switch to light mode');
    media.matches = false; media.changed(); assert.equal(root.dataset.theme, 'dark');
    const nextVisit = await setup({ saved: window.localStorage.getItem('merge.theme') });
    assert.equal(nextVisit.root.dataset.theme, 'dark');
    nextVisit.button.click(); assert.equal(nextVisit.window.localStorage.getItem('merge.theme'), 'light');
    dom.window.close(); nextVisit.dom.window.close();
});

test('a saved light preference overrides a dark system and invalid preferences are ignored', async () => {
    const light = await setup({ saved: 'light', systemDark: true });
    assert.equal(light.root.dataset.theme, 'light');
    const invalid = await setup({ saved: '<script>alert(1)</script>', systemDark: true });
    assert.equal(invalid.root.dataset.theme, 'dark');
    light.dom.window.close(); invalid.dom.window.close();
});

test('toggle still works if browser storage is disabled', async () => {
    const { root, button, dom } = await setup({ blocked: true });
    assert.doesNotThrow(() => button.click()); assert.equal(root.dataset.theme, 'dark');
    button.click(); assert.equal(root.dataset.theme, 'light'); dom.window.close();
});

test('theme changes and clearing preferences synchronize between browser tabs', async () => {
    const { root, window, dom } = await setup();
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'merge.theme', newValue: 'dark' }));
    assert.equal(root.dataset.theme, 'dark');
    window.dispatchEvent(new window.StorageEvent('storage', { key: null, newValue: null }));
    assert.equal(root.dataset.theme, 'light'); dom.window.close();
});

test('theme script is a local early resource and has no network requests', async () => {
    assert(html.indexOf('src="theme.js"') < html.indexOf('href="style.css"'));
    assert(!/fetch\(|XMLHttpRequest|sendBeacon|https?:\/\//.test(script));
});
