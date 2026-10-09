import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export const LIMITS = Object.freeze({ files: 30, fileBytes: 20 * 1024 ** 2, totalBytes: 60 * 1024 ** 2, expandedBytes: 100 * 1024 ** 2, zipEntries: 2000, pages: 300, chars: 2_000_000, rows: 10000, cells: 250000 });
export const formats = new Set(['txt', 'md', 'pdf', 'docx', 'json', 'xlsx', 'xls']);
export const extension = file => file.name.toLowerCase().split('.').pop();

export function validateFiles(files) {
    if (files.length > LIMITS.files) throw new Error('Choose up to 30 files.');
    let total = 0;
    for (const file of files) {
        if (!formats.has(extension(file))) throw new Error(`Unsupported file: ${file.name}`);
        if (!file.size) throw new Error(`This file is empty: ${file.name}`);
        if (file.size > LIMITS.fileBytes) throw new Error(`The limit is 20 MB per file: ${file.name}`);
        total += file.size;
    }
    if (total > LIMITS.totalBytes) throw new Error('The total file limit is 60 MB.');
}

export function boundedText(text) {
    if (text.length > LIMITS.chars) throw new Error('The extracted text is too large (limit: 2 million characters).');
    return text;
}

export function safeFilename(name, fallback = 'result') {
    return (name || fallback).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 150) || fallback;
}

export async function inspectOfficeZip(bytes) {
    const zip = await JSZip.loadAsync(bytes, { createFolders: false });
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    if (entries.length > LIMITS.zipEntries) throw new Error('This document contains too many archive entries.');
    let expanded = 0;
    for (const entry of entries) {
        const size = entry._data?.uncompressedSize;
        const compressed = entry._data?.compressedSize;
        if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid archive size.');
        expanded += size;
        if (size > LIMITS.fileBytes || expanded > LIMITS.expandedBytes || size > Math.max(compressed, 1) * 200) {
            throw new Error('This document expands beyond the safety limits.');
        }
    }
    return zip;
}

export async function extractDocx(bytes, Parser = globalThis.DOMParser) {
    const zip = await inspectOfficeZip(bytes);
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('Invalid DOCX: the document body is missing.');
    const xml = await entry.async('string');
    boundedText(xml);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML declarations are not supported.');
    const document = new Parser().parseFromString(xml, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid DOCX XML.');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs = Array.from(document.getElementsByTagNameNS(ns, 'p'));
    const text = paragraphs.map(paragraph => {
        let value = '';
        for (const node of paragraph.getElementsByTagNameNS(ns, '*')) {
            if (node.localName === 't') value += node.textContent;
            else if (node.localName === 'tab') value += '\t';
            else if (node.localName === 'br' || node.localName === 'cr') value += '\n';
        }
        return value;
    }).join('\n');
    return boundedText(text);
}

export async function readSpreadsheet(file) {
    const bytes = await file.arrayBuffer();
    if (extension(file) === 'xlsx') await inspectOfficeZip(bytes);
    const workbook = XLSX.read(bytes, { type: 'array', sheetRows: LIMITS.rows + 1, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
    if (workbook.SheetNames.length > 100) throw new Error('The workbook has too many sheets.');
    let cells = 0;
    return workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const ref = sheet['!fullref'] || sheet['!ref'];
        if (ref) {
            const range = XLSX.utils.decode_range(ref);
            if (range.e.r >= LIMITS.rows || range.e.c >= 1000) throw new Error('The spreadsheet exceeds the row or column limit.');
            cells += (range.e.r + 1) * (range.e.c + 1);
            if (cells > LIMITS.cells) throw new Error('The spreadsheet exceeds the cell limit.');
        }
        return { name, rows: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: true }) };
    });
}

export async function readDocument(file, { readPdf, Parser } = {}) {
    const ext = extension(file);
    if (ext === 'pdf') return boundedText(await readPdf(file));
    if (ext === 'docx') return extractDocx(await file.arrayBuffer(), Parser);
    if (ext === 'xlsx' || ext === 'xls') {
        const sheets = await readSpreadsheet(file);
        return boundedText(sheets.map(sheet => `# ${sheet.name}\n${XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(sheet.rows))}`).join('\n\n'));
    }
    const text = boundedText(await file.text());
    if (ext === 'json') {
        try { return boundedText(JSON.stringify(JSON.parse(text), null, 2)); }
        catch { throw new Error(`Invalid JSON: ${file.name}`); }
    }
    return text;
}

export async function mergePdfs(files) {
    const merged = await PDFDocument.create();
    for (const file of files) {
        const source = await PDFDocument.load(await file.arrayBuffer());
        if (merged.getPageCount() + source.getPageCount() > LIMITS.pages) throw new Error('The PDF limit is 300 pages in total.');
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach(page => merged.addPage(page));
    }
    return { bytes: await merged.save(), pages: merged.getPageCount() };
}

export async function zipFiles(files) {
    validateFiles(files);
    const zip = new JSZip();
    for (const file of files) {
        const base = safeFilename(file.name);
        let name = base;
        let n = 2;
        while (zip.file(name)) {
            const dot = base.lastIndexOf('.');
            name = dot > 0 ? `${base.slice(0, dot)} (${n++})${base.slice(dot)}` : `${base} (${n++})`;
        }
        zip.file(name, await file.arrayBuffer());
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function exportDocx(text) {
    boundedText(text);
    const document = new Document({ sections: [{ children: text.split('\n').map(line => new Paragraph({ children: [new TextRun(line)] })) }] });
    return Packer.toArrayBuffer(document);
}

export function exportPdf(text, fontBytes) {
    boundedText(text);
    if (!text.trim()) throw new Error('There is no text to export.');
    const pdf = new jsPDF();
    if (fontBytes) {
        pdf.addFileToVFS('NotoSans.ttf', fontBytes);
        pdf.addFont('NotoSans.ttf', 'NotoSans', 'normal');
        pdf.setFont('NotoSans');
    }
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(text, 180);
    let y = 17;
    for (const line of lines) {
        if (y > 280) {
            if (pdf.getNumberOfPages() >= LIMITS.pages) throw new Error('The output PDF exceeds 300 pages.');
            pdf.addPage(); y = 17;
        }
        pdf.text(line, 15, y); y += 6;
    }
    return pdf.output('arraybuffer');
}

export async function exportSpreadsheet(text, files = []) {
    const workbook = XLSX.utils.book_new();
    if (files.length && files.every(file => ['xlsx', 'xls'].includes(extension(file)))) {
        for (const file of files) {
            for (const sheet of await readSpreadsheet(file)) {
                const base = `${files.length > 1 ? file.name.replace(/\.[^.]+$/, '') + ' ' : ''}${sheet.name}`.replace(/[\\/?*\[\]:]/g, '_').slice(0, 31) || 'Sheet';
                let name = base;
                let n = 2;
                while (workbook.SheetNames.includes(name)) name = `${base.slice(0, 26)} (${n++})`;
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), name);
            }
        }
    } else {
        boundedText(text);
        const rows = text.split('\n').map(line => [line]);
        if (rows.length > LIMITS.rows) throw new Error('The output spreadsheet exceeds 10,000 rows.');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Result');
    }
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

export function exportJson(text, sources = []) {
    const parse = value => { try { return JSON.parse(value); } catch { return value; } };
    const data = sources.length ? sources.map(source => ({ name: source.name, content: parse(source.text) })) : parse(text);
    return JSON.stringify(typeof data === 'string' ? { content: data } : data, null, 2);
}
