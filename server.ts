import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { searchKB, KBRecord } from './src/lib/search.js';

// Resolve CWD paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express App
const app = express();
const PORT = 3000;

// Enable JSON bodies
app.use(express.json());

// Load or generate tickets from our CSV
const CSV_FILE_PATH = path.join(process.cwd(), 'src/data/tickets_raw.csv');
const JSON_FILE_PATH = path.join(process.cwd(), 'src/data/tickets.json');

let kbRecords: KBRecord[] = [];

// Local CSV parser setup within the server boot to guarantee tickets are populated smoothly
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField.trim());
  return result;
}

function initializeKB() {
  try {
    if (fs.existsSync(JSON_FILE_PATH)) {
      console.log(`[Server] Loading existing processed knowledge base: ${JSON_FILE_PATH}`);
      const data = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
      kbRecords = JSON.parse(data);
    } else {
      console.log(`[Server] Processed KB not found. Generating from raw CSV...`);
      if (fs.existsSync(CSV_FILE_PATH)) {
        const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
        
        for (let i = 1; i < lines.length; i++) {
          const rawFields = parseCSVLine(lines[i]);
          if (rawFields.length < 6) continue;

          const [intent, category, exampleQueries, requiredInfo, troubleshootingSteps, assignment] = rawFields;

          const queries = exampleQueries
            .split(',')
            .map(q => q.replace(/^"/, '').replace(/"$/, '').trim())
            .filter(q => q.length > 0);

          const reqInfoList = requiredInfo
            .split(',')
            .map(inf => inf.replace(/^"/, '').replace(/"$/, '').trim())
            .filter(inf => inf.length > 0 && inf !== 'None');

          let steps: string[] = [];
          if (troubleshootingSteps.includes('?')) {
            steps = troubleshootingSteps
              .split('?')
              .map(step => step.trim())
              .filter(step => step.length > 0 && step !== '?');
          } else {
            steps = [troubleshootingSteps.trim()];
          }

          kbRecords.push({
            id: `kb-${i}`,
            intent: intent || 'unknown',
            category: category || 'General',
            queries: queries.length > 0 ? queries : [intent.replace(/_/g, ' ')],
            requiredInfo: reqInfoList,
            steps: steps.length > 0 ? steps : ['Follow standard guidelines.'],
            assignment: assignment || 'SD Team',
            rawText: `${intent} ${category} ${queries.join(' ')} ${assignment}`.toLowerCase()
          });
        }
        
        // Write it
        const outputDir = path.dirname(JSON_FILE_PATH);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(kbRecords, null, 2), 'utf-8');
        console.log(`[Server] Sourced and cached ${kbRecords.length} records.`);
      } else {
        console.error(`[Server] Warning: Raw CSV file not found at ${CSV_FILE_PATH}`);
        kbRecords = [];
      }
    }
  } catch (error) {
    console.error(`[Server] Error initializing KB:`, error);
    kbRecords = [];
  }
}

// Ensure KB is populated
initializeKB();

// Initialize the Gemini API client safely and lazily
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not defined. Please configure secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

// API ROUTE: Knowledge Base Stats
app.get('/api/kb/stats', (req, res) => {
  try {
    const totalRecords = kbRecords.length;
    
    // Group categories
    const categoriesCount: Record<string, number> = {};
    const teamAssignmentCount: Record<string, number> = {};

    kbRecords.forEach(record => {
      categoriesCount[record.category] = (categoriesCount[record.category] || 0) + 1;
      teamAssignmentCount[record.assignment] = (teamAssignmentCount[record.assignment] || 0) + 1;
    });

    const categories = Object.keys(categoriesCount).map(name => ({
      name,
      count: categoriesCount[name]
    })).sort((a, b) => b.count - a.count);

    const teams = Object.keys(teamAssignmentCount).map(name => ({
      name,
      count: teamAssignmentCount[name]
    })).sort((a, b) => b.count - a.count);

    res.json({
      totalRecords,
      categories,
      teams,
      status: 'Ready'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API ROUTE: High-speed Search
app.get('/api/kb/search', (req, res) => {
  try {
    const query = (req.query.q as string || '').trim();
    if (!query) {
      return res.json({ matches: [], totalMatched: 0 });
    }

    const matches = searchKB(query, kbRecords, 5);
    res.json({
      matches,
      totalMatched: matches.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API ROUTE: Synthesize Contextual Ticket Solutions
app.post('/api/kb/synthesize', async (req, res) => {
  try {
    const { ticketDescription, matchedTickets } = req.body;

    if (!ticketDescription || ticketDescription.trim().length === 0) {
      return res.status(400).json({ error: 'Ticket description is required.' });
    }

    const ai = getGeminiClient();

    // Prepare KB Context text
    let kbContextText = 'No matching knowledge base records were found.';
    if (matchedTickets && matchedTickets.length > 0) {
      kbContextText = matchedTickets.map((m: any, idx: number) => {
        const ticket = m.ticket || m;
        const confidence = m.confidence !== undefined ? `${m.confidence}%` : 'N/A';
        return `[KB Match #${idx + 1}] (Confidence: ${confidence})
Category: ${ticket.category}
Intent: ${ticket.intent}
Allowed Queries: ${ticket.queries?.join(', ') || ''}
Required User Info to Settle: ${ticket.requiredInfo?.join(', ') || 'None'}
Troubleshooting Steps Sourced:
${(ticket.steps || []).map((step: string, sIdx: number) => `  ${sIdx + 1}. ${step}`).join('\n')}
Primary Assignment Team: ${ticket.assignment}
`;
      }).join('\n---\n');
    }

    // Build the instruction prompt that strictly implements using KB as source of truth and intelligently fills gap
    const systemPrompt = `You are "AI SD Copilot," an elite Service Desk Copilot built to settle technical Service Desk tickets with absolute accuracy.

We have searched our historical Knowledge Base (KB) and provided you with the top KB results. Here is your strict handbook to construct a detailed Copilot analysis report:
1. Treat "Internal KB Results" as the absolute primary source of truth. Sourced intents, categories, and assignment teams MUST match closely unless there's zero correlation.
2. Sift through the user's description. If the KB matches, construct the solution around the pre-vetted KB steps.
3. IN FILLING MISSING INFO: Be extremely sharp at detecting details that are required but missing from the ticket description.
4. GAP RECOVERY: Intelligently supplement standard technical instructions option-by-option.
5. In addition to segmented properties, you MUST generate an extremely exhaustive, beautifully formatted Markdown analysis guide in the "detailedReport" field. It must strictly adhere to this section layout structure:

- An introduction line: "As your AI Service Desk Copilot, I'm here to help you understand and resolve the "[Ticket Title]" ticket."
- A horizontal rule divider (---)
- "**Issue Category:** [Category Name]"
- "**Possible Intent:**\n[1-2 paragraphs detailing the logical intent, different user objectives, and contextual considerations]"
- "**Required Information:**\n[Detailed bulleted or nested list of device details, installation context, network environment parameters, or access levels required]"
- "**Missing Information (from the initial ticket):**\n[Clear callouts of which required parameters are missing from the raw dispatch request description]"
- "**Basic Troubleshooting:**\n[Initial baseline sanity checks, e.g. device reboot, company software center checks, or physical checks]"
- "**Detailed HOW TO Steps:**\n[Extremely detailed, multi-level nested step-by-step resolution processes with clear paths, portal names, buttons, and verification steps. Break down into different modes/scenarios if applicable, like Preferred/Alternative, or Corporate vs Guest]"
- "**Advanced Checks:**\n[In-depth technical diagnostic points such as event logs, system requirements deep-dives, administrative rights, group nesting policies, or NAC/RADIUS checks as appropriate]"
- "**Assignment Team:**\n- **Primary Assignment:** [Primary Team with clear details on duties]\n- **Escalation (if applicable):** [Escalation path and details]"

6. Also generate a courteous, professional and direct markdown template email response that the agent can immediately copy and send to the requester in the "suggestedResponse" field.`;

    const userMessage = `AGENT DISPATCHED TICKET:
"${ticketDescription}"

TOP MATCHED INTERNAL KB RESULTS FOUND:
${kbContextText}

Synthesize a coherent solution following the required JSON schema output.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, description: 'The verified service desk category (e.g., Network, Messaging, Wintel, AD, SCCM, Endpoint Security).' },
            intent: { type: Type.STRING, description: 'The categorized technical intent (e.g., wifi_guest_access, email_sync_issue, disk_space_issue).' },
            requiredInfo: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of specific details we still need to ask the user for (representing gaps in historical data vs incoming ticket description).'
            },
            steps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Step-by-step resolution checklist compiled strictly from primary and synthesized sources.'
            },
            assignment: { type: Type.STRING, description: 'The correct team to assign this ticket to (e.g., ITC - Network, Messaging Team, Wintel, SCCM Team, ITC - Cyber Security).' },
            synthesisExplanation: { type: Type.STRING, description: 'A clear explanation of how you aligned the input to our internal KB database, what gaps were filled, and key reasons for team routing.' },
            suggestedResponse: { type: Type.STRING, description: 'Formatted polite email or chat message template for the user with variables like [User Name] or [Device Name] so the Service Desk agent can copy-paste.' },
            detailedReport: { type: Type.STRING, description: 'An exhaustive, beautifully structured Markdown guide with all requested sections covering Category, Intent, Required & Missing Info, Basic & Detailed Troubleshooting How-To Steps, Advanced Checks, and Assignment Team.' }
          },
          required: ['category', 'intent', 'requiredInfo', 'steps', 'assignment', 'synthesisExplanation', 'suggestedResponse', 'detailedReport']
        }
      }
    });

    const parsedResponse = JSON.parse(response.text?.trim() || '{}');
    res.json(parsedResponse);
  } catch (err: any) {
    console.error(`[Server] Synthesis error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// API ROUTE: Manual Ticket Contribution (Empower SD Agents to dynamically update KB)
app.post('/api/kb/tickets', (req, res) => {
  try {
    const { intent, category, queries, requiredInfo, steps, assignment } = req.body;

    if (!intent || !category || !steps || steps.length === 0) {
      return res.status(400).json({ error: 'Intent, Category, and Troubleshooting Steps are required.' });
    }

    const newRecord: KBRecord = {
      id: `kb-custom-${Date.now()}`,
      intent: intent.trim(),
      category: category.trim(),
      queries: Array.isArray(queries) ? queries.map((q: string) => q.trim()) : [intent.replace(/_/g, ' ')],
      requiredInfo: Array.isArray(requiredInfo) ? requiredInfo.map((i: string) => i.trim()) : [],
      steps: Array.isArray(steps) ? steps.map((s: string) => s.trim()) : [steps],
      assignment: assignment || 'SD Team',
      rawText: `${intent} ${category} ${(queries || []).join(' ')} ${assignment}`.toLowerCase()
    };

    kbRecords.unshift(newRecord); // Put custom on top!
    
    // Save to cache asynchronously so it survives hot-reloads
    fs.writeFile(JSON_FILE_PATH, JSON.stringify(kbRecords, null, 2), 'utf-8', (err) => {
      if (err) console.error(`[Server] Error saving new ticket contribution:`, err);
    });

    res.json({
      success: true,
      message: 'Service Desk Ticket successfully appended to Local Knowledge Base!',
      ticket: newRecord
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Configure dev server or serving static production build
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Mounted Vite Middleware in Development mode');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Server] Serving built Static SPA files from dist');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI SD Copilot] Server running on http://localhost:${PORT}`);
  });
}

startServer();
