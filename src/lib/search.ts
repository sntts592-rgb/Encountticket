// Search and matching algorithm for Service Desk Knowledge Base (KB)
export interface KBRecord {
  id: string;
  intent: string;
  category: string;
  queries: string[];
  requiredInfo: string[];
  steps: string[];
  assignment: string;
  rawText: string;
}

export interface MatchResult {
  ticket: KBRecord;
  score: number; // 0 to 1
  confidence: number; // 0% to 100%
}

// Simple English stemmer/helper to improve matching of variations (e.g. "working", "works" -> "work")
function stemWord(word: string): string {
  let w = word.toLowerCase().trim();
  if (w.length <= 3) return w;
  if (w.endsWith('ing')) return w.slice(0, -3);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  if (w.endsWith('ed')) return w.slice(0, -2);
  if (w.endsWith('er')) return w.slice(0, -2);
  return w;
}

// Tokenize text into normalized stems of words
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1)
    .map(stemWord);
}

/**
 * Searches the Knowledge Base for the most relevant historical tickets.
 * Computes a weighted confidence score.
 */
export function searchKB(query: string, kbRecords: KBRecord[], limit = 3): MatchResult[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase().trim();

  const results: MatchResult[] = kbRecords.map(record => {
    let score = 0;

    // 1. Exact phrase matches in example queries
    let exactPhraseMatchCount = 0;
    record.queries.forEach(exampleQuery => {
      const eqLower = exampleQuery.toLowerCase();
      if (queryLower.includes(eqLower) || eqLower.includes(queryLower)) {
        exactPhraseMatchCount += 1.5;
      }
    });

    // 2. Token overlap score (how many words match)
    const recordTokens = tokenize(record.rawText);
    let overlapCount = 0;
    const queryStemSet = new Set(queryTokens);
    
    // Count matches
    recordTokens.forEach(token => {
      if (queryStemSet.has(token)) {
        overlapCount += 1.0;
      }
    });

    // Calculate Jaccard Similarity on tokens
    const unionSize = new Set([...queryTokens, ...recordTokens]).size;
    const jaccard = unionSize > 0 ? overlapCount / unionSize : 0;

    // Weight allocations:
    // Jaccard similarity contributes heavily
    // Exact phrase match gives a significant boost
    score = jaccard * 0.6 + (exactPhraseMatchCount > 0 ? 0.4 : 0);

    // Give boost for matching the category or intent exactly
    const intentTokens = tokenize(record.intent);
    const categoryTokens = tokenize(record.category);
    
    let labelMatch = 0;
    intentTokens.forEach(t => { if (queryStemSet.has(t)) labelMatch += 0.15; });
    categoryTokens.forEach(t => { if (queryStemSet.has(t)) labelMatch += 0.1; });
    score = Math.min(1.0, score + labelMatch);

    // Convert score to a beautifully calibrated confidence interval (0 to 100)
    // Low similarities shouldn't look high, high ones should be solid
    let confidence = 0;
    if (score > 0.05) {
      // Map 0.05 - 1.0 to 12% - 98%
      confidence = Math.round(15 + (score * 83));
    }
    confidence = Math.min(100, Math.max(0, confidence));

    return {
      ticket: record,
      score,
      confidence
    };
  });

  // Filter records with some minimum relevance threshold, sorted descending
  return results
    .filter(res => res.confidence > 5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}
