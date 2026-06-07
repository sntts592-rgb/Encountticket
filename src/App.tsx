import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Sparkles, 
  Cpu, 
  ArrowRight, 
  Clipboard, 
  Check, 
  RefreshCw, 
  Plus, 
  Database, 
  AlertTriangle, 
  Layers, 
  Users, 
  BookOpen, 
  HelpCircle,
  FileText,
  Mail,
  Send,
  Sliders,
  CheckSquare,
  Bookmark,
  Sun,
  Moon
} from 'lucide-react';
import { KBRecord, MatchResult, SynthesisResult, KBSstats } from './types';
import ReactMarkdown from 'react-markdown';

// Predefined Troublesome Sample Tickets representing complex real Service Desk encounters
const SAMPLE_TICKETS = [
  {
    title: "Guest WiFi Request for Site Audit",
    text: "Urgent request: We have a regional auditor visiting our Chicago office tomorrow morning who needs guest wifi access. Please set up a guest account for device 'iPad-Secure' starting 2026-06-08 until 2526-06-12.",
    intent: "wifi_guest_access"
  },
  {
    title: "High CPU Alert on Wintel DB Server",
    text: "Critical warning: High CPU utilization alarm triggered on server WUK-SQL-PROD-01. Average CPU usage is currently sitting at 98.7% for the last 15 minutes, causing query timeouts.",
    intent: "cpu_high_alert"
  },
  {
    title: "Sentinel Security Isolation Popup",
    text: "Agent Alert: SentinelOne security agent triggered a pop-up blockade on terminal NES202-348614 representing potential threat 'TPnet.exe'. User states they were clicking a shipping order invoice.",
    intent: "sentinel_popup_alert"
  },
  {
    title: "Minitab Installer Silent Failure",
    text: "SCCM support team help: The newly deployed Minitab v21.3 software fails silently when users trigger the installation from Software Center. It shows cache error index 1644 on machine LUK-LT-994.",
    intent: "minitab_installation"
  },
  {
    title: "AutoCAD LT Access Approval",
    text: "Need Autodesk license and download access for AutoCAD LT v2025 for new hire engineer Sarah Jenkins. VP approval is already attached to this ServiceNow workspace.",
    intent: "software_access"
  }
];

export default function App() {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Sync theme to root HTML element
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Input Ticket states
  const [ticketInput, setTicketInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [matchedResults, setMatchedResults] = useState<MatchResult[]>([]);
  
  // AI Synthesis states
  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  // Active view tabs: 'copilot' | 'explorer' | 'contribute'
  const [activeTab, setActiveTab] = useState<'copilot' | 'explorer' | 'contribute'>('copilot');

  // KB Dictionary states
  const [allKbRecords, setAllKbRecords] = useState<KBRecord[]>([]);
  const [kbFilter, setKbFilter] = useState('');
  const [kbCategory, setKbCategory] = useState('All');
  const [kbTeam, setKbTeam] = useState('All');
  const [stats, setStats] = useState<KBSstats | null>(null);
  const [loadingKB, setLoadingKB] = useState(false);

  // Dynamic ticket contributor form states
  const [newIntent, setNewIntent] = useState('');
  const [newCategory, setNewCategory] = useState('Network');
  const [newQueries, setNewQueries] = useState('');
  const [newReqInfo, setNewReqInfo] = useState('');
  const [newSteps, setNewSteps] = useState('');
  const [newAssignment, setNewAssignment] = useState('SD Team');
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Copied item flags
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedSteps, setCopiedSteps] = useState<number | null>(null);
  const [copiedTeam, setCopiedTeam] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  // Active Synthesis Tab state
  const [synthesisTab, setSynthesisTab] = useState<'report' | 'interactive' | 'email'>('report');

  // Load baseline statistics and database items
  useEffect(() => {
    fetchStats();
    loadAllRecords();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/kb/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.warn("Error loading stats:", e);
    }
  };

  const loadAllRecords = async () => {
    setLoadingKB(true);
    try {
      // Fetch directly from our new API endpoint to ensure full coverage of both cached 
      // and custom added Service Desk tickets, working perfectly on serverless Vercel
      const apiRes = await fetch('/api/kb/tickets');
      if (apiRes.ok) {
        const records = await apiRes.json();
        setAllKbRecords(records);
      } else {
        // Fallback to static JSON if api is not fully booted yet or in legacy dev offline modes
        const jsonRes = await fetch('/src/data/tickets.json');
        if (jsonRes.ok) {
          const records = await jsonRes.json();
          setAllKbRecords(records);
        }
      }
    } catch (e) {
      console.warn("Unable to fetch complete KB records, trying fallback", e);
      try {
        const jsonRes = await fetch('/src/data/tickets.json');
        if (jsonRes.ok) {
          const records = await jsonRes.json();
          setAllKbRecords(records);
        }
      } catch (fallbackErr) {
        console.error("All data fetch vectors failed:", fallbackErr);
      }
    } finally {
      setLoadingKB(false);
    }
  };

  // Triggers local matching engine on server (TF-IDF keyword score)
  const handleKBSearch = async (queryText: string) => {
    if (!queryText || queryText.trim().length === 0) {
      setMatchedResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/kb/search?q=${encodeURIComponent(queryText)}`);
      if (res.ok) {
        const data = await res.json();
        setMatchedResults(data.matches || []);
        
        // Auto-scroll or signal results are ready
        setSynthesisError(null);
      }
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setIsSearching(false);
    }
  };

  // Triggers AI Synthesis (combining raw description + top KB matches as pure sources of truth)
  const handleAISynthesis = async () => {
    if (!ticketInput || ticketInput.trim().length === 0) return;

    setIsSynthesizing(true);
    setSynthesisError(null);
    setSynthesis(null);

    try {
      const res = await fetch('/api/kb/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ticketDescription: ticketInput,
          matchedTickets: matchedResults
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSynthesis(data);
        setSynthesisTab('report');
      } else {
        const errData = await res.json();
        setSynthesisError(errData.error || 'Generative Synthesis request failed.');
      }
    } catch (e: any) {
      setSynthesisError(e.message || 'Error occurred during contextual prompt synthesis.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Submits a new dynamic KB ticket to our Node.js back-end repository
  const handleAddNewTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIntent || !newCategory || !newSteps) {
      setAddError('Intent, Category, and Troubleshooting Steps are required.');
      return;
    }

    setIsAdding(true);
    setAddSuccess(null);
    setAddError(null);

    const ticketPayload = {
      intent: newIntent,
      category: newCategory,
      queries: newQueries.split(',').map(x => x.trim()).filter(Boolean),
      requiredInfo: newReqInfo.split(',').map(x => x.trim()).filter(Boolean),
      steps: newSteps.split('\n').map(x => x.trim()).filter(Boolean),
      assignment: newAssignment
    };

    try {
      const res = await fetch('/api/kb/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ticketPayload)
      });

      if (res.ok) {
        setAddSuccess('Dynamic ticket successfully appended and committed to operational Knowledge base!');
        
        // Reset form
        setNewIntent('');
        setNewQueries('');
        setNewReqInfo('');
        setNewSteps('');
        setNewAssignment('SD Team');

        // Reload lists and stats
        fetchStats();
        loadAllRecords();
      } else {
        const errorMsg = await res.json();
        setAddError(errorMsg.error || 'Server rejected manual insertion.');
      }
    } catch (err: any) {
      setAddError(err.message || 'Connection breakdown.');
    } finally {
      setIsAdding(false);
    }
  };

  const copyToClipboard = (text: string, type: 'response' | 'team' | 'step' | 'report', idx?: number) => {
    navigator.clipboard.writeText(text);
    if (type === 'response') {
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    } else if (type === 'team') {
      setCopiedTeam(true);
      setTimeout(() => setCopiedTeam(false), 2000);
    } else if (type === 'step' && idx !== undefined) {
      setCopiedSteps(idx);
      setTimeout(() => setCopiedSteps(null), 1500);
    } else if (type === 'report') {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    }
  };

  // Filter full KB list
  const filteredKbRecords = allKbRecords.filter(record => {
    const textMatch = 
      record.intent.toLowerCase().includes(kbFilter.toLowerCase()) ||
      record.category.toLowerCase().includes(kbFilter.toLowerCase()) ||
      record.assignment.toLowerCase().includes(kbFilter.toLowerCase()) ||
      record.queries.some(q => q.toLowerCase().includes(kbFilter.toLowerCase())) ||
      record.steps.some(s => s.toLowerCase().includes(kbFilter.toLowerCase()));

    const catMatch = kbCategory === 'All' || record.category === kbCategory;
    const teamMatch = kbTeam === 'All' || record.assignment === kbTeam;

    return textMatch && catMatch && teamMatch;
  });

  // Unique lists for Filters in Explorer
  const uniqueCategories = stats?.categories.map(c => c.name) || ['Network', 'Messaging', 'Wintel', 'Asset Management', 'Azure', 'Endpoint Security'];
  const uniqueTeams = stats?.teams.map(t => t.name) || ['ITC - Network', 'Messaging Team', 'Wintel', 'Asset Team', 'Azure Team', 'ITC - Cyber Security', 'SCCM Team', 'SD Team'];

  // Robust markdown fallback report generator
  const getFallbackReport = (s: SynthesisResult) => {
    if (s.detailedReport && s.detailedReport.trim().length > 0) {
      return s.detailedReport;
    }
    
    const stepsList = s.steps && s.steps.length > 0 
      ? s.steps.map((st, i) => `${i + 1}. **${st}**`).join('\n\n')
      : "1. No standard troubleshooting steps configured.";

    const reqInfoList = s.requiredInfo && s.requiredInfo.length > 0 
      ? s.requiredInfo.map(info => `- **${info}**`).join('\n')
      : "- **All baseline deployment parameters are present**";

    return `As your AI Service Desk Copilot, I'm here to help you understand and resolve the "${ticketInput || 'Dispatched'}" ticket.

---

**Issue Category:** ${s.category || 'N/A'}

**Possible Intent:**
We aligned this incoming Service Desk alert to intent **${s.intent || 'generic_support_request'}**. ${s.synthesisExplanation || 'Contextual parameters mapped successfully.'}

**Required Information:**
To proceed efficiently, please gather the following details from the user:
${reqInfoList}

**Missing Information (from the initial ticket):**
The raw ticket is missing key technical details to resolve. Please ask the requester to verify or supply the missing info listed above.

**Basic Troubleshooting:**
1. Request the client perform a clean workstation reboot.
2. Verify connection state is live and standard tools are authenticated.
3. Advise the user to search the corporate software catalog/Software Center for standard versions.

**Detailed HOW TO Steps:**
${stepsList}

**Advanced Checks:**
1. Check standard installer setup logs or Event Viewer profiles for error codes.
2. Confirm the user has appropriate administrative rights on the device (verify installation rights).
3. Validate group policies, proxy status, or NAC/RADIUS checks if network/access issues persist.

**Assignment Team:**
- **Primary Assignment:** ${s.assignment || 'SD Team'}
- **Escalation (if applicable):** ITC - Cyber Security or Senior Level Support
`;
  };

  return (
    <div id="ai-sd-copilot-root" className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 font-sans selection:bg-indigo-100 antialiased flex flex-col transition-colors duration-200">
      
      {/* Visual Header / Brand Bar */}
      <header id="app-header" className="bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800 sticky top-0 z-30 shadow-xs transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white p-2.5 rounded-xl shadow-md cursor-pointer hover:rotate-12 transition-transform">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="font-sans font-bold text-lg tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                AI SD Copilot <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 px-1.5 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">v1.1</span>
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Service Desk Intelligent Layer</p>
            </div>
          </div>

          {/* Nav wrapper containing both navigation tabs and dark mode button toggle */}
          <div className="flex items-center gap-3">
            {/* Core Navigation Tabs */}
            <nav className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('copilot')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'copilot' 
                    ? 'bg-white text-indigo-700 dark:bg-slate-900 dark:text-indigo-400 shadow-xs' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                Copilot Engine
              </button>
              <button
                onClick={() => setActiveTab('explorer')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'explorer' 
                    ? 'bg-white text-indigo-700 dark:bg-slate-900 dark:text-indigo-400 shadow-xs' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                KB Browser ({allKbRecords.length || '227'})
              </button>
              <button
                onClick={() => setActiveTab('contribute')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'contribute' 
                    ? 'bg-white text-indigo-700 dark:bg-slate-900 dark:text-indigo-400 shadow-xs' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                Dynamic Add
              </button>
            </nav>

            {/* Bright/Dark Mode Toggle Button */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-705 md:inline-flex items-center justify-center cursor-pointer"
              title={isDarkMode ? "Switch to Bright Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-600" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        
        {/* Dynamic DB Insights Section */}
        <section id="stats-dashboard" className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 rounded-xl flex items-center gap-4 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">KB Repository size</p>
              <span className="text-xl font-bold font-sans text-slate-800 dark:text-white">{stats?.totalRecords || '227'} Indexed Cases</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 rounded-xl flex items-center gap-4 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 p-3 rounded-xl border border-amber-100 dark:border-amber-900">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Specialized Domains</p>
              <span className="text-xl font-bold font-sans text-slate-800 dark:text-white">{stats?.categories?.length || '6'} Core Categories</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 rounded-xl flex items-center gap-4 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Triage Assignments</p>
              <span className="text-xl font-bold font-sans text-slate-800 dark:text-white">{stats?.teams?.length || '8'} Active Teams</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 rounded-xl flex items-center gap-4 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-350 p-3 rounded-xl border border-slate-200 dark:border-slate-700 animate-soft-pulse">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Offline Cold-Start</p>
              <span className="text-xl font-bold font-sans text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                0ms Cache Latency
              </span>
            </div>
          </div>
        </section>

        {/* Dynamic Views Content (based on ActiveTab state) */}
        <div className="flex-1">

          {/* VIEW: COPILOT WORKSPACE */}
          {activeTab === 'copilot' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column (Ticket entry and matching) */}
              <div className="lg:col-span-6 flex flex-col gap-6">
                
                {/* Main Intake Form Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-xs overflow-hidden transition-colors duration-200">
                  <div className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
                    <h3 className="font-sans font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-600" />
                      Incoming Support Ticket encounter
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">Step 1: Intake</span>
                  </div>

                  <div className="p-5 flex flex-col gap-4">
                    
                    {/* Fast Presets helper */}
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2 font-semibold">Quick Test Presets (Service Desk cases):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {SAMPLE_TICKETS.map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setTicketInput(t.text);
                              handleKBSearch(t.text);
                            }}
                            className="bg-slate-100 hover:bg-indigo-55 dark:bg-slate-800/80 dark:hover:bg-indigo-950 text-slate-700 hover:text-indigo-800 dark:text-slate-300 dark:hover:text-indigo-200 px-2.5 py-1.5 text-xs rounded-lg font-medium border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-850 transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Bookmark className="h-3 w-3 inline opacity-70" />
                            {t.title}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="relative">
                      <label htmlFor="ticket-desc" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono tracking-wider">
                        Real-time Ticket Description / User Request Details
                      </label>
                      <textarea
                        id="ticket-desc"
                        value={ticketInput}
                        onChange={(e) => {
                          setTicketInput(e.target.value);
                          handleKBSearch(e.target.value);
                        }}
                        placeholder="Paste or type technical user encounter here (e.g. 'Printer VLAN configuration needed or Outlook cache archive is full' to see how the local search outputs alignments...)"
                        rows={6}
                        className="w-full bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100/50 dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-950 border border-slate-200 dark:border-slate-800/80 focus:border-indigo-500 rounded-xl p-3.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all font-sans font-medium leading-relaxed resize-y"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => {
                          setTicketInput('');
                          setMatchedResults([]);
                          setSynthesis(null);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Clear Workspace
                      </button>

                      <button
                        onClick={handleAISynthesis}
                        disabled={isSynthesizing || !ticketInput}
                        className={`px-4 py-2.5 text-xs font-semibold rounded-xl text-white transition-all shadow-md focus:outline-hidden flex items-center gap-1.5 cursor-pointer ${
                          !ticketInput 
                            ? 'bg-slate-300 dark:bg-slate-850 dark:text-slate-500 cursor-not-allowed opacity-60 shadow-none' 
                            : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
                        }`}
                      >
                        {isSynthesizing ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Synthesizing solution...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            Synthesize matching KB solution
                          </>
                        )}
                      </button>
                    </div>

                  </div>
                </div>

                {/* Local search matches and Confidence Scores Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-xs flex-1 flex flex-col transition-colors duration-200">
                  <div className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
                    <h3 className="font-sans font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Search className="h-4 w-4 text-emerald-600" />
                      Semantic search & confidence matching
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">Step 2: Alignment</span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-start">
                    {/* Searching status */}
                    {isSearching && (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <RefreshCw className="h-6 w-6 text-indigo-500 animate-spin" />
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Running local Token-Overlap and fuzzy bigram indices...</p>
                      </div>
                    )}

                    {/* No input fallback */}
                    {!isSearching && ticketInput.trim().length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full text-slate-400 dark:text-slate-500 mb-3 border border-slate-200 dark:border-slate-700">
                          <HelpCircle className="h-6 w-6" />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium max-w-xs">Enter a ticket description or choose any quick preset above to reveal matching solutions indexed in the Knowledge Base.</p>
                      </div>
                    )}

                    {/* No results match (Graceful Fallback Case) */}
                    {!isSearching && ticketInput.trim().length > 0 && matchedResults.length === 0 && (
                      <div className="bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold text-red-800 dark:text-red-300">No matching ticket records found in KB (Confidence 0%)</h4>
                          <p className="text-xs text-red-700 dark:text-red-400 mt-1 leading-relaxed">
                            This description does not align with your 625 historical tickets. That is expected! 
                            Click the **"Synthesize matching KB solution"** button on the right to let Gemini process this as a **new category** and build the solution scratchpad dynamically.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Has results but low confidence warning */}
                    {!isSearching && matchedResults.length > 0 && matchedResults[0].confidence < 40 && (
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3.5 mb-4 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                        <div>
                          <span className="font-bold">Low Similarity Score alert:</span> Sourced matches fall below 40% matching. Sourced operations might be slightly misaligned. Sourcing Gemini to combine these with caution.
                        </div>
                      </div>
                    )}

                    {/* List of matched results */}
                    {!isSearching && matchedResults.length > 0 && (
                      <div className="flex flex-col gap-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Top KB search results aligned:</span>
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold">Matched {matchedResults.length} cases</span>
                        </div>

                        {matchedResults.map((match, index) => {
                          const t = match.ticket;
                          const confidence = match.confidence;
                          
                          // Badge color
                          let badgeBg = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50';
                          if (confidence >= 80) badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50';
                          else if (confidence >= 50) badgeBg = 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/50';
                          else if (confidence >= 25) badgeBg = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50';

                          return (
                            <div key={t.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all shadow-2xs hover:shadow-xs group">
                              <div className="flex items-start justify-between gap-2.5">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md text-[10px] font-medium border border-slate-200 dark:border-slate-700">
                                      {t.category}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                                      {t.intent}
                                    </span>
                                  </div>
                                  <h3 className="text-xs text-slate-800 dark:text-slate-200 font-bold mt-1.5 leading-relaxed">
                                    Example queries: "{t.queries.join(', ')}"
                                  </h3>
                                </div>

                                <div className={`text-center py-1 px-2.5 rounded-xl border text-xs font-semibold whitespace-nowrap ${badgeBg}`}>
                                  <p className="text-[9px] uppercase tracking-wider block leading-none mb-0.5 opacity-85">Match</p>
                                  {confidence}%
                                </div>
                              </div>

                              {/* Steps Preview */}
                              <div className="mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-2 text-[11px] text-slate-600 dark:text-slate-300 rounded-lg group-hover:bg-slate-50 dark:group-hover:bg-slate-950 transition-colors">
                                <span className="font-semibold text-slate-700 dark:text-slate-200 block mb-1">Troubleshooting Sourced:</span>
                                <ul className="list-disc list-inside space-y-1">
                                  {t.steps.slice(0, 3).map((step, sIdx) => (
                                    <li key={sIdx} className="truncate">{step}</li>
                                  ))}
                                  {t.steps.length > 3 && (
                                    <li className="list-none text-slate-400 dark:text-slate-500 text-[10px] pl-3">+{t.steps.length - 3} more troubleshooting steps</li>
                                  )}
                                </ul>
                              </div>

                              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                                <span>Required: {t.requiredInfo.length > 0 ? t.requiredInfo.join(', ') : 'None'}</span>
                                <span className="text-indigo-600 font-bold">Assign to: {t.assignment}</span>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                </div>

              </div>

              {/* Right Column (Intelligent Synthesis Output) */}
              <div className="lg:col-span-6 flex flex-col gap-6">
                
                {/* Synthesis Pad Card */}
                <div id="ai-synthesis" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col min-h-[500px] transition-colors duration-200">
                  <div className="bg-gradient-to-tr from-indigo-900 to-indigo-955 border-b border-indigo-700 dark:border-indigo-900 p-4 flex items-center justify-between text-white">
                    <h3 className="font-sans font-semibold text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      Intelligent Synthesis Engine (Gemini Pro)
                    </h3>
                    <span className="text-[10px] bg-white/10 text-slate-300 font-mono px-2 py-0.5 rounded border border-white/10">Active Output</span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-start">
                    
                    {/* Error container */}
                    {synthesisError && (
                      <div className="bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 text-xs text-red-800 dark:text-red-300 mb-4 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Synthesis Error:</span> {synthesisError}
                        </div>
                      </div>
                    )}

                    {/* Initial State / Idle state */}
                    {!isSynthesizing && !synthesis && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-4">
                        <div className="bg-indigo-50 dark:bg-indigo-955/20 p-4 rounded-full text-indigo-600 dark:text-indigo-400 mb-4 animate-soft-pulse border border-indigo-100 dark:border-indigo-900/60">
                          <Cpu className="h-7 w-7" />
                        </div>
                        <h4 className="font-sans font-bold text-slate-800 dark:text-slate-100 text-sm">Contextual Synthesis Platform</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-sm leading-relaxed">
                          Click **"Synthesize matching KB solution"** to summon the Gemini model. It will use the top matched KB solutions as historical anchors while filling details, parsing gaps, and drafting standard corporate operating procedures.
                        </p>
                      </div>
                    )}

                    {/* Loading State */}
                    {isSynthesizing && (
                      <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
                        <Sparkles className="h-9 w-9 text-indigo-600 dark:text-indigo-400 animate-spin mb-4" />
                        <h4 className="font-sans font-semibold text-sm text-slate-800 dark:text-slate-100">Summarizing and processing templates...</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-xs px-4">
                          Analyzing ticket keywords, parsing alignment logs and generating structured support checklist variables...
                        </p>
                      </div>
                    )}

                    {/* Succeeded Result Panel */}
                    {!isSynthesizing && synthesis && (
                      <div className="flex flex-col gap-6">
                        
                        {/* Tab Switcher */}
                        <div className="flex border-b border-slate-200 dark:border-slate-800 pb-px">
                          <button
                            id="tab-synthesis-report"
                            onClick={() => setSynthesisTab('report')}
                            className={`flex-1 pb-3 text-xs font-bold border-b-2 text-center transition-all cursor-pointer ${
                              synthesisTab === 'report'
                                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-400 font-extrabold'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            Detailed Analyst Report
                          </button>
                          <button
                            id="tab-synthesis-interactive"
                            onClick={() => setSynthesisTab('interactive')}
                            className={`flex-1 pb-3 text-xs font-bold border-b-2 text-center transition-all cursor-pointer ${
                              synthesisTab === 'interactive'
                                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-400 font-extrabold'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            Interactive Step Tracker
                          </button>
                          <button
                            id="tab-synthesis-email"
                            onClick={() => setSynthesisTab('email')}
                            className={`flex-1 pb-3 text-xs font-bold border-b-2 text-center transition-all cursor-pointer ${
                              synthesisTab === 'email'
                                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-400 font-extrabold'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            Email Template
                          </button>
                        </div>

                        {/* TAB 1: DETAILED REPORT VIEW (Default tab, showing the exhaustive complete Markdown report) */}
                        {synthesisTab === 'report' && (
                          <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold font-semibold">EXHAUSTIVE COPILOT ANALYSIS</span>
                              <button
                                onClick={() => copyToClipboard(getFallbackReport(synthesis), 'report')}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-[10px] px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                {copiedReport ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                                {copiedReport ? 'Copied Full Report!' : 'Copy Entire Report'}
                              </button>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 overflow-y-auto max-h-[600px] shadow-sm">
                              <div className="markdown-body max-w-none text-slate-700 dark:text-slate-300">
                                <ReactMarkdown>{getFallbackReport(synthesis)}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* TAB 2: INTERACTIVE STEP CHECKLIST TRACKER */}
                        {synthesisTab === 'interactive' && (
                          <div className="flex flex-col gap-6">
                            
                            {/* Categorization & Assignment team row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-3.5">
                                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block uppercase font-bold tracking-wider">Categorization Classification</span>
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">Category: <span className="text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-950 border border-indigo-200 dark:border-indigo-800/80 px-1.5 py-0.5 rounded-md">{synthesis.category}</span></p>
                                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1.5">Intent: {synthesis.intent}</p>
                              </div>

                              <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl p-3.5 flex flex-col justify-between">
                                <div>
                                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block uppercase font-bold tracking-wider">Triage Team Routing</span>
                                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-1">{synthesis.assignment}</p>
                                </div>
                                <button
                                  onClick={() => copyToClipboard(synthesis.assignment, 'team')}
                                  className="self-end text-[10px] text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 font-semibold flex items-center gap-1 mt-2 cursor-pointer"
                                >
                                  {copiedTeam ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                                  {copiedTeam ? 'Copied Routing!' : 'Copy Team Name'}
                                </button>
                              </div>
                            </div>

                            {/* Gap Sourcing: Critical Required Info (missing in ticket!) */}
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/40">
                              <div className="bg-amber-50/60 dark:bg-amber-955/20 p-3 border-b border-amber-250 dark:border-amber-900/50 flex items-center justify-between">
                                <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.5} />
                                  Missing Technical details detected
                                </h4>
                                <span className="text-[10.5px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-500 font-mono px-1.5 py-0.5 rounded">Action Item</span>
                              </div>
                              <div className="p-4 bg-amber-50/20 dark:bg-transparent">
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3.5 leading-relaxed">
                                  The following variables were not found in the raw user ticket, but are required by our corporate standard to act. Please request these from the user:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {synthesis.requiredInfo.length === 0 ? (
                                    <span className="text-xs text-slate-400 dark:text-slate-500 italic">No missing details! All required parameters supplied.</span>
                                  ) : (
                                    synthesis.requiredInfo.map((field, idx) => (
                                      <span key={idx} className="bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 px-2.5 py-1 text-xs rounded-lg font-mono font-semibold shadow-2xs">
                                        {field}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* High Craft Troubleshooting Checklist */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                                  <CheckSquare className="h-4 w-4 text-indigo-600" />
                                  Resolution Troubleshooting Steps
                                </h4>
                                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">{synthesis.steps.length} steps Sourced</span>
                              </div>
                              <div className="space-y-2">
                                {synthesis.steps.map((step, idx) => (
                                  <div key={idx} className="bg-slate-50 dark:bg-slate-900 hover:bg-slate-100/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-805 rounded-xl p-3 flex items-start justify-between gap-3 group transition-colors">
                                    <div className="flex items-start gap-2.5">
                                      <span className="bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 font-mono">
                                        {idx + 1}
                                      </span>
                                      <p className="text-xs text-slate-700 dark:text-slate-250 leading-relaxed font-semibold">{step}</p>
                                    </div>
                                    <button
                                      onClick={() => copyToClipboard(step, 'step', idx)}
                                      className="text-slate-400 dark:text-slate-550 hover:text-slate-700 dark:hover:text-slate-300 p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-755 transition-colors cursor-pointer flex-shrink-0 md:opacity-0 group-hover:opacity-100"
                                      title="Copy troubleshooting step text"
                                    >
                                      {copiedSteps === idx ? <Check className="h-3 w-3 text-emerald-600" /> : <Clipboard className="h-3 w-3" />}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Synthesis explanation logic */}
                            <div className="bg-slate-50 dark:bg-slate-900 hover:bg-slate-100/50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors">
                              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider block font-bold mb-1.5">Sourcing Alignment logic from Copilot:</span>
                              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed italic">
                                "{synthesis.synthesisExplanation}"
                              </p>
                            </div>
                          </div>
                        )}

                        {/* TAB 3: COPILOT EMAIL RESPONSE TEMPLATE */}
                        {synthesisTab === 'email' && (
                          <div className="border border-indigo-200 dark:border-indigo-900/60 rounded-xl overflow-hidden bg-indigo-50/20 dark:bg-indigo-955/10">
                            <div className="bg-indigo-50 dark:bg-indigo-955/30 p-3.5 border-b border-indigo-150 dark:border-indigo-900/50 flex items-center justify-between">
                              <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                                <Mail className="h-4 w-4 text-indigo-700" />
                                Polished User Response Email Template
                              </h4>
                              <button
                                onClick={() => copyToClipboard(synthesis.suggestedResponse, 'response')}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-[10px] px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                {copiedResponse ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                                {copiedResponse ? 'Copied Response!' : 'Copy Email'}
                              </button>
                            </div>
                            <div className="p-4 bg-white dark:bg-slate-900">
                              <pre className="text-slate-700 dark:text-slate-200 text-xs font-mono leading-relaxed whitespace-pre-wrap select-all p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium max-h-72 overflow-y-auto">
                                {synthesis.suggestedResponse}
                              </pre>
                              <p className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-2 italic text-right font-mono">
                                *Includes placeholder markers dynamically populated based on identified missing info.
                              </p>
                            </div>
                          </div>
                        )}

                      </div>
                    )}

                  </div>
                </div>

              </div>

            </div>
          )}


          {/* VIEW: KNOWLEDGE BASE EXPLORER */}
          {activeTab === 'explorer' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors duration-200">
              <div className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-sans font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Database className="h-4 w-4 text-indigo-600" />
                    Operational Service Desk Knowledge Base
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Explore, search, and analyze your 625 structured historical tickets in the static high-performance cache.</p>
                </div>
                
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs rounded-xl font-mono font-semibold self-start sm:self-auto">
                  Loaded {filteredKbRecords.length} of {allKbRecords.length} tickets
                </span>
              </div>

              {/* Filtering Controls */}
              <div className="p-4 bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-4">
                
                {/* Search query field */}
                <div className="sm:col-span-2 relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={kbFilter}
                    onChange={(e) => setKbFilter(e.target.value)}
                    placeholder="Search queries, intents, symptoms, or teams..."
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-hidden text-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* Category Filter */}
                <div>
                  <select
                    value={kbCategory}
                    onChange={(e) => setKbCategory(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs focus:outline-hidden text-slate-800 dark:text-slate-200 font-medium cursor-pointer"
                  >
                    <option value="All">All Categories</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Assignment Team Filter */}
                <div>
                  <select
                    value={kbTeam}
                    onChange={(e) => setKbTeam(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs focus:outline-hidden text-slate-800 dark:text-slate-200 font-medium cursor-pointer"
                  >
                    <option value="All">All Assignment Teams</option>
                    {uniqueTeams.map(team => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* List table or Grid */}
              <div className="p-5">
                {loadingKB ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Streaming records from tickets.json database cache...</p>
                  </div>
                ) : filteredKbRecords.length === 0 ? (
                  <div className="py-20 text-center">
                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full text-slate-400 dark:text-slate-500 mb-3 border border-slate-200 dark:border-slate-705 inline-block">
                      <Search className="h-6 w-6" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium font-mono">No KB tickets found matching your search. Try other keywords.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredKbRecords.map(record => (
                      <div key={record.id} className="bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 hover:border-indigo-300 dark:hover:border-indigo-805 transition-all shadow-2xs">
                        <div className="flex justify-between items-start gap-2.5">
                          <div>
                            <span className="text-[10px] bg-indigo-50 hover:bg-slate-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-md font-semibold border border-indigo-100 dark:border-indigo-900/30 font-mono">
                              {record.category}
                            </span>
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-2 font-mono">
                              Intent: {record.intent}
                            </h4>
                          </div>
                          
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded font-mono font-bold whitespace-nowrap">
                            {record.id}
                          </span>
                        </div>

                        {/* Example questions / user symptoms */}
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">Keywords/Examples:</span>
                          <p className="italic mt-0.5 font-medium leading-relaxed bg-slate-50 dark:bg-slate-950/60 p-2 border border-slate-200 dark:border-slate-800 rounded-lg dark:text-slate-300">
                            "{record.queries.join(', ')}"
                          </p>
                        </div>

                        {/* Troubleshooting Steps List */}
                        <div className="mt-3.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Service Desk Solution Blueprint:</span>
                          <ol className="list-decimal list-inside space-y-1.5 mt-1 text-[11px] text-slate-600 dark:text-slate-350 font-medium bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-100 dark:border-slate-805">
                            {record.steps.map((step, idx) => (
                              <li key={idx} className="leading-relaxed">{step}</li>
                            ))}
                          </ol>
                        </div>

                        {/* Required params and Assignment */}
                        <div className="mt-3 bg-slate-50/50 dark:bg-slate-950/30 p-2 border border-slate-250/50 dark:border-slate-805 rounded-lg flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          <div>
                            <span className="font-semibold text-slate-750 dark:text-slate-300">Sourced Required Info:</span> {record.requiredInfo.length > 0 ? record.requiredInfo.join(', ') : 'None'}
                          </div>
                          <div className="text-indigo-600 dark:text-indigo-400 font-bold">{record.assignment}</div>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}


          {/* VIEW: CONTRIBUTORY MANUAL FORM ENTRY */}
          {activeTab === 'contribute' && (
            <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors duration-200">
              <div className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 p-4">
                <h3 className="font-sans font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  Contribute New Service Desk Solution
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Discovered a new technical workaround or troubleshooting pathway? Save it here to let the Copilot learn and synthesize it instantly.</p>
              </div>

              <form onSubmit={handleAddNewTicket} className="p-5 flex flex-col gap-4">
                {addSuccess && (
                  <div className="bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-4 text-xs text-emerald-800 dark:text-emerald-300 font-semibold mb-2 flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                    {addSuccess}
                  </div>
                )}

                {addError && (
                  <div className="bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 text-xs text-red-800 dark:text-red-350 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    {addError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="new-intent" className="block text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Categorized Intent (lowercase_snake)</label>
                    <input
                      id="new-intent"
                      type="text"
                      required
                      value={newIntent}
                      onChange={(e) => setNewIntent(e.target.value)}
                      placeholder="e.g. database_backup_failure"
                      className="w-full bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/50 dark:hover:bg-slate-900/55 focus:bg-white dark:focus:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:outline-hidden rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="new-category" className="block text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Business Domain Category</label>
                    <select
                      id="new-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:outline-hidden rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 font-medium cursor-pointer"
                    >
                      <option value="Network">Network</option>
                      <option value="Messaging">Messaging</option>
                      <option value="Wintel">Wintel</option>
                      <option value="AD">AD/Credential Management</option>
                      <option value="SCCM">SCCM Team</option>
                      <option value="Endpoint Security">Endpoint Security (Cyber)</option>
                      <option value="Asset Management">Asset Management</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="new-queries" className="block text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Example Queries / Common Symptoms (Comma-separated)</label>
                  <input
                    id="new-queries"
                    type="text"
                    value={newQueries}
                    onChange={(e) => setNewQueries(e.target.value)}
                    placeholder="e.g. backup failed, database backup issues, restore lost database"
                    className="w-full bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/50 dark:hover:bg-slate-900/55 focus:bg-white dark:focus:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:outline-hidden rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="new-req-info" className="block text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Required Information Needed to Act (Comma-separated)</label>
                  <input
                    id="new-req-info"
                    type="text"
                    value={newReqInfo}
                    onChange={(e) => setNewReqInfo(e.target.value)}
                    placeholder="e.g. Server Name, DB Name, Error Log, Backup Time"
                    className="w-full bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/50 dark:hover:bg-slate-900/55 focus:bg-white dark:focus:bg-slate-950 border border-slate-200 dark:border-slate-805 focus:border-indigo-500 focus:outline-hidden rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="new-steps" className="block text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Troubleshooting Steps / Settle Blueprint (one step per line)</label>
                  <textarea
                    id="new-steps"
                    required
                    rows={4}
                    value={newSteps}
                    onChange={(e) => setNewSteps(e.target.value)}
                    placeholder="Verify authorization rules&#10;Access database server terminal and query backup status&#10;Restore target folder to last clean backup&#10;Trigger verification test and notify requester"
                    className="w-full bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/50 dark:hover:bg-slate-900/55 focus:bg-white dark:focus:bg-slate-955 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:outline-hidden rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-150 font-semibold leading-relaxed"
                  />
                </div>

                <div>
                   <label htmlFor="new-assignment" className="block text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Target Assignment Team Routing Group</label>
                  <input
                    id="new-assignment"
                    type="text"
                    value={newAssignment}
                    onChange={(e) => setNewAssignment(e.target.value)}
                    placeholder="e.g. Wintel, ITC - Network, Messaging Team"
                    className="w-full bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/50 dark:hover:bg-slate-900/55 focus:bg-white dark:focus:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:outline-hidden rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAdding}
                  className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white py-2.5 rounded-xl text-xs font-semibold shadow-md transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isAdding ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving to Database cache...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Authorized & Publish into Knowledge Base
                    </>
                  )}
                </button>
              </form>

            </div>
          )}

        </div>

      </main>

      {/* Humble Footer */}
      <footer id="app-footer-info" className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-808 py-6 mt-12 text-center text-xs text-slate-400 dark:text-slate-500 font-mono transition-colors duration-200">
        <p>AI SD Copilot • Sourced from 625 Service Desk Ticket Encounters</p>
        <p className="mt-1">Powered by Google Gemini 3.5 & Ultra-fast Memory Search • Safe Serverless Cold Starts</p>
      </footer>

    </div>
  );
}
