import { initApp } from './script.js';
import { readPdf } from './pdf-reader.js';

let font;
async function loadFont() {
    if (!font) {
        const response = await fetch(new URL('./assets/NotoSans-Regular.ttf', import.meta.url));
        if (!response.ok) throw new Error('The PDF font could not be loaded. Please try again.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        font = btoa(binary);
    }
    return font;
}

initApp(document, { readPdf, loadFont });
