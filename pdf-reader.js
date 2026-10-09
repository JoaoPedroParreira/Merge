import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { LIMITS, boundedText } from './document-tools.js';

GlobalWorkerOptions.workerSrc = new URL(typeof window === 'undefined' ? './node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs' : './pdf.worker.min.mjs', import.meta.url).href;

export async function readPdf(file) {
    const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true, disableFontFace: true, stopAtErrors: true });
    try {
        const pdf = await task.promise;
        if (pdf.numPages > LIMITS.pages) throw new Error('The PDF limit is 300 pages.');
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            for (const item of content.items) {
                if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
            }
            text += '\n';
            boundedText(text);
            page.cleanup();
        }
        if (!text.trim()) throw new Error('This PDF has no extractable text. Scanned PDFs require OCR; PDF merging still works.');
        return text;
    } finally {
        await task.destroy();
    }
}
