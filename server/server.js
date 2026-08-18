const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// CodeSmart system prompt — strict code reviewer persona
const SYSTEM_PROMPT = `You are CodeSmart, a strict code reviewer.

TASK: Given user code, return a precise technical review and a corrected version.

You MUST always respond with a single valid JSON object and nothing else.
No text before it. No text after it. No markdown code fences wrapping the JSON.
The JSON must have exactly three keys: "explanation", "code", and "language".
Use \\n for newlines inside string values.

Inside the "explanation" value, use ONLY this exact format — no other text, no deviations:

Issue:
[1-2 lines explaining the root problem]

Why:
[1-2 lines explaining why it is incorrect]

Fixed Code:
[ONLY clean runnable code here — no markdown, no backticks, no fences, no explanation]

Better Design:
- [short bullet point]
- [short bullet point]

STRICT RULES for the explanation field:
- Do NOT use markdown symbols (no ###, no backticks, no **, no *)
- Do NOT mix explanation with code
- Do NOT write long paragraphs
- Section labels must appear exactly as shown (Issue:, Why:, Fixed Code:, Better Design:)
- If unsure about anything, write: Uncertain — requires verification
- Do not hallucinate APIs or libraries`;

// Action prompts for different AI operations
const actionPrompts = {
    explain: (code, language) => 
        `Explain the following ${language} code in detail. Break down what each part does and how it works:\n\n${code}`,
    
    findBugs: (code, language) => 
        `Analyze the following ${language} code for bugs, errors, and potential issues. List each problem with its location and severity:\n\n${code}`,
    
    improve: (code, language) => 
        `Suggest improvements for the following ${language} code. Focus on performance, readability, and best practices:\n\n${code}`,
    
    addComments: (code, language) => 
        `Add helpful comments to the following ${language} code. Explain what each section does:\n\n${code}`,
    
    generateTests: (code, language) => 
        `Generate unit tests for the following ${language} code. Include test cases for normal operation, edge cases, and error handling:\n\n${code}`,
    
    refactor: (code, language) => 
        `Refactor the following ${language} code to make it cleaner, more maintainable, and follow best practices. Provide the refactored code with explanations:\n\n${code}`,
    
    bestPractices: (code, language) => 
        `Review the following ${language} code against industry best practices. Identify what's done well and what could be improved:\n\n${code}`,

    convert: (code, language, targetLanguage) =>
        `Convert the following ${language} code to ${targetLanguage}. Provide the complete converted code followed by a brief explanation of key differences between the two languages for this code:\n\n${code}`
};

// Main analyze endpoint (Streaming)
app.post('/analyze', async (req, res) => {
    try {
        const { code, language, action, outputMode } = req.body;

        // Validation
        if (!code || !language || !action) {
            return res.status(400).json({ 
                error: 'Missing required fields: code, language, and action are required' 
            });
        }

        if (!actionPrompts[action]) {
            return res.status(400).json({ 
                error: `Invalid action: ${action}` 
            });
        }

        // Generate prompt based on action
        const basePrompt = action === 'convert'
            ? actionPrompts.convert(code, language, req.body.targetLanguage || 'python')
            : actionPrompts[action](code, language);

        // Build structured prompt based on outputMode
        const mode = outputMode || 'explanation';
        const targetLang = action === 'convert' ? (req.body.targetLanguage || 'python') : language;

        const SECTION_FORMAT = `
Respond using ONLY these exact sections in this exact order. No other text.

Issue:
[1-2 lines explaining the root problem]

Why:
[1-2 lines explaining why it is incorrect]

Fixed Code:
[paste only raw runnable code here — no backticks, no fences, no language label, no explanation]

Better Design:
- [short actionable bullet point]
- [short actionable bullet point]
`;

        let userContent;

        if (mode === 'code') {
            userContent = `${basePrompt}

Return ONLY a JSON object, nothing else before or after it:
{"explanation":"","code":"PURE_CODE_HERE","language":"${targetLang}"}

Replace PURE_CODE_HERE with the raw runnable code. No backticks. No markdown. No fences. Use \\n for newlines inside the JSON string.`;
        } else {
            userContent = `${basePrompt}

${SECTION_FORMAT}

Now wrap your entire response above into this JSON object. Return ONLY the JSON, nothing else:
{"explanation":"RESPONSE_HERE","code":"${mode === 'both' ? 'PURE_CODE_HERE' : ''}","language":"${targetLang}"}

Rules for the JSON:
- Replace RESPONSE_HERE with your full structured response (Summary through Suggestions)
- Use \\n for newlines inside JSON strings
- No backticks or markdown inside the explanation string
- No text before or after the JSON object
${mode === 'both' ? '- Replace PURE_CODE_HERE with the improved raw runnable code (no backticks, no fences)' : ''}`;
        }

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Call Groq API with streaming enabled
        const stream = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: userContent
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 3000,
            stream: true
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(content);
            }
        }

        res.end();

    } catch (error) {
        console.error('Error:', error);
        
        if (!res.headersSent) {
            if (error.message.includes('API key')) {
                return res.status(401).json({ 
                    error: 'Invalid or missing Groq API key. Please check your .env file.' 
                });
            }
            res.status(500).json({ 
                error: 'Failed to analyze code. Please try again.' 
            });
        } else {
            res.end();
        }
    }
});

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', app: 'CodeSmart', message: 'CodeSmart server is running' });
});

// Catch-all: serve index.html for any unmatched route (SPA support)
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`CodeSmart server running at https://ai-coding-mentor-pmvx.onrender.com`);
    console.log(`Health check: https://ai-coding-mentor-pmvx.onrender.com/health`);
    if (!process.env.GROQ_API_KEY) {
        console.warn('WARNING: GROQ_API_KEY is not set. Set it in server/.env');
    }
});
