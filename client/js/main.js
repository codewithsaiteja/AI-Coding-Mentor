import { initializeEditor, detectLanguage, detectLevel, SUPPORTED_LANGS } from './editor.js';
import { initializeUI } from './ui.js';
import { analyzeCode } from './api.js';

const DEFAULT_LANG  = 'javascript';
const DEFAULT_LEVEL = 'beginner';

const ACTION_LABELS = {
    explain:       'EXPLAIN',
    findBugs:      'DEBUG',
    improve:       'OPTIMIZE',
    refactor:      'REFACTOR',
    bestPractices: 'COMPLEXITY',
    generateTests: 'TESTS',
};

const ACTION_NAMES = {
    explain:       'Explain',
    findBugs:      'Debug',
    improve:       'Optimize',
    refactor:      'Refactor',
    bestPractices: 'Complexity',
    generateTests: 'Tests',
    convert:       'Convert',
};

const LANG_LABELS = {
    javascript: 'JS',  typescript: 'TS',  python: 'PY',
    java: 'JAVA',      cpp: 'C++',        c: 'C',
    go: 'GO',          rust: 'RS',        bash: 'SH',
    html: 'HTML',      css: 'CSS',
};

function langLabel(lang) {
    return LANG_LABELS[lang] ?? lang.toUpperCase();
}

// ── Theme management ──────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('ai_mentor_theme') || 'dark';
    applyTheme(saved);
}

let _editorRef = null; // set after editor init so theme toggle can reach it

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ai_mentor_theme', theme);
    const icon = document.getElementById('themeIcon');
    const logoImg = document.querySelector('.logo-img');
    if (theme === 'light') {
        icon.innerHTML = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';
        if (logoImg) logoImg.src = 'assets/logo-horizontal-light.svg';
    } else {
        icon.innerHTML = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>';
        if (logoImg) logoImg.src = 'assets/logo-horizontal.svg';
    }
    if (_editorRef) _editorRef.setEditorTheme(theme);
}

initTheme();

document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ── Status indicator ──────────────────────────────────────
function setStatus(state, text) {
    const dot  = document.getElementById('statusDot');
    const txt  = document.getElementById('statusText');
    dot.className = 'status-dot ' + (state || '');
    txt.textContent = text;
}

async function init() {
    const ui     = initializeUI();
    const editor = await initializeEditor();
    _editorRef   = editor; // expose for theme switching

    const actionBadge    = document.getElementById('actionBadge');
    const langBadge      = document.getElementById('langBadge');
    const languageSelect = document.getElementById('languageSelect');
    const levelSelect    = document.getElementById('levelSelect');
    const convertBtn     = document.getElementById('convertBtn');
    const convertPopup   = document.getElementById('convertPopup');
    const convertGoBtn   = document.getElementById('convertGoBtn');
    const loadingText    = document.getElementById('loadingText');

    // ── Sync dropdown + badge to a language value ─────────
    function applyLang(lang) {
        const safe = SUPPORTED_LANGS.has(lang) ? lang : 'javascript';
        languageSelect.value  = safe;
        langBadge.textContent = langLabel(safe);
        editor.setLanguage(safe);
        console.log('Dropdown:', safe);
    }

    // ── Restore language — use detected lang from actual code ─
    const initialLang = editor.getInitialLang();
    applyLang(initialLang);
    console.log('Dropdown:', initialLang);

    // ── Override flags ────────────────────────────────────
    let langOverride  = false;
    let levelOverride = false;

    languageSelect.addEventListener('change', () => {
        langOverride = true;
        const lang = languageSelect.value;
        langBadge.textContent = langLabel(lang);
        editor.setLanguage(lang);
        console.log('Dropdown:', lang, '(manual override)');
        syncActionButtons();
    });

    levelSelect.addEventListener('change', () => { levelOverride = true; });

    // ── Button enable/disable ─────────────────────────────
    function syncActionButtons() {
        const hasCode = editor.getValue().trim().length > 0;
        document.querySelectorAll('.action-button').forEach(btn => {
            if (btn.dataset.loadingActive) return;
            btn.disabled = !hasCode;
        });
    }

    syncActionButtons();
    setStatus('', 'Ready');

    // ── Auto-detect on content change (Monaco native event) ──
    let _detectTimer = null;
    let _lastDetected = initialLang;

    editor.onChange((code) => {
        clearTimeout(_detectTimer);
        _detectTimer = setTimeout(() => {
            syncActionButtons();
            if (!code.trim()) return;

            const detected = detectLanguage(code);
            console.log('Detected:', detected);

            // Auto-reset override when the detected language clearly changed
            // (e.g. user pasted completely different code)
            if (langOverride && detected !== 'plaintext' && detected !== _lastDetected) {
                langOverride = false;
            }

            if (!langOverride) {
                _lastDetected = detected;
                if (detected !== languageSelect.value) {
                    applyLang(detected);
                }
            }

            if (!levelOverride) {
                levelSelect.value = detectLevel(code);
            }
        }, 300);
    });

    // ── Run action ────────────────────────────────────────
    let _running   = false;
    let lastAction = 'explain';
    let activeBtn  = null;

    async function runAction(action, targetLang = null) {
        if (_running) return;

        const code     = editor.getValue();
        const language = editor.getLanguage(); // single source of truth

        if (!code.trim()) {
            ui.showError('Please enter some code to analyze.');
            setStatus('error', 'No code');
            return;
        }

        _running   = true;
        lastAction = action;

        // Highlight active button
        if (activeBtn) activeBtn.classList.remove('active-action');
        activeBtn = action === 'convert'
            ? document.getElementById('convertBtn')
            : document.querySelector(`[data-action="${action}"]`);
        if (activeBtn) activeBtn.classList.add('active-action');

        const actionName = action === 'convert'
            ? `Converting → ${(targetLang || '').toUpperCase()}`
            : ACTION_NAMES[action] ?? action;

        setLoading(true, action);
        setStatus('running', `Running ${actionName}...`);
        if (loadingText) loadingText.textContent = `Running ${actionName}...`;

        actionBadge.textContent = action === 'convert'
            ? `TO ${(targetLang || '').toUpperCase()}`
            : ACTION_LABELS[action] ?? action.toUpperCase();
        actionBadge.classList.add('show');
        ui.showLoading();

        try {
            await analyzeCode(code, language, action, targetLang, chunk => ui.updateStream(chunk));
            setStatus('done', `${actionName} complete`);
        } catch (err) {
            ui.showError(err.message || 'An unexpected error occurred.');
            actionBadge.classList.remove('show');
            setStatus('error', 'Error');
        } finally {
            _running = false;
            setLoading(false, action);
            if (activeBtn) activeBtn.classList.remove('active-action');
        }
    }

    function setLoading(on, activeAction) {
        document.querySelectorAll('.action-button').forEach(btn => {
            if (on) {
                btn.disabled = true;
                btn.dataset.loadingActive = '1';
                const isActive = btn.dataset.action === activeAction
                    || (btn.id === 'convertBtn' && activeAction === 'convert');
                if (isActive) {
                    btn.dataset.orig = btn.querySelector('.btn-label')?.textContent ?? btn.textContent;
                    const lbl = btn.querySelector('.btn-label');
                    if (lbl) lbl.textContent = '...';
                    else btn.textContent = '...';
                }
            } else {
                delete btn.dataset.loadingActive;
                if (btn.dataset.orig) {
                    const lbl = btn.querySelector('.btn-label');
                    if (lbl) lbl.textContent = btn.dataset.orig;
                    else btn.textContent = btn.dataset.orig;
                    delete btn.dataset.orig;
                }
                btn.disabled = editor.getValue().trim().length === 0;
            }
        });
    }

    // ── Action buttons ────────────────────────────────────
    document.querySelectorAll('.action-button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => runAction(btn.dataset.action));
    });

    editor.onRunShortcut(() => runAction(lastAction));

    // ── Convert ───────────────────────────────────────────
    convertBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!editor.getValue().trim()) return;
        convertPopup.classList.toggle('hidden');
    });

    convertGoBtn.addEventListener('click', () => {
        const target = document.getElementById('convertTarget').value;
        convertPopup.classList.add('hidden');
        runAction('convert', target);
    });

    document.addEventListener('click', e => {
        if (!convertBtn.contains(e.target) && !convertPopup.contains(e.target)) {
            convertPopup.classList.add('hidden');
        }
    });

    // ── Clear ─────────────────────────────────────────────
    document.getElementById('clearBtn').addEventListener('click', () => {
        langOverride  = false;
        levelOverride = false;
        _lastDetected = DEFAULT_LANG;
        levelSelect.value = DEFAULT_LEVEL;
        applyLang(DEFAULT_LANG);
        editor.clear(DEFAULT_LANG);
        ui.clearOutput();
        actionBadge.classList.remove('show');
        syncActionButtons();
        setStatus('', 'Ready');
    });

    // ── Copy ──────────────────────────────────────────────
    document.getElementById('copyBtn').addEventListener('click', () => {
        const text = ui.getLatestResult();
        if (!text) return;
        const btn = document.getElementById('copyBtn');
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => {
                // Restore icon + label
                btn.innerHTML = `<svg class="panel-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy`;
            }, 2000);
        });
    });

    // ── Save ──────────────────────────────────────────────
    document.getElementById('saveBtn').addEventListener('click', () => {
        const text = ui.getLatestResult();
        if (!text) return;
        const blob = new Blob([text], { type: 'text/markdown' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'ai-analysis.md' });
        a.click();
        URL.revokeObjectURL(url);
    });

    // ── Load Sample ───────────────────────────────────────
    document.getElementById('sampleBtn').addEventListener('click', () => {
        const SAMPLES = {
            javascript: `// Binary Search\nfunction binarySearch(arr, target) {\n    let left = 0, right = arr.length - 1;\n    while (left <= right) {\n        const mid = Math.floor((left + right) / 2);\n        if (arr[mid] === target) return mid;\n        arr[mid] < target ? left = mid + 1 : right = mid - 1;\n    }\n    return -1;\n}\nconsole.log(binarySearch([1,3,5,7,9,11,13], 7));`,
            typescript: `// Generic Stack\nclass Stack<T> {\n    private items: T[] = [];\n    push(item: T): void { this.items.push(item); }\n    pop(): T | undefined { return this.items.pop(); }\n    peek(): T | undefined { return this.items[this.items.length - 1]; }\n    get size(): number { return this.items.length; }\n}\nconst s = new Stack<number>();\ns.push(1); s.push(2);\nconsole.log(s.peek());`,
            python:     `# Fibonacci Sequence\ndef fibonacci(n):\n    if n <= 0: return []\n    if n == 1: return [0]\n    fib = [0, 1]\n    while len(fib) < n:\n        fib.append(fib[-1] + fib[-2])\n    return fib\n\nprint(fibonacci(10))`,
            java:       `public class BubbleSort {\n    public static void bubbleSort(int[] arr) {\n        int n = arr.length;\n        for (int i = 0; i < n - 1; i++)\n            for (int j = 0; j < n - i - 1; j++)\n                if (arr[j] > arr[j + 1]) {\n                    int tmp = arr[j]; arr[j] = arr[j+1]; arr[j+1] = tmp;\n                }\n    }\n    public static void main(String[] args) {\n        int[] arr = {64, 34, 25, 12, 22};\n        bubbleSort(arr);\n        for (int x : arr) System.out.print(x + " ");\n    }\n}`,
            cpp:        `#include <iostream>\n#include <vector>\n#include <algorithm>\nint main() {\n    std::vector<int> v = {5, 2, 8, 1, 9};\n    std::sort(v.begin(), v.end());\n    for (int x : v) std::cout << x << " ";\n    return 0;\n}`,
            c:          `#include <stdio.h>\nvoid bubbleSort(int arr[], int n) {\n    for (int i = 0; i < n-1; i++)\n        for (int j = 0; j < n-i-1; j++)\n            if (arr[j] > arr[j+1]) { int t=arr[j]; arr[j]=arr[j+1]; arr[j+1]=t; }\n}\nint main() {\n    int arr[] = {64, 34, 25, 12};\n    bubbleSort(arr, 4);\n    for (int i = 0; i < 4; i++) printf("%d ", arr[i]);\n    return 0;\n}`,
            go:         `package main\nimport "fmt"\nfunc fibonacci(n int) []int {\n    fib := []int{0, 1}\n    for len(fib) < n { fib = append(fib, fib[len(fib)-1]+fib[len(fib)-2]) }\n    return fib[:n]\n}\nfunc main() { fmt.Println(fibonacci(10)) }`,
            rust:       `fn fibonacci(n: u32) -> Vec<u64> {\n    let mut fib = vec![0u64, 1];\n    for i in 2..n as usize { fib.push(fib[i-1] + fib[i-2]); }\n    fib[..n as usize].to_vec()\n}\nfn main() { println!("{:?}", fibonacci(10)); }`,
            bash:       `#!/bin/bash\nis_prime() {\n    local n=$1; [ "$n" -lt 2 ] && return 1\n    for ((i=2; i*i<=n; i++)); do [ $((n%i)) -eq 0 ] && return 1; done\n    return 0\n}\nfor num in 2 3 4 17 18 19; do\n    is_prime $num && echo "$num is prime" || echo "$num is not prime"\ndone`,
        };
        const lang   = languageSelect.value;
        const sample = SAMPLES[lang] ?? `// No sample available for ${lang} yet.`;
        editor.setValue(sample);
        syncActionButtons();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

