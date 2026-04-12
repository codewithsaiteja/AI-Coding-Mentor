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
        const { code, language, action } = req.body;

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
        const prompt = action === 'convert'
            ? actionPrompts.convert(code, language, req.body.targetLanguage || 'python')
            : actionPrompts[action](code, language);

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Call Groq API with streaming enabled
        const stream = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert coding mentor. Provide clear, helpful, and accurate feedback on code. Respond in a clean, professional, and structured documentation style format. Use markdown headings (e.g., ### Complexity Analysis), bullet points, and code blocks for formatting. NEVER use emojis or icons.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.5,
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
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'AI Coding Mentor server is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 Make sure to set GROQ_API_KEY in server/.env file`);
});
