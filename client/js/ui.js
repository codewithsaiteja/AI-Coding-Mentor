// UI module — output rendering, state management, streaming
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

export function initializeUI() {
    const output      = document.getElementById('output');
    const loading     = document.getElementById('loading');
    const introPanel  = document.getElementById('introPanel');
    const copyBtn     = document.getElementById('copyBtn');
    const saveBtn     = document.getElementById('saveBtn');

    // Single source of truth — updated on every stream chunk
    let latestResult = '';

    marked.setOptions({ breaks: true, gfm: true });

    // ── Helpers ───────────────────────────────────────────
    function setResultButtons(on) {
        copyBtn.disabled = !on;
        saveBtn.disabled = !on;
    }

    function addCopyButtons() {
        output.querySelectorAll('pre').forEach(pre => {
            if (pre.querySelector('.copy-code-btn')) return;
            const btn = document.createElement('button');
            btn.className   = 'copy-code-btn';
            btn.textContent = 'Copy';
            btn.addEventListener('click', () => {
                const text = pre.querySelector('code')?.innerText ?? pre.innerText;
                navigator.clipboard.writeText(text).then(() => {
                    btn.textContent = 'Copied!';
                    setTimeout(() => (btn.textContent = 'Copy'), 2000);
                });
            });
            pre.appendChild(btn);
        });
    }

    function render() {
        try {
            output.innerHTML = marked.parse(latestResult);
            addCopyButtons();
            if (window.Prism) Prism.highlightAllUnder(output);
        } catch {
            output.textContent = latestResult;
        }
        // Auto-scroll to bottom
        const rc = output.closest('.response-container');
        if (rc) rc.scrollTop = rc.scrollHeight;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // Init state
    setResultButtons(false);

    // ── Public API ────────────────────────────────────────
    return {
        showLoading() {
            latestResult = '';
            setResultButtons(false);
            output.innerHTML = '';
            introPanel.classList.add('hidden');
            loading.classList.remove('hidden');
        },

        updateStream(chunk) {
            loading.classList.add('hidden');
            latestResult += chunk;
            render();
            if (latestResult.trim()) setResultButtons(true);
        },

        showError(message) {
            loading.classList.add('hidden');
            latestResult = '';
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
            latestResult = '';
            setResultButtons(false);
            output.innerHTML = '';
            loading.classList.add('hidden');
            introPanel.classList.remove('hidden');
        },

        // Used exclusively by Copy and Save
        getLatestResult: () => latestResult,
    };
}
