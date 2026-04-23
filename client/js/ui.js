// UI module — output rendering, state management, streaming

// Language → file extension map
const LANG_EXT = {
    javascript:  'js',
    typescript:  'ts',
    python:      'py',
    java:        'java',
    cpp:         'cpp',
    c:           'c',
    go:          'go',
    rust:        'rs',
    bash:        'sh',
    html:        'html',
    css:         'css',
};

// Sections that get a code block treatment
const CODE_SECTION = 'Improved Code';

// All known section labels in display order
const SECTION_LABELS = [
    'Summary',
    'Issues',
    'Improved Code',
    'Complexity',
    'Suggestions',
];

/**
 * Strip markdown code fences and any leading/trailing whitespace from code.
 */
function cleanCode(raw) {
    if (!raw) return '';
    let cleaned = raw.replace(/^```[\w]*\n?/gm, '');
    cleaned = cleaned.replace(/```\s*$/gm, '');
    // Also strip any stray markdown bold/italic/heading symbols
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    return cleaned.trim();
}

/**
 * Strip all markdown symbols from plain text (for explanation sections).
 */
function stripMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/^#{1,6}\s+/gm, '')          // headings
        .replace(/\*\*(.+?)\*\*/g, '$1')       // bold
        .replace(/\*(.+?)\*/g, '$1')           // italic
        .replace(/`{1,3}[\w]*\n?/g, '')        // code fences / inline code
        .replace(/`/g, '')
        .trim();
}

/**
 * Try to parse the streamed buffer as JSON.
 * Returns { explanation, code, language } or null if not yet valid JSON.
 */
function tryParseStructured(raw) {
    const trimmed = raw.trim();
    const start = trimmed.indexOf('{');
    const end   = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
        return null;
    }
}

/**
 * Fallback: if the AI returned plain text instead of JSON,
 * wrap it into the expected shape so the section parser still works.
 */
function forceStructured(raw, language) {
    // Already valid JSON — return as-is
    const parsed = tryParseStructured(raw);
    if (parsed) return parsed;

    // Plain text fallback — treat the whole thing as the explanation
    return { explanation: raw, code: '', language: language || 'plaintext' };
}

/**
 * Parse the plain-text structured explanation into sections.
 * Returns Map<sectionLabel, content[]>
 */
function parseSections(text) {
    const sections = new Map();
    let currentLabel = null;
    let currentLines = [];

    const lines = text.split('\n');

    for (const raw of lines) {
        const line = raw.trimEnd();

        // Check if this line is a section header (e.g. "Summary:" or "Improved Code:")
        const matchedLabel = SECTION_LABELS.find(
            lbl => line.trim() === lbl + ':' || line.trim() === lbl
        );

        if (matchedLabel) {
            if (currentLabel !== null) {
                sections.set(currentLabel, currentLines);
            }
            currentLabel = matchedLabel;
            currentLines = [];
        } else if (currentLabel !== null) {
            currentLines.push(line);
        }
    }

    if (currentLabel !== null) {
        sections.set(currentLabel, currentLines);
    }

    return sections;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

/**
 * Build the HTML for the structured output.
 * Each section gets a labelled block. Code section gets a <pre>.
 */
function buildStructuredHTML(explanation, code, language, outputMode) {
    let html = '';

    if (outputMode === 'explanation' || outputMode === 'both') {
        const sections = parseSections(stripMarkdown(explanation || ''));

        for (const label of SECTION_LABELS) {
            if (!sections.has(label)) continue;
            const lines = sections.get(label);
            const body  = lines.join('\n').trim();
            if (!body) continue;

            if (label === CODE_SECTION) {
                // Render inline improved code from explanation field
                const cleanedCode = cleanCode(body);
                html += `
                    <div class="output-section">
                        <div class="output-section__label">${escapeHtml(label)}</div>
                        <div class="output-section__code-wrap">
                            <button class="copy-code-btn" data-copy="${escapeHtml(cleanedCode)}">Copy</button>
                            <pre class="output-code"><code>${escapeHtml(cleanedCode)}</code></pre>
                        </div>
                    </div>`;
            } else {
                // Render as plain text, bullet lines get bullet styling
                const linesHtml = lines
                    .filter(l => l.trim())
                    .map(l => {
                        const stripped = stripMarkdown(l.trim());
                        if (stripped.startsWith('- ')) {
                            return `<div class="output-bullet">${escapeHtml(stripped.slice(2))}</div>`;
                        }
                        return `<div class="output-line">${escapeHtml(stripped)}</div>`;
                    })
                    .join('');

                html += `
                    <div class="output-section">
                        <div class="output-section__label">${escapeHtml(label)}</div>
                        <div class="output-section__body">${linesHtml}</div>
                    </div>`;
            }
        }

        // Fallback: if no sections were parsed, render as plain text
        if (html === '' && explanation) {
            html = `<div class="output-section"><div class="output-section__body">${escapeHtml(stripMarkdown(explanation))}</div></div>`;
        }
    }

    if (outputMode === 'code' || outputMode === 'both') {
        if (code) {
            const cleanedCode = cleanCode(code);
            html += `
                <div class="output-section">
                    <div class="output-section__label">Code</div>
                    <div class="output-section__code-wrap">
                        <button class="copy-code-btn" data-copy="${escapeHtml(cleanedCode)}">Copy</button>
                        <pre class="output-code"><code>${escapeHtml(cleanedCode)}</code></pre>
                    </div>
                </div>`;
        }
    }

    return html;
}

export function initializeUI() {
    const output      = document.getElementById('output');
    const loading     = document.getElementById('loading');
    const introPanel  = document.getElementById('introPanel');
    const copyBtn     = document.getElementById('copyBtn');
    const saveBtn     = document.getElementById('saveBtn');

    // Internal state
    let rawBuffer    = '';
    let parsedResult = null;

    // ── Helpers ───────────────────────────────────────────
    function setResultButtons(on) {
        copyBtn.disabled = !on;
        saveBtn.disabled = !on;
    }

    function attachCopyButtons() {
        output.querySelectorAll('.copy-code-btn[data-copy]').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                navigator.clipboard.writeText(btn.dataset.copy).then(() => {
                    btn.textContent = 'Copied!';
                    setTimeout(() => (btn.textContent = 'Copy'), 2000);
                });
            });
        });
    }

    function renderParsed(parsed) {
        const { explanation, code, language } = parsed;
        output.innerHTML = buildStructuredHTML(explanation, code, language, currentOutputMode);
        attachCopyButtons();
        const rc = output.closest('.response-container');
        if (rc) rc.scrollTop = rc.scrollHeight;
    }

    // Current output mode — updated by main.js via setOutputMode()
    let currentOutputMode = 'explanation';

    setResultButtons(false);

    // ── Public API ────────────────────────────────────────
    return {
        setOutputMode(mode) {
            currentOutputMode = mode;
            // Re-render if we already have a result
            if (parsedResult) renderParsed(parsedResult);
        },

        showLoading() {
            rawBuffer    = '';
            parsedResult = null;
            setResultButtons(false);
            output.innerHTML = '';
            introPanel.classList.add('hidden');
            loading.classList.remove('hidden');
        },

        updateStream(buffer, isDone = false) {
            loading.classList.add('hidden');
            rawBuffer = buffer;

            // Try to parse JSON while streaming
            const parsed = tryParseStructured(buffer);
            if (parsed) {
                parsedResult = parsed;
                renderParsed(parsed);
                setResultButtons(true);
            } else if (isDone) {
                // Stream finished but no valid JSON — use fallback
                parsedResult = forceStructured(buffer, 'plaintext');
                renderParsed(parsedResult);
                setResultButtons(true);
            } else {
                // Still streaming — show a minimal progress indicator
                output.innerHTML = `<div class="stream-progress">Receiving response...</div>`;
                const rc = output.closest('.response-container');
                if (rc) rc.scrollTop = rc.scrollHeight;
            }
        },

        showError(message) {
            loading.classList.add('hidden');
            rawBuffer    = '';
            parsedResult = null;
            setResultButtons(false);
            output.innerHTML = `
                <div class="error-card">
                    <div class="error-card__icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/></svg>
                    </div>
                    <div class="error-card__body">
                        <div class="error-card__title">Error</div>
                        <div class="error-card__msg">${escapeHtml(message)}</div>
                    </div>
                </div>`;
        },

        clearOutput() {
            rawBuffer    = '';
            parsedResult = null;
            setResultButtons(false);
            output.innerHTML = '';
            loading.classList.add('hidden');
            introPanel.classList.remove('hidden');
        },

        getLatestResult() {
            if (!parsedResult) return rawBuffer;
            const mode = currentOutputMode;
            if (mode === 'explanation') return stripMarkdown(parsedResult.explanation || '');
            if (mode === 'code')        return cleanCode(parsedResult.code || '');
            return stripMarkdown(parsedResult.explanation || '') + '\n\n' + cleanCode(parsedResult.code || '');
        },

        getSaveFiles() {
            if (!parsedResult) {
                return [{ content: rawBuffer, filename: 'codesmart_output.txt', mimeType: 'text/plain' }];
            }

            const { explanation, code, language } = parsedResult;
            const ext  = LANG_EXT[language] || 'txt';
            const mode = currentOutputMode;
            const files = [];

            if (mode === 'explanation') {
                files.push({
                    content:  stripMarkdown(explanation || ''),
                    filename: 'codesmart_output.md',
                    mimeType: 'text/plain',
                });
            } else if (mode === 'code') {
                files.push({
                    content:  cleanCode(code || ''),
                    filename: `codesmart_output.${ext}`,
                    mimeType: 'text/plain',
                });
            } else {
                files.push({
                    content:  stripMarkdown(explanation || ''),
                    filename: 'codesmart_explanation.md',
                    mimeType: 'text/plain',
                });
                files.push({
                    content:  cleanCode(code || ''),
                    filename: `codesmart_code.${ext}`,
                    mimeType: 'text/plain',
                });
            }

            return files;
        },
    };
}
