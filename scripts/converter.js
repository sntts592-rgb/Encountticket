import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_FILE_PATH = path.join(__dirname, '../src/data/tickets_raw.csv');
const JSON_OUTPUT_PATH = path.join(__dirname, '../src/data/tickets.json');

// Compliant CSV parser that handles double quotes and embedded commas correctly
function parseCSVLine(line) {
  const result = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes; // Toggle quotes mode
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

function convert() {
  console.log(`[Converter] Reading CSV from ${CSV_FILE_PATH}...`);
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`[Converter] Error: Raw CSV file not found at ${CSV_FILE_PATH}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    console.error('[Converter] Error: Empty CSV content');
    process.exit(1);
  }

  // Extract header row
  const headers = parseCSVLine(lines[0]);
  console.log(`[Converter] Found headers:`, headers);

  const tickets = [];

  for (let i = 1; i < lines.length; i++) {
    const rawFields = parseCSVLine(lines[i]);
    if (rawFields.length < 6) {
      // Skip or pad incomplete rows
      continue;
    }

    const [intent, category, exampleQueries, requiredInfo, troubleshootingSteps, assignment] = rawFields;

    // Normalize example queries: split by comma, remove extra quotes if any, trim
    const queries = exampleQueries
      .split(',')
      .map(q => q.replace(/^"/, '').replace(/"$/, '').trim())
      .filter(q => q.length > 0);

    // Normalize required info: split by comma, remove extra quotes, trim
    const reqInfoList = requiredInfo
      .split(',')
      .map(inf => inf.replace(/^"/, '').replace(/"$/, '').trim())
      .filter(inf => inf.length > 0 && inf !== 'None');

    // Normalize troubleshooting steps: split by '?' or '?'
    let steps = [];
    if (troubleshootingSteps.includes('?')) {
      steps = troubleshootingSteps
        .split('?')
        .map(step => step.trim())
        .filter(step => step.length > 0 && step !== '?');
    } else if (troubleshootingSteps.includes('?')) {
      steps = troubleshootingSteps
        .split('?')
        .map(step => step.trim())
        .filter(step => step.length > 0);
    } else {
      steps = [troubleshootingSteps.trim()];
    }

    tickets.push({
      id: `kb-${i}`,
      intent: intent || 'unknown',
      category: category || 'General',
      queries: queries.length > 0 ? queries : [intent.replace(/_/g, ' ')],
      requiredInfo: reqInfoList,
      steps: steps.length > 0 ? steps : ['Follow standard SD guidelines.'],
      assignment: assignment || 'SD Team',
      rawText: `${intent} ${category} ${queries.join(' ')} ${assignment}`.toLowerCase()
    });
  }

  // Ensure output directory exists
  const outputDir = path.dirname(JSON_OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(JSON_OUTPUT_PATH, JSON.stringify(tickets, null, 2), 'utf-8');
  console.log(`[Converter] Successfully converted ${tickets.length} records. Saved to ${JSON_OUTPUT_PATH}`);
}

convert();
