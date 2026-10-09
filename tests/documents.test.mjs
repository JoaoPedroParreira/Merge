import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { File } from 'node:buffer';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { JSDOM } from 'jsdom';
import { validateFiles, LIMITS, extractDocx, mergePdfs, zipFiles, exportDocx, exportPdf, readDocument, readSpreadsheet, exportSpreadsheet, exportJson, safeFilename, inspectOfficeZip } from '../document-tools.js';
import { readPdf } from '../pdf-reader.js';

const Parser = new JSDOM().window.DOMParser;
const textFile = (name, text) => new File([text], name);

test('file limits reject unsupported, empty, excessive and oversized input', () => {
    assert.throws(() => validateFiles([textFile('file.exe', 'data')]), /Unsupported/);
    assert.throws(() => validateFiles([textFile('empty.txt', '')]), /empty/);
    assert.throws(() => validateFiles(Array.from({ length: 31 }, () => textFile('one.txt', 'data'))), /30 files/);
    assert.throws(() => validateFiles([{ name: 'huge.txt', size: LIMITS.fileBytes + 1 }]), /20 MB/);
    assert.throws(() => validateFiles(Array.from({ length: 4 }, () => ({ name: 'large.txt', size: LIMITS.fileBytes }))), /60 MB/);
    assert.equal(safeFilename('../escape\\name.txt'), '.._escape_name.txt');
});

test('DOCX export and extraction preserve accented text and paragraphs', async () => {
    const bytes = await exportDocx('Olá João, ação e coração.\nSecond paragraph');
    const text = await extractDocx(bytes, Parser);
    assert.equal(text, 'Olá João, ação e coração.\nSecond paragraph');
    assert.equal(await readDocument(new File([bytes], 'test.docx'), { Parser }), text);
});

test('DOCX refuses XML entities, corrupt documents, and archive expansion bombs', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<!DOCTYPE foo [<!ENTITY secret SYSTEM "file:///secret">]><foo/>');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await assert.rejects(() => extractDocx(bytes, Parser), /XML declarations/);
    const bomb = new JSZip(); bomb.file('word/document.xml', 'A'.repeat(1000000));
    await assert.rejects(() => inspectOfficeZip(awaitableInvalid()), /zip|ZIP/i);
    function awaitableInvalid() { return new Uint8Array([1, 2, 3]); }
    const bombBytes = await bomb.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    await assert.rejects(() => inspectOfficeZip(bombBytes), /safety limits/);
});

test('PDF generation supports Portuguese accents and extraction', async () => {
    const font = (await readFile('public/assets/NotoSans-Regular.ttf')).toString('base64');
    const bytes = exportPdf('Olá João, ação e coração.\nA second line.', font);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    const text = await readPdf(new File([bytes], 'accents.pdf'));
    assert.match(text, /Olá João, ação e coração/);
    assert.match(text, /A second line/);
});

test('PDF merge preserves order, page dimensions, and page count', async () => {
    const one = await PDFDocument.create(); one.addPage([300, 400]);
    const two = await PDFDocument.create(); two.addPage([500, 600]); two.addPage([700, 800]);
    const merged = await mergePdfs([new File([await one.save()], 'one.pdf'), new File([await two.save()], 'two.pdf')]);
    const pdf = await PDFDocument.load(merged.bytes);
    assert.equal(merged.pages, 3);
    assert.deepEqual(pdf.getPages().map(page => [page.getWidth(), page.getHeight()]), [[300, 400], [500, 600], [700, 800]]);
    const scanned = new File([await one.save()], 'scanned.pdf');
    await assert.rejects(() => readPdf(scanned), /OCR/);
});

test('ZIP contains original bytes and preserves duplicate filenames safely', async () => {
    const bytes = await zipFiles([textFile('same.txt', 'first'), textFile('same.txt', 'second'), textFile('../path.txt', 'third')]);
    const zip = await JSZip.loadAsync(bytes);
    assert.deepEqual(Object.keys(zip.files), ['same.txt', 'same (2).txt', '.._path.txt']);
    assert.equal(await zip.file('same.txt').async('string'), 'first');
    assert.equal(await zip.file('same (2).txt').async('string'), 'second');
});

function spreadsheetFile(name, value) {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['Name', 'Value'], ['João', value], ['=HYPERLINK("https://example.com")', 3]]);
    sheet.C2 = { t: 'n', v: 4, f: '2+2' }; sheet['!ref'] = 'A1:C3';
    XLSX.utils.book_append_sheet(book, sheet, 'Data');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Second sheet']]), 'Notes');
    return new File([XLSX.write(book, { bookType: 'xlsx', type: 'array' })], name);
}

test('Excel export is a real workbook, keeps all sheets and values, removes formulas', async () => {
    const one = spreadsheetFile('one.xlsx', 12), two = spreadsheetFile('two.xlsx', 34);
    const sheets = await readSpreadsheet(one);
    assert.equal(sheets.length, 2);
    assert.equal(sheets[0].rows[1][1], 12);
    const bytes = await exportSpreadsheet('', [one, two]);
    const book = XLSX.read(bytes, { type: 'array', cellFormula: true });
    assert.equal(book.SheetNames.length, 4);
    assert.equal(book.Sheets[book.SheetNames[0]].A2.v, 'João');
    assert.equal(book.Sheets[book.SheetNames[0]].C2.v, 4);
    assert.equal(book.Sheets[book.SheetNames[0]].C2.f, undefined);
    assert.equal(book.Sheets[book.SheetNames[0]].A3.t, 's');
    assert.equal(book.Sheets[book.SheetNames[0]].A3.f, undefined);
    const textBytes = await exportSpreadsheet('hello, world\n=2+2');
    const textBook = XLSX.read(textBytes, { type: 'array' });
    assert.equal(textBook.Sheets.Result.A2.v, '=2+2');
    assert.equal(textBook.Sheets.Result.A2.f, undefined);
});

test('JSON exports parse correctly and invalid source JSON is rejected', async () => {
    assert.deepEqual(JSON.parse(exportJson('{"updated":true}')), { updated: true });
    assert.deepEqual(JSON.parse(exportJson('plain text')), { content: 'plain text' });
    assert.deepEqual(JSON.parse(exportJson('', [{ name: 'one.json', text: '{"a":1}' }])), [{ name: 'one.json', content: { a: 1 } }]);
    await assert.rejects(() => readDocument(textFile('invalid.json', '{no}')), /Invalid JSON/);
});
