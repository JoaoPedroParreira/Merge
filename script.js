import { diffLines } from 'diff';
import { LIMITS, extension, validateFiles, boundedText, safeFilename, readDocument, mergePdfs, zipFiles, exportDocx, exportPdf, exportSpreadsheet, exportJson } from './document-tools.js';

export function initApp(document, { readPdf, loadFont, save = saveDownload, clipboard = globalThis.navigator?.clipboard } = {}) {
    const el = id => document.getElementById(id);
    const modeButtons = [...document.querySelectorAll('.mode-btn')];
    let files = [], mode = 'merge', busy = false, result = null;
    const tools = {
        merge: ['Make many files one.', 'Arrange your documents in the order you want to merge them.', 'Merge files', 'Files to merge'],
        compare: ['See what changed.', 'Choose two documents to compare their text, line by line.', 'Compare files', 'Files to compare'],
        convert: ['A fresh format.', 'Choose one file and an output format. Text conversions remove styling.', 'Convert file', 'File to convert'],
        edit: ['Make it your own.', 'Edit extracted text and choose a format to save your changes.', 'Load for editing', 'File to edit'],
        compress: ['Everything in one ZIP.', 'Bundle your original files into a downloadable ZIP archive.', 'Create ZIP', 'Files to archive']
    };
    function notify(message, error = false) {
        el('status-message').textContent = message;
        el('status-message').classList.remove('hidden');
        el('status-message').classList.toggle('error', error);
    }
    function invalidate() { result = null; el('result-container').classList.add('hidden'); }
    function setMode(next) {
        if (busy || !tools[next]) return;
        mode = next; invalidate();
        el('output-text').value = ''; el('diff-output').replaceChildren();
        el('tool-title').textContent = tools[mode][0]; el('tool-description').textContent = tools[mode][1];
        el('status-message').classList.add('hidden');
        el('file-input').multiple = !['convert', 'edit'].includes(mode);
        el('merge-options').classList.toggle('hidden', ['compare', 'compress'].includes(mode));
        el('output-text').classList.toggle('hidden', mode === 'compare');
        el('diff-output').classList.toggle('hidden', mode !== 'compare');
        el('output-text').readOnly = mode !== 'edit';
        if (mode === 'compare') el('extension-select').value = '.txt';
        update();
    }
    function update() {
        el('file-list-container').classList.toggle('hidden', files.length === 0);
        el('controls-container').classList.toggle('hidden', files.length === 0);
        el('files-list-title').textContent = `${tools[mode][3]} (${files.length})`;
        const required = mode === 'compare' ? 2 : ['convert', 'edit'].includes(mode) ? 1 : null;
        const valid = files.length > 0 && (!required || files.length === required);
        el('action-btn').disabled = busy || !valid;
        el('action-btn').textContent = busy ? 'Processing…' : required && files.length !== required ? `Choose exactly ${required} file${required === 1 ? '' : 's'}` : tools[mode][2];
        for (const button of modeButtons) {
            button.disabled = busy;
            button.classList.toggle('active', button.dataset.mode === mode);
            button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
        }
        for (const id of ['file-input', 'clear-btn', 'extension-select', 'filename-input', 'download-btn', 'output-text']) el(id).disabled = busy;
        el('copy-btn').disabled = busy || !result || result.kind === 'pdf';
        el('file-list').replaceChildren();
        files.forEach((file, index) => {
            const li = document.createElement('li'); li.className = 'file-item';
            const info = document.createElement('div'); info.className = 'file-info';
            const icon = document.createElement('span'); icon.className = 'file-icon'; icon.textContent = extension(file).toUpperCase();
            const name = document.createElement('span'); name.className = 'file-name'; name.textContent = file.name; name.title = file.name;
            const size = document.createElement('span'); size.className = 'file-size'; size.textContent = file.size < 1024 ** 2 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 ** 2).toFixed(1)} MB`;
            info.append(icon, name, size);
            const actions = document.createElement('div'); actions.className = 'file-actions';
            for (const [label, symbol, unavailable, action] of [
                ['Move up', '↑', index === 0, () => { [files[index - 1], files[index]] = [files[index], files[index - 1]]; }],
                ['Move down', '↓', index === files.length - 1, () => { [files[index + 1], files[index]] = [files[index], files[index + 1]]; }],
                ['Remove file', '×', false, () => files.splice(index, 1)]
            ]) {
                const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-btn';
                button.textContent = symbol; button.setAttribute('aria-label', `${label}: ${file.name}`); button.disabled = busy || unavailable;
                button.addEventListener('click', () => { if (busy || unavailable) return; action(); invalidate(); update(); });
                actions.append(button);
            }
            li.append(info, actions); el('file-list').append(li);
        });
    }
    function addFiles(incoming) {
        if (busy) return;
        try {
            const added = Array.from(incoming);
            if (!added.length) return;
            validateFiles([...files, ...added]);
            files = [...files, ...added]; invalidate();
            el('status-message').classList.add('hidden');
            if (['merge', 'convert', 'edit'].includes(mode) && files.every(file => extension(file) === extension(files[0]))) {
                el('extension-select').value = extension(files[0]) === 'xls' ? '.xlsx' : `.${extension(files[0])}`;
            }
            update();
        } catch (error) { notify(error.message, true); }
    }
    async function run() {
        if (busy || el('action-btn').disabled) return;
        busy = true; invalidate(); update();
        try {
            validateFiles(files);
            if (mode === 'compress') {
                await save(new Blob([await zipFiles(files)], { type: 'application/zip' }), 'documents.zip');
                notify('Your ZIP archive is ready.'); return;
            }
            if (mode === 'merge' && el('extension-select').value === '.pdf' && files.every(file => extension(file) === 'pdf')) {
                const merged = await mergePdfs(files);
                result = { kind: 'pdf', bytes: merged.bytes };
                el('output-text').value = `${files.length} PDFs merged into ${merged.pages} pages.\nOriginal page layouts are preserved. Download your PDF below.`;
                el('word-count').textContent = `${merged.pages} pages`; el('char-count').textContent = `${files.length} files`;
            } else {
                const sources = [];
                let total = 0;
                for (const file of files) {
                    const text = await readDocument(file, { readPdf, Parser: document.defaultView.DOMParser });
                    total += text.length;
                    if (total > LIMITS.chars) throw new Error('The combined extracted text exceeds 2 million characters.');
                    sources.push({ name: file.name, text });
                }
                const text = mode === 'merge' ? sources.map(source => source.text).join('\n\n---\n\n') : sources[0].text;
                boundedText(text);
                result = { kind: 'text', sources };
                if (mode === 'compare') {
                    if (total > 500000) throw new Error('Comparison is limited to 500,000 characters in total.');
                    const diff = diffLines(sources[0].text, sources[1].text, { timeout: 1500, maxEditLength: 20000 });
                    if (!diff) throw new Error('These files are too different for a quick comparison. Try smaller files.');
                    el('diff-output').replaceChildren();
                    for (const part of diff) {
                        const span = document.createElement('span');
                        span.className = part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-common';
                        span.textContent = part.value; el('diff-output').append(span);
                    }
                    stats(sources.map(source => source.text).join('\n'));
                } else { el('output-text').value = text; stats(text); }
            }
            el('result-container').classList.remove('hidden');
            notify(mode === 'compare' ? 'Green marks additions; red marks removals.' : 'Your result is ready.');
            el('result-container').scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            if (mode === 'edit') el('output-text').focus();
        } catch (error) { invalidate(); notify(`Could not process files: ${error.message}`, true); }
        finally { busy = false; update(); }
    }
    function stats(text) {
        el('word-count').textContent = `${(text.trim() ? text.trim().split(/\s+/).length : 0).toLocaleString()} words`;
        el('char-count').textContent = `${text.length.toLocaleString()} chars`;
    }
    async function download() {
        if (busy || !result) return;
        busy = true; update();
        try {
            const ext = mode === 'compare' ? '.txt' : el('extension-select').value;
            const base = safeFilename(el('filename-input').value.trim().replace(/\.(txt|md|pdf|docx|json|xlsx)$/i, ''));
            const text = mode === 'compare' ? el('diff-output').textContent : el('output-text').value;
            boundedText(text);
            let bytes, mime;
            if (result.kind === 'pdf') { bytes = result.bytes; mime = 'application/pdf'; }
            else if (ext === '.pdf') { bytes = exportPdf(text, await loadFont()); mime = 'application/pdf'; }
            else if (ext === '.docx') { bytes = await exportDocx(text); mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
            else if (ext === '.xlsx') { bytes = await exportSpreadsheet(text, mode === 'edit' ? [] : files); mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; }
            else if (ext === '.json') { bytes = exportJson(text, mode === 'merge' ? result.sources : []); mime = 'application/json'; }
            else { bytes = text; mime = 'text/plain;charset=utf-8'; }
            await save(new Blob([bytes], { type: mime }), base + ext);
            notify('Your download is ready.');
        } catch (error) { notify(`Could not download: ${error.message}`, true); }
        finally { busy = false; update(); }
    }
    async function copy() {
        if (!result || busy || result.kind === 'pdf') return;
        try {
            if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
            await clipboard.writeText(mode === 'compare' ? el('diff-output').textContent : el('output-text').value);
            notify('Copied to your clipboard.');
        } catch { notify('Could not copy. Select the result text and copy it manually.', true); }
    }
    for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode));
    el('file-input').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
    el('drop-zone').addEventListener('dragover', event => { event.preventDefault(); if (!busy) el('drop-zone').classList.add('drag-over'); });
    el('drop-zone').addEventListener('dragleave', () => el('drop-zone').classList.remove('drag-over'));
    el('drop-zone').addEventListener('drop', event => { event.preventDefault(); el('drop-zone').classList.remove('drag-over'); addFiles(event.dataTransfer.files); });
    el('clear-btn').addEventListener('click', () => { if (busy) return; files = []; invalidate(); el('output-text').value = ''; el('diff-output').replaceChildren(); el('status-message').classList.add('hidden'); update(); });
    el('action-btn').addEventListener('click', run);
    el('download-btn').addEventListener('click', download);
    el('copy-btn').addEventListener('click', copy);
    el('output-text').addEventListener('input', () => stats(el('output-text').value));
    el('extension-select').addEventListener('change', () => { invalidate(); notify('Output format changed. Process your files again to prepare the new result.'); update(); });
    setMode('merge');
    return { addFiles, run, download, copy, setMode, getState: () => ({ files: [...files], mode, busy, result }) };
}

function saveDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
