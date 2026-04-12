// API module - handles server communication with streaming support
const API_BASE_URL = 'http://localhost:3000';

export async function analyzeCode(code, language, action, targetLanguage, onChunk) {
    try {
        const response = await fetch(`${API_BASE_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, language, action, targetLanguage })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to analyze code');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            if (onChunk) onChunk(chunk);
        }

    } catch (error) {
        if (error.name === 'AbortError') return;
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Cannot connect to server. Make sure the server is running on port 3000.');
        }
        throw error;
    }
}
