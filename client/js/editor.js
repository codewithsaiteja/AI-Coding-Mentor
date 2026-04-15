// Editor module — Monaco setup, language/level detection, auto-save

const STORAGE_KEY      = 'ai_mentor_code';
const STORAGE_LANG_KEY = 'ai_mentor_lang';

// Correct comment syntax per language
const PLACEHOLDERS = {
    javascript: '// Enter your code here...\n',
    typescript: '// Enter your code here...\n',
    java:       '// Enter your code here...\n',
    cpp:        '// Enter your code here...\n',
    c:          '// Enter your code here...\n',
    go:         '// Enter your code here...\n',
    rust:       '// Enter your code here...\n',
    python:     '# Enter your code here...\n',
    bash:       '# Enter your code here...\n',
    html:       '<!-- Enter your code here -->\n',
    css:        '/* Enter your code here */\n',
};

function getPlaceholder(lang) {
    return PLACEHOLDERS[lang] ?? '// Enter your code here...\n';
}

function isOnlyPlaceholder(value) {
    return Object.values(PLACEHOLDERS).some(p => value.trim() === p.trim());
}

// ── Language detection — scoring-based, most specific wins ──
//
// Each language defines weighted signals. The code is tested against
// all of them; the language with the highest total score wins.
// Requires a minimum score of 2 to avoid false positives on short snippets.

const LANG_SIGNALS = {
    python: [
        { re: /^\s*def\s+\w+\s*\(/m,                    score: 4 },  // def func(
        { re: /^\s*import\s+\w+/m,                       score: 3 },  // import x
        { re: /^\s*from\s+\w+.*\bimport\b/m,             score: 4 },  // from x import y
        { re: /^\s*elif\s+/m,                             score: 5 },  // elif (Python-only)
        { re: /\bself\b/,                                 score: 3 },  // self parameter
        { re: /:\s*\n\s+\S/m,                             score: 2 },  // colon + indented block
        { re: /^\s*class\s+\w+.*:/m,                      score: 3 },  // class Foo:  (colon = Python)
        { re: /\bprint\s*\(/,                             score: 2 },  // print(
        { re: /^\s*#.*$/m,                                score: 1 },  // # comment
        { re: /\bNone\b|\bTrue\b|\bFalse\b/,             score: 2 },  // Python literals
        { re: /\blambda\s+\w+/,                          score: 4 },  // lambda x:
        { re: /^\s*@\w+\s*\n/m,                          score: 2 },  // decorator
        { re: /\blen\s*\(|\brange\s*\(|\benumerate\s*\(/, score: 2 },  // builtins
    ],
    c: [
        { re: /#include\s*<(stdio|stdlib|string|math|ctype|time)\.h>/,  score: 5 },
        { re: /\bprintf\s*\(/,                            score: 4 },
        { re: /\bscanf\s*\(/,                             score: 4 },
        { re: /\bmalloc\s*\(|\bcalloc\s*\(|\bfree\s*\(/, score: 4 },
        { re: /\bint\s+main\s*\(\s*(void|int\s+argc)?\s*\)/,  score: 3 },
        { re: /->\w+/,                                    score: 2 },  // pointer member access
        { re: /\bstruct\s+\w+\s*\{/,                     score: 3 },
        { re: /\btypedef\s+/,                             score: 2 },
    ],
    cpp: [
        { re: /#include\s*<(iostream|vector|string|map|algorithm|memory|fstream)>/,  score: 5 },
        { re: /\bstd::/,                                  score: 4 },
        { re: /\bcout\s*<</,                              score: 5 },
        { re: /\bcin\s*>>/,                               score: 5 },
        { re: /\busing\s+namespace\s+std\b/,              score: 4 },
        { re: /\btemplate\s*</,                           score: 4 },
        { re: /::\w+/,                                    score: 2 },
        { re: /\bnew\s+\w+|\bdelete\s+/,                 score: 2 },
        { re: /\bvector\s*<|\bmap\s*<|\bpair\s*</,       score: 3 },
    ],
    java: [
        { re: /\bpublic\s+class\s+\w+/,                  score: 5 },  // public class (strong)
        { re: /System\.out\.(print|println|printf)\s*\(/, score: 5 },
        { re: /\bimport\s+java\./,                        score: 5 },
        { re: /\bpublic\s+static\s+void\s+main\s*\(/,    score: 5 },
        { re: /@Override\b/,                              score: 4 },
        { re: /\bpublic\s+(private|protected|static|final|void|int|String)\b/, score: 3 },
        { re: /\bnew\s+\w+\s*\(/,                        score: 1 },
        { re: /\bString\[\]\s+args\b/,                   score: 4 },
    ],
    javascript: [
        { re: /\bconsole\.(log|error|warn|info)\s*\(/,   score: 4 },
        { re: /=>/,                                       score: 3 },  // arrow function
        { re: /\bconst\s+\w+\s*=/,                       score: 2 },
        { re: /\blet\s+\w+/,                             score: 2 },
        { re: /\bfunction\s+\w+\s*\(/,                   score: 3 },
        { re: /\brequire\s*\(\s*['"`]/,                  score: 4 },
        { re: /\bdocument\.\w+|\bwindow\.\w+/,           score: 4 },
        { re: /\bPromise\s*\(|\basync\s+function|\bawait\s+/, score: 3 },
        { re: /\bmodule\.exports\b/,                     score: 4 },
        { re: /\bimport\s+.*\bfrom\s+['"`]/,             score: 3 },
    ],
    typescript: [
        // Require explicit TS-only syntax — do NOT score generic <T> alone (matches C++ too)
        { re: /:\s*(string|number|boolean|void|any|never|unknown)\s*[=;,)>]/,  score: 4 },
        { re: /\binterface\s+\w+\s*\{/,                  score: 5 },
        { re: /\btype\s+\w+\s*=\s*[^=]/,                score: 4 },
        { re: /\benum\s+\w+\s*\{/,                      score: 4 },
        { re: /\bas\s+(string|number|boolean|any|\w+Type)\b/, score: 3 },
        { re: /\bReadonly\b|\bPartial\b|\bRequired\b|\bRecord\b/, score: 4 },
        { re: /\bprivate\s+\w+:\s*\w+|\bpublic\s+\w+:\s*\w+/, score: 3 },
    ],
    go: [
        { re: /\bpackage\s+\w+/,                         score: 4 },
        { re: /\bfunc\s+\w+\s*\(/,                       score: 4 },
        { re: /:=/,                                      score: 3 },
        { re: /\bfmt\.(Print|Println|Sprintf|Errorf)\s*\(/, score: 5 },
        { re: /\bimport\s+\(/,                           score: 3 },
        { re: /\bgo\s+func\b|\bgoroutine\b/,             score: 5 },
    ],
    rust: [
        { re: /\bfn\s+\w+\s*\(/,                         score: 4 },
        { re: /\blet\s+mut\s+/,                          score: 4 },
        { re: /\bprintln!\s*\(/,                         score: 5 },
        { re: /\buse\s+std::/,                           score: 5 },
        { re: /\bimpl\s+\w+/,                            score: 3 },
        { re: /\bmatch\s+\w+\s*\{/,                     score: 3 },
        { re: /->\s*\w+\s*\{/,                          score: 2 },
    ],
    bash: [
        { re: /^#!.*\/(bash|sh|zsh)/m,                   score: 6 },
        { re: /^\s*(echo|export|source|chmod|grep|awk|sed|curl|cd|ls)\s/m, score: 3 },
        { re: /\$\{?\w+\}?/,                             score: 2 },
        { re: /\[\[.*\]\]/,                              score: 4 },
        { re: /\bfi\b|\bdone\b|\bthen\b/,               score: 3 },
    ],
    html: [
        { re: /<!DOCTYPE\s+html>/i,                      score: 6 },
        { re: /<html[\s>]/i,                             score: 5 },
        { re: /<\/?(div|span|p|a|ul|li|h[1-6]|body|head|script|style)[\s>/]/i, score: 3 },
    ],
    css: [
        { re: /^\s*[\w\-.#\[*:]+\s*\{[^}]*\}/m,         score: 4 },
        { re: /:\s*(px|em|rem|%|vh|vw|auto|none|flex|block|grid)\b/, score: 3 },
        { re: /@(media|keyframes|import|charset)\b/,     score: 4 },
    ],
};

const MIN_SCORE = 2;

// Languages that have a corresponding <option> in the dropdown
export const SUPPORTED_LANGS = new Set([
    'javascript', 'typescript', 'python', 'java', 'cpp', 'c',
    'go', 'rust', 'bash', 'html', 'css',
]);

export function detectLanguage(code) {
    if (!code || !code.trim()) return 'plaintext';

    let best = { lang: 'plaintext', score: 0 };
    const scores = {};

    for (const [lang, signals] of Object.entries(LANG_SIGNALS)) {
        let total = 0;
        for (const { re, score } of signals) {
            if (re.test(code)) total += score;
        }
        scores[lang] = total;
        if (total > best.score) {
            best = { lang, score: total };
        }
    }

    const detected = best.score >= MIN_SCORE ? best.lang : 'plaintext';
    console.log('Detected Language:', detected, '| Scores:', scores);
    return detected;
}

// ── Complexity level detection ────────────────────────────
export function detectLevel(code) {
    const advanced = [
        /\bclass\s+\w+/,
        /async\s+function|await\s+|Promise\s*\(/,
        /\btry\s*\{[\s\S]*?\bcatch\b/,
        /import\s+[\w{*].*\bfrom\b|require\s*\(/,
        /\binterface\s+\w+|\bextends\b|\bimplements\b/,
        /\btemplate\s*<|\bgeneric\b/i,
    ];
    const intermediate = [
        /\bfunction\s+\w+|\w+\s*=\s*function|\w+\s*=\s*\(.*\)\s*=>/,
        /\bfor\s*\(|\bwhile\s*\(|\bdo\s*\{/,
        /\bif\s*\(.+\)[\s\S]*?\belse\b/,
        /\bswitch\s*\(/,
        /\bdef\s+\w+/,
        /\bfn\s+\w+|\bfunc\s+\w+/,
    ];
    for (const p of advanced)      if (p.test(code)) return 'advanced';
    for (const p of intermediate)  if (p.test(code)) return 'intermediate';
    return 'beginner';
}

// ── Monaco init ───────────────────────────────────────────
export function initializeEditor() {
    let editor      = null;
    let currentLang = localStorage.getItem(STORAGE_LANG_KEY) || 'javascript';

    require.config({
        paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
    });

    return new Promise((resolve) => {
        require(['vs/editor/editor.main'], () => {
            const savedCode = localStorage.getItem(STORAGE_KEY) || getPlaceholder(currentLang);

            // If there's real saved code, detect its language and correct currentLang
            // so the editor opens in the right mode, not whatever was last persisted.
            if (savedCode && !isOnlyPlaceholder(savedCode)) {
                const detected = detectLanguage(savedCode);
                if (detected !== 'plaintext') {
                    currentLang = detected;
                    localStorage.setItem(STORAGE_LANG_KEY, currentLang);
                }
            }

            editor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value:    savedCode,
                language: currentLang,
                theme:    localStorage.getItem('ai_mentor_theme') === 'light' ? 'vs' : 'vs-dark',
                automaticLayout:           true,
                fontSize:                  14,
                fontFamily:                "'JetBrains Mono', 'Consolas', monospace",
                fontLigatures:             true,
                lineHeight:                22,
                minimap:                   { enabled: false },
                scrollBeyondLastLine:      false,
                padding:                   { top: 16, bottom: 16 },
                cursorStyle:               'line',
                cursorWidth:               2,
                cursorSmoothCaretAnimation:'on',
                smoothScrolling:           true,
                lineNumbers:               'on',
                renderLineHighlight:       'line',
                tabSize:                   4,
                insertSpaces:              true,
                wordWrap:                  'on',
                rulers:                    [],
                guides:                    { indentation: false, bracketPairs: false },
                overviewRulerBorder:       false,
                overviewRulerLanes:        0,
                hideCursorInOverviewRuler: true,
                renderIndentGuides:        false,
                occurrencesHighlight:      false,
                selectionHighlight:        false,
                scrollbar: {
                    verticalScrollbarSize:   6,
                    horizontalScrollbarSize: 6,
                },
            });

            // Auto-save; restore placeholder if editor is emptied
            const changeListeners = [];
            editor.onDidChangeModelContent(() => {
                const val = editor.getValue();
                if (val === '') {
                    editor.setValue(getPlaceholder(currentLang));
                    editor.setPosition({ lineNumber: 2, column: 1 });
                    return;
                }
                localStorage.setItem(STORAGE_KEY, val);
                changeListeners.forEach(cb => cb(val));
            });

            editor.focus();

            resolve({
                getValue() {
                    const v = editor.getValue();
                    return isOnlyPlaceholder(v) ? '' : v;
                },
                setValue(value) {
                    editor.setValue(value);
                    localStorage.setItem(STORAGE_KEY, value);
                },
                getLanguage: () => currentLang,
                setLanguage(lang) {
                    currentLang = lang;
                    monaco.editor.setModelLanguage(editor.getModel(), lang);
                    localStorage.setItem(STORAGE_LANG_KEY, lang);
                },
                clear(lang) {
                    currentLang = lang || currentLang;
                    editor.setValue(getPlaceholder(currentLang));
                    localStorage.removeItem(STORAGE_KEY);
                },
                focus:           () => editor.focus(),
                onRunShortcut:   (cb) => editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, cb),
                onChange:        (cb) => changeListeners.push(cb),
                getSavedLanguage:() => localStorage.getItem(STORAGE_LANG_KEY) || 'javascript',
                getInitialLang:  () => currentLang,
                setEditorTheme:  (t) => monaco.editor.setTheme(t === 'light' ? 'vs' : 'vs-dark'),
            });
        });
    });
}
