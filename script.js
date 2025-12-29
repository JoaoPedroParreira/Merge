document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileListContainer = document.getElementById('file-list-container');
    const controlsContainer = document.getElementById('controls-container');
    const fileList = document.getElementById('file-list');
    const actionBtn = document.getElementById('action-btn');
    const clearBtn = document.getElementById('clear-btn');
    const resultContainer = document.getElementById('result-container');
    const outputText = document.getElementById('output-text');
    const diffOutput = document.getElementById('diff-output');
    const copyBtn = document.getElementById('copy-btn');
    const downloadBtn = document.getElementById('download-btn');
    const filenameInput = document.getElementById('filename-input');
    const extensionSelect = document.getElementById('extension-select');
    const wordCountSpan = document.getElementById('word-count');
    const charCountSpan = document.getElementById('char-count');

    // Mode Switcher Elements
    const modeBtns = document.querySelectorAll('.mode-btn');
    const filesListTitle = document.getElementById('files-list-title');
    const mergeOptions = document.getElementById('merge-options');

    let files = [];
    let currentMode = 'merge'; // merge, compare, convert, edit, compress

    // Mode Switching Logic
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const newMode = btn.getAttribute('data-mode');
            if (newMode) setMode(newMode);
        });
    });

    function setMode(mode) {
        currentMode = mode;
        resultContainer.classList.add('hidden');
        outputText.value = '';
        if (diffOutput) diffOutput.innerHTML = '';

        // Update Buttons
        modeBtns.forEach(btn => {
            if (btn.getAttribute('data-mode') === mode) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Update UI Text & Visibility
        outputText.classList.remove('hidden');
        if (diffOutput) diffOutput.classList.add('hidden');
        mergeOptions.classList.remove('hidden');
        outputText.readOnly = true;

        if (mode === 'merge') {
            actionBtn.textContent = 'Merge Files';
            filesListTitle.textContent = 'Files to Merge';
        } else if (mode === 'compare') {
            actionBtn.textContent = 'Compare Files';
            filesListTitle.textContent = 'Files to Compare (Select 2)';
            mergeOptions.classList.add('hidden');
            outputText.classList.add('hidden');
            if (diffOutput) diffOutput.classList.remove('hidden');
        } else if (mode === 'convert') {
            actionBtn.textContent = 'Convert File';
            filesListTitle.textContent = 'File to Convert (Select 1)';
        } else if (mode === 'edit') {
            actionBtn.textContent = 'Load for Editing';
            filesListTitle.textContent = 'File to Edit (Select 1)';
            mergeOptions.classList.add('hidden');
            outputText.readOnly = false;
        } else if (mode === 'compress') {
            actionBtn.textContent = 'Compress Files';
            filesListTitle.textContent = 'Files to Compress';
            mergeOptions.classList.add('hidden');
        }

        updateUI();
    }

    // Drag and Drop Events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    // File Input Change
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = '';
    });

    function handleFiles(fileListItems) {
        let newFiles = Array.from(fileListItems).filter(file => {
            const ext = file.name.toLowerCase().split('.').pop();
            return ['txt', 'md', 'pdf', 'docx', 'json', 'xlsx', 'xls'].includes(ext);
        });

        if (newFiles.length === 0 && fileListItems.length > 0) {
            alert('Supported formats: .txt, .md, .pdf, .docx, .json, .xlsx');
            return;
        }

        // For Convert/Edit, usually 1 file. If multiple dropped, valid but maybe confusing. 
        // We'll accept all but UI validation handles enabling button.

        files = [...files, ...newFiles];

        // Auto-detect output extension
        if (currentMode === 'merge' || currentMode === 'convert') {
            detectOutputExtension();
        }

        updateUI();
    }

    function detectOutputExtension() {
        if (files.length === 0) return;
        const firstExt = files[0].name.toLowerCase().split('.').pop();
        const allSame = files.every(f => f.name.toLowerCase().split('.').pop() === firstExt);

        if (allSame) {
            let targetVal = '.' + firstExt;
            // Handle xlsx/json
            if (firstExt === 'xlsx' || firstExt === 'xls') targetVal = '.xlsx';

            const options = Array.from(extensionSelect.options).map(opt => opt.value);
            if (options.includes(targetVal)) {
                extensionSelect.value = targetVal;
            }
        }
    }

    window.removeFile = (index) => {
        files.splice(index, 1);
        detectOutputExtension();
        updateUI();
    };

    window.moveUp = (index) => {
        if (index > 0) {
            [files[index - 1], files[index]] = [files[index], files[index - 1]];
            updateUI();
        }
    };

    window.moveDown = (index) => {
        if (index < files.length - 1) {
            [files[index + 1], files[index]] = [files[index], files[index + 1]];
            updateUI();
        }
    };

    function updateUI() {
        if (files.length > 0) {
            fileListContainer.classList.remove('hidden');
            controlsContainer.classList.remove('hidden');

            let isValid = true;
            let msg = '';

            if (currentMode === 'compare') {
                if (files.length !== 2) {
                    isValid = false;
                    msg = `Select exactly 2 files (${files.length})`;
                } else {
                    msg = 'Compare Files';
                }
            } else if (currentMode === 'convert' || currentMode === 'edit') {
                if (files.length !== 1) {
                    isValid = false;
                    msg = `Select exactly 1 file (${files.length})`;
                } else {
                    msg = currentMode === 'convert' ? 'Convert File' : 'Load for Editing';
                }
            } else if (currentMode === 'merge') {
                msg = 'Merge Files';
            } else if (currentMode === 'compress') {
                msg = 'Compress Files';
            }

            actionBtn.disabled = !isValid;
            actionBtn.textContent = msg;

        } else {
            fileListContainer.classList.add('hidden');
            controlsContainer.classList.add('hidden');
            actionBtn.disabled = true;
            resultContainer.classList.add('hidden');
        }

        fileList.innerHTML = '';
        files.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = 'file-item';
            const isFirst = index === 0;
            const isLast = index === files.length - 1;

            li.innerHTML = `
                <div class="file-info">
                    <span class="file-icon">📄</span>
                    <span class="file-name" title="${file.name}">${file.name}</span>
                </div>
                <div class="file-actions">
                    <button class="icon-btn" onclick="moveUp(${index})" ${isFirst ? 'disabled' : ''} aria-label="Move up">↑</button>
                    <button class="icon-btn" onclick="moveDown(${index})" ${isLast ? 'disabled' : ''} aria-label="Move down">↓</button>
                    <button class="icon-btn remove-btn" onclick="removeFile(${index})" aria-label="Remove file">×</button>
                </div>
            `;
            fileList.appendChild(li);
        });
    }

    clearBtn.addEventListener('click', () => {
        files = [];
        detectOutputExtension();
        updateUI();
    });

    actionBtn.addEventListener('click', async () => {
        if (files.length === 0) return;
        if (actionBtn.disabled) return;

        actionBtn.disabled = true;
        const originalText = actionBtn.textContent;
        actionBtn.textContent = 'Processing...';

        try {
            if (currentMode === 'compress') {
                await handleCompress(files);
                return;
            }

            const contents = await Promise.all(files.map(readFileContent));

            if (currentMode === 'merge') {
                const mergedContent = contents.join('\n\n---\n\n');
                outputText.value = mergedContent;
                updateStats(mergedContent);
            } else if (currentMode === 'compare') {
                if (contents.length >= 2) {
                    const diff = Diff.diffLines(contents[0], contents[1]);
                    displayDiff(diff);
                    updateStats(contents.join(''));
                }
            } else if (currentMode === 'convert' || currentMode === 'edit') {
                outputText.value = contents[0];
                updateStats(contents[0]);
                if (currentMode === 'edit') setTimeout(() => outputText.focus(), 100);
            }

            resultContainer.classList.remove('hidden');
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (error) {
            console.error(error);
            alert('Error processing files: ' + error.message);
        } finally {
            if (currentMode !== 'compress') {
                actionBtn.textContent = originalText;
                actionBtn.disabled = false;
                updateUI();
            } else {
                setTimeout(() => {
                    actionBtn.textContent = originalText;
                    actionBtn.disabled = false;
                }, 1000);
            }
        }
    });

    async function handleCompress(filesToCompress) {
        const zip = new JSZip();
        for (const file of filesToCompress) {
            const data = await file.arrayBuffer();
            zip.file(file.name, data);
        }
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = "compressed_files.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function displayDiff(diff) {
        if (!diffOutput) return;
        diffOutput.innerHTML = '';
        const fragment = document.createDocumentFragment();
        diff.forEach((part) => {
            const span = document.createElement('span');
            if (part.added) span.className = 'diff-added';
            else if (part.removed) span.className = 'diff-removed';
            else span.className = 'diff-common';
            span.textContent = part.value;
            fragment.appendChild(span);
        });
        diffOutput.appendChild(fragment);
    }

    async function readFileContent(file) {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext === 'pdf') return readPdf(file);
        if (ext === 'docx') return readDocx(file);
        if (ext === 'json') return readJson(file);
        if (['xlsx', 'xls'].includes(ext)) return readXlsx(file);
        return readText(file);
    }

    function readText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    function readJson(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    resolve(JSON.stringify(json, null, 2));
                } catch (err) {
                    reject(new Error("Invalid JSON"));
                }
            };
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    function readXlsx(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const csv = XLSX.utils.sheet_to_csv(worksheet);
                    resolve(csv);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }

    async function readPdf(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const strings = content.items.map(item => item.str);
                text += strings.join(' ') + '\n';
            }
            return text;
        } catch (e) {
            console.error('PDF Error:', e);
            throw new Error(`Failed to read PDF: ${file.name}. Ensure it is not password protected.`);
        }
    }

    async function readDocx(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            return result.value;
        } catch (e) {
            console.error('DOCX Error:', e);
            return `[Error reading DOCX: ${file.name}]`;
        }
    }

    function updateStats(text) {
        if (!text) {
            wordCountSpan.textContent = "0 words";
            charCountSpan.textContent = "0 chars";
            return;
        }
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        wordCountSpan.textContent = `${words.toLocaleString()} words`;
        charCountSpan.textContent = `${chars.toLocaleString()} chars`;
    }

    copyBtn.addEventListener('click', () => {
        let textToCopy = (currentMode === 'compare') ? diffOutput.textContent : outputText.value;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = originalText, 2000);
        });
    });

    downloadBtn.addEventListener('click', async () => {
        let filename = filenameInput.value.trim() || 'output';
        filename = filename.replace(/\.(txt|md|pdf|docx|json|xlsx)$/i, '');

        // For compare mode, we can download the diff text
        let content = (currentMode === 'compare') ? diffOutput.textContent : outputText.value;
        const ext = extensionSelect.value;

        if (ext === '.pdf') {
            await generateAndDownloadPdf(content, filename);
        } else if (ext === '.docx') {
            await generateAndDownloadDocx(content, filename);
        } else {
            // txt, md, json, xlsx (as text/csv renamed? or just text)
            // If user selects .xlsx for output, we could try to generate a real xlsx, 
            // but for now let's save as text file with that extension if that's what they asked
            // OR if content is CSV (from Convert Excel), maybe we should write it properly?
            // To keep it simple (Minimalist), we download the text content with the requested extension.
            downloadTextFile(content, filename, ext);
        }
    });

    function downloadTextFile(content, filename, extension) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename + extension;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function generateAndDownloadPdf(content, filename) {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.setFont("helvetica");
            doc.setFontSize(12);

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const maxLineWidth = pageWidth - (margin * 2);

            if (!content) {
                alert("No content to save!");
                return;
            }

            const splitText = doc.splitTextToSize(content, maxLineWidth);
            let y = margin;
            const lineHeight = 7;

            splitText.forEach(line => {
                if (y > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                }
                doc.text(line, margin, y);
                y += lineHeight;
            });
            doc.save(filename + '.pdf');
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("Failed to generate PDF. See console for details.");
        }
    }

    async function generateAndDownloadDocx(content, filename) {
        try {
            const { Document, Packer, Paragraph, TextRun } = window.docx;
            const lines = content.split('\n');
            const paragraphs = lines.map(line => new Paragraph({
                children: [new TextRun(line)],
            }));

            const doc = new Document({
                sections: [{ children: paragraphs }]
            });

            const blob = await Packer.toBlob(doc);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename + '.docx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert("Error generating DOCX");
        }
    }
});
