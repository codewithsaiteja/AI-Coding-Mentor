// Editor module - handles Monaco Editor functionality
export function initializeEditor() {
    let editor = null;
    const editorContainer = document.getElementById('monaco-editor');

    // Configure Monaco Loader
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

    // Initialize Monaco
    return new Promise((resolve) => {
        require(['vs/editor/editor.main'], function () {
            editor = monaco.editor.create(editorContainer, {
                value: '// Enter your code here...\n',
                language: 'javascript',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16 },
                cursorSmoothCaretAnimation: "on",
                smoothScrolling: true,
                lineNumbers: "on",
                renderLineHighlight: "all",
                tabSize: 4
            });

            // Return API through promise
            resolve({
                getValue: () => editor.getValue(),
                setValue: (value) => {
                    editor.setValue(value);
                },
                getLanguage: () => monaco.editor.getModel(editor.getDomNode())?.getLanguageId() || 'javascript',
                setLanguage: (language) => {
                    const model = editor.getModel();
                    monaco.editor.setModelLanguage(model, language);
                },
                clear: () => {
                    editor.setValue('// Enter your code here...\n');
                },
                focus: () => {
                    editor.focus();
                }
            });
        });
    });
}
