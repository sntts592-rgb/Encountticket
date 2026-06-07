import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { searchKB, KBRecord } from '../src/lib/search.js';

// Initialize Express App
const app = express();

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
      console.log(`[Vercel Serverless] Loading existing processed knowledge base: ${JSON_FILE_PATH}`);
      const data = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
      kbRecords = JSON.parse(data);
    } else {
      console.log(`[Vercel Serverless] Processed KB not found. Generating from raw CSV...`);
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
        
        // Write it if possible (will fail or be ignored in read-only Vercel environment, but we catch gracefully)
        try {
          const outputDir = path.dirname(JSON_FILE_PATH);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(kbRecords, null, 2), 'utf-8');
        } catch (writeErr) {
          console.warn(`[Vercel Serverless] Warning: Could not write processed JSON to read-only filesystem:`, writeErr);
        }
        console.log(`[Vercel Serverless] Sourced and cached ${kbRecords.length} records.`);
      } else {
        console.error(`[Vercel Serverless] Warning: Raw CSV file not found at ${CSV_FILE_PATH}`);
        kbRecords = [];
      }
    }
  } catch (error) {
    console.error(`[Vercel Serverless] Error initializing KB:`, error);
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
      throw new Error('GEMINI_API_KEY environment variable is not defined. Please configure Vercel Environment Variables.');
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
    const systemPrompt = `You are "AI SD Copilot," an elite Service Desk Copilot. 
Your primary directive: Settle incoming technical Service Desk tickets with absolute accuracy.

We have searched our historical Knowledge Base (KB) and provided you with the top KB results. Here is your strict handbook:
1. Treat "Internal KB Results" as the absolute primary source of truth. Sourced intents, categories, and assignment teams MUST match closely unless there's zero correlation.
2. Sift through the user's description. If the KB matches, construct the solution around the pre-vetted KB steps.
3. IN FILLING MISSING INFO: Be extremely sharp at detecting details that are required but missing from the ticket description (e.g. if the KB specifies: "Device, Switch IP, Port", and the agent description only tells us "switch port config needed", immediately highlight "Switch IP" and "Port Number" under Required Info).
4. GAP RECOVERY: Intelligently supplement simple standard technical instructions if the sourced KB is generic, but prioritize standard IT team operating procedure (e.g. if dealing with SentinelOne alerts, ensure they are checked in SentinelOne console and tamper protection is verified).
5. Always generate a courteous, professional and direct markdown template email response that the agent can immediately copy and send to the requester.`;

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
            suggestedResponse: { type: Type.STRING, description: 'Formatted polite email or chat message template for the user with variables like [User Name] or [Device Name] so the Service Desk agent can copy-paste.' }
          },
          required: ['category', 'intent', 'requiredInfo', 'steps', 'assignment', 'synthesisExplanation', 'suggestedResponse']
        }
      }
    });

    const parsedResponse = JSON.parse(response.text?.trim() || '{}');
    res.json(parsedResponse);
  } catch (err: any) {
    console.error(`[Vercel Serverless] Synthesis error:`, err);
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

    kbRecords.unshift(newRecord);

    try {
      // Save to cache asynchronously so it survives hot-reloads (if directory is writeable, otherwise fails silently)
      fs.writeFile(JSON_FILE_PATH, JSON.stringify(kbRecords, null, 2), 'utf-8', (err) => {
        if (err) console.error(`[Vercel Serverless] Error saving new ticket contribution to disk:`, err);
      });
    } catch (saveErr) {
      console.warn(`[Vercel Serverless] Ignored caching write inside read-only environments:`, saveErr);
    }

    res.json({
      success: true,
      message: 'Service Desk Ticket successfully appended to Local Knowledge Base!',
      ticket: newRecord
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export the Express App for Vercel Serverless Function entry point
export default app;
