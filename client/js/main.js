import { initializeEditor } from './editor.js';
import { initializeUI } from './ui.js';
import { analyzeCode } from './api.js';

async function init() {
    const ui = initializeUI();
    const editor = await initializeEditor();
    
    const actionBadge = document.getElementById('actionBadge');
    const langBadge = document.getElementById('langBadge');
    const languageSelect = document.getElementById('languageSelect');

    // Sync language badge and Monaco language with dropdown
    languageSelect.addEventListener('change', () => {
        const lang = languageSelect.value;
        langBadge.textContent = lang.toUpperCase();
        editor.setLanguage(lang === 'cpp' ? 'cpp' : (lang === 'python' ? 'python' : lang));
    });

    // Action buttons (all except Convert)
    document.querySelectorAll('.action-button[data-action]').forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.dataset.action;
            const code = editor.getValue();
            const language = languageSelect.value;

            if (!code.trim() || code.includes('Enter your code here')) { 
                ui.showError('Please enter some code to analyze!'); 
                return; 
            }

            actionBadge.textContent = button.textContent.trim().toUpperCase();
            actionBadge.classList.add('show');
            ui.showLoading();

            try {
                await analyzeCode(code, language, action, null, (chunk) => {
                    ui.updateStream(chunk);
                });
            } catch (error) {
                ui.showError(error.message);
                actionBadge.classList.remove('show');
            }
        });
    });

    // Convert button Logic
    const convertBtn = document.getElementById('convertBtn');
    const convertPopup = document.getElementById('convertPopup');
    const convertGoBtn = document.getElementById('convertGoBtn');

    convertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        convertPopup.classList.toggle('hidden');
    });

    convertGoBtn.addEventListener('click', async () => {
        const code = editor.getValue();
        const language = languageSelect.value;
        const targetLanguage = document.getElementById('convertTarget').value;

        if (!code.trim() || code.includes('Enter your code here')) { 
            ui.showError('Please enter some code to convert!'); 
            return; 
        }

        convertPopup.classList.add('hidden');
        actionBadge.textContent = `CONVERTING TO ${targetLanguage.toUpperCase()}`;
        actionBadge.classList.add('show');
        ui.showLoading();

        let fullResult = '';
        try {
            await analyzeCode(code, language, 'convert', targetLanguage, (chunk) => {
                fullResult += chunk;
                ui.updateStream(chunk);
            });
            // Optional: If the output contains a code block, we could offer to load it back into the editor
        } catch (error) {
            ui.showError(error.message);
            actionBadge.classList.remove('show');
        }
    });

    // Close popup on outside click
    document.addEventListener('click', (e) => {
        if (convertPopup && !convertBtn.contains(e.target) && !convertPopup.contains(e.target)) {
            convertPopup.classList.add('hidden');
        }
    });

    // Clear
    document.getElementById('clearBtn').addEventListener('click', () => {
        editor.clear();
        ui.clearOutput();
        actionBadge.classList.remove('show');
    });

    // Copy
    document.getElementById('copyBtn').addEventListener('click', () => {
        const text = ui.getCurrentContent();
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('copyBtn');
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy', 2000);
            });
        }
    });

    // Sample Loader
    document.getElementById('sampleBtn').addEventListener('click', () => {
        const samples = {
            javascript: `// Binary Search Implementation\nfunction binarySearch(arr, target) {\n    let left = 0;\n    let right = arr.length - 1;\n\n    while (left <= right) {\n        const mid = Math.floor((left + right) / 2);\n        if (arr[mid] === target) return mid;\n        if (arr[mid] < target) left = mid + 1;\n        else right = mid - 1;\n    }\n    return -1;\n}\n\nconst numbers = [1, 3, 5, 7, 9, 11, 13];\nconsole.log(binarySearch(numbers, 7));`,
            python: `# Fibonacci Sequence\ndef fibonacci(n):\n    if n <= 0: return []\n    if n == 1: return [0]\n    fib = [0, 1]\n    while len(fib) < n:\n        fib.append(fib[-1] + fib[-2])\n    return fib\n\nprint(fibonacci(10))`,
            java: `public class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("Hello, AI Mentor!");\n    }\n}`,
            cpp: `#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v = {1, 2, 3};\n    for(int i : v) std::cout << i << " ";\n    return 0;\n}`,
        };
        editor.setValue(samples[languageSelect.value] || `// No sample for this language yet.`);
    });

    // Save
    document.getElementById('saveBtn').addEventListener('click', () => {
        const text = ui.getCurrentContent();
        if (text) {
            const blob = new Blob([text], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ai-analysis.md';
            a.click();
            URL.revokeObjectURL(url);
        }
    });
}

// Handle initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
