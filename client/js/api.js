// API module — server communication with streaming support
const API_BASE_URL = 'http://localhost:3000';

export async function analyzeCode(code, language, action, targetLanguage, onChunk) {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, action, targetLanguage }),
    });

    if (!response.ok) {
        let errMsg = 'Failed to analyze code';
        try {
            const data = await response.json();
            errMsg = data.error || errMsg;
        } catch {
            errMsg = (await response.text()) || errMsg;
        }
        throw new Error(errMsg);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk && onChunk) onChunk(chunk);
    }
}
