// UI module - handles user interface updates with Markdown & Streaming support
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

export function initializeUI() {
    const output = document.getElementById('output');
    const loading = document.getElementById('loading');
    let currentContent = '';

    // Configure marked options
    marked.setOptions({
        breaks: true,
        gfm: true
    });

    return {
        showLoading: () => {
            output.innerHTML = '';
            currentContent = '';
            loading.classList.remove('hidden');
        },

        hideLoading: () => {
            loading.classList.add('hidden');
        },

        updateStream: (chunk) => {
            loading.classList.add('hidden');
            currentContent += chunk;
            
            try {
                // Use imported marked
                output.innerHTML = marked.parse(currentContent);

                // Trigger Prism highlighting for code blocks
                if (window.Prism) {
                    Prism.highlightAllUnder(output);
                }
            } catch (e) {
                console.error('Markdown rendering error:', e);
                output.textContent = currentContent;
            }

            // Auto-scroll to bottom
            const container = document.querySelector('.response-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        },

        showError: (message) => {
            loading.classList.add('hidden');
            output.innerHTML = `
                <div class="error-display" style="border-left: 4px solid #da3633; background: rgba(218, 54, 51, 0.1); padding: 20px; border-radius: 8px;">
                    <div class="error-title" style="color: #fa7a7a; font-weight: 700; margin-bottom: 8px;">System Error</div>
                    <div class="error-message" style="color: #e6edf3;">${escapeHtml(message)}</div>
                </div>
            `;
        },

        clearOutput: () => {
            output.innerHTML = '';
            currentContent = '';
        },

        getCurrentContent: () => currentContent
    };
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
