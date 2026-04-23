// API module — server communication with streaming support
// Use relative URL so it always hits the same server serving this page
const API_BASE_URL = '';

export async function analyzeCode(code, language, action, targetLanguage, onChunk, outputMode = 'explanation') {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, action, targetLanguage, outputMode }),
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
    let   buffer  = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            // Final call with isDone=true so UI can apply fallback if needed
            if (onChunk) onChunk(buffer, true);
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        if (onChunk) onChunk(buffer, false);
    }

    return buffer;
}
