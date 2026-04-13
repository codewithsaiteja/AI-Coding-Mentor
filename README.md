# AI Coding Mentor

An interactive web-based coding mentor powered by Groq AI that provides real-time code analysis, explanations, and improvements.

## Features

- **Explain Code** — Get detailed explanations of your code
- **Find Bugs** — Identify potential issues and bugs
- **Optimize** — Receive suggestions for code improvements
- **Generate Tests** — Create unit tests for your code
- **Refactor** — Get refactoring suggestions
- **Complexity** — Analyze code complexity and best practices
- **Convert** — Convert code between languages

## Setup

1. Install dependencies:
   ```bash
   cd server && npm install
   ```

2. Create a `.env` file in the `server` directory:
   ```
   GROQ_API_KEY=your_groq_api_key_here
   PORT=3000
   ```

3. Get your Groq API key from [https://console.groq.com](https://console.groq.com)

## Usage

1. Start the server:
   ```bash
   cd server && npm start
   ```
   Or from the project root:
   ```bash
   npm start
   ```

2. Open your browser at `http://localhost:3000`

3. Write or paste code in the editor and click any action button

## Keyboard Shortcuts

- `Ctrl+Enter` — Re-run the last action

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES Modules), Monaco Editor, HTML5, CSS3
- **Backend**: Node.js, Express
- **AI**: Groq API (Llama 3.3 70B)

## Project Structure

```
ai-coding-mentor/
├── client/
│   ├── index.html
│   ├── style.css
│   ├── assets/
│   └── js/
│       ├── main.js
│       ├── editor.js
│       ├── ui.js
│       └── api.js
├── server/
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── package.json
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Your Groq API key | required |
| `PORT` | Server port | `3000` |

