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

// ── Language detection (most specific first) ─────────────
const LANG_PATTERNS = [
    { lang: 'java',       re: /\bpublic\s+(class|interface|enum|static|void)\b|System\.out\.(print|println)|import\s+java\.|@Override|@\w+\s*\n/ },
    { lang: 'cpp',        re: /#include\s*[<"]|std::|cout\s*<<|cin\s*>>|\bint\s+main\s*\(|::\w+/ },
    { lang: 'c',          re: /#include\s*<(stdio|stdlib|string|math)\.h>|\bprintf\s*\(|\bscanf\s*\(|\bmalloc\s*\(/ },
    { lang: 'python',     re: /^\s*(def |class |import |from .+ import|elif |lambda )|print\s*\(|:\s*\n|\bself\b/m },
    { lang: 'typescript', re: /:\s*(string|number|boolean|void|any|never)\b|interface\s+\w+|type\s+\w+\s*=|<\w+>/ },
    { lang: 'go',         re: /\bfunc\s+\w+|:=|fmt\.(Print|Println|Sprintf)|package\s+\w+|import\s+\(/ },
    { lang: 'rust',       re: /\bfn\s+\w+|let\s+mut\s|println!\s*\(|use\s+std::|impl\s+\w+/ },
    { lang: 'bash',       re: /^#!.*\/(bash|sh)|^\s*(echo|export|source|chmod|grep|awk|sed)\s/m },
    { lang: 'html',       re: /<!DOCTYPE\s+html>|<html[\s>]|<\/html>|<body[\s>]|<head[\s>]/i },
    { lang: 'css',        re: /^\s*[\w\-.#\[*:]+\s*\{[^}]*\}/m },
    { lang: 'javascript', re: /console\.(log|error|warn)|const |let |var |\bfunction\b|=>|require\s*\(|document\.|window\./ },
];

export function detectLanguage(code) {
    for (const { lang, re } of LANG_PATTERNS) {
        if (re.test(code)) return lang;
    }
    return null;
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
            editor.onDidChangeModelContent(() => {
                const val = editor.getValue();
                if (val === '') {
                    editor.setValue(getPlaceholder(currentLang));
                    editor.setPosition({ lineNumber: 2, column: 1 });
                    return;
                }
                localStorage.setItem(STORAGE_KEY, val);
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
                getSavedLanguage:() => localStorage.getItem(STORAGE_LANG_KEY) || 'javascript',
                setEditorTheme:  (t) => monaco.editor.setTheme(t === 'light' ? 'vs' : 'vs-dark'),
            });
        });
    });
}
