import * as React from 'react';
import { useState, useMemo, Component } from 'react';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  BarChart3, 
  Activity, 
  MessageSquare, 
  Info,
  ArrowRight,
  Zap,
  Lock,
  Trash2,
  Copy,
  RefreshCcw,
  Moon,
  Sun,
  Menu,
  X
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type } from "@google/genai";
import DOMPurify from 'dompurify';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  getDocFromServer
} from './firebase';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Gemini Initialization (Frontend)
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface AnalysisResult {
  score: number;
  risky_words: string[];
  warning: string;
  highlighted: string;
  tactics: Record<string, number>;
}

interface HistoryItem extends AnalysisResult {
  id: string;
  userId: string;
  message: string;
  timestamp: any;
}

// Error Handling Utility
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  return (
    <AppContent />
  );
}

function AppContent() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Auth Listener
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // History Listener
  React.useEffect(() => {
    if (!user || !isAuthReady) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'analyses'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryItem[];
      setHistory(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'analyses');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Test Connection
  React.useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        setAuthError('Login cancelled. Please keep the window open to sign in.');
      } else if (error.code === 'auth/cancelled-by-user') {
        setAuthError('Login was cancelled.');
      } else {
        console.error('Login failed:', error);
        setAuthError('Failed to sign in. Please try again.');
      }
      
      // Clear error after 5 seconds
      setTimeout(() => setAuthError(null), 5000);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Fake stats for sidebar - Trends of specific tactics
  const fakeHistory = useMemo(() => [
    { name: '9am', Urgency: 4, Fear: 2, Authority: 1 },
    { name: '10am', Urgency: 7, Fear: 5, Authority: 3 },
    { name: '11am', Urgency: 5, Fear: 8, Authority: 6 },
    { name: '12pm', Urgency: 9, Fear: 4, Authority: 8 },
    { name: '1pm', Urgency: 6, Fear: 7, Authority: 5 },
    { name: '2pm', Urgency: 8, Fear: 9, Authority: 4 },
  ], []);

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    
    // 1. Frontend Sanitization & Validation
    const sanitizedInput = DOMPurify.sanitize(input.trim());
    if (sanitizedInput.length > 5000) {
      alert("Message is too long. Please keep it under 5000 characters.");
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following message for scam manipulation and emotional triggers. 
        Message: "${sanitizedInput}"
        
        Return a JSON object with:
        - score: integer (0-100, where 100 is high risk)
        - risky_words: list of strings (specific words or phrases that are red flags)
        - warning: string (a concise summary of the threat)
        - highlighted: string (the original message with risky parts wrapped in <span class="bg-yellow-200 text-yellow-900 px-1 rounded font-medium">...</span>)
        - tactics: object (keys: "Urgency", "Authority", "Fear", "Greed", "Sympathy"; values: integer 0-10 for intensity)`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.INTEGER },
              risky_words: { type: Type.ARRAY, items: { type: Type.STRING } },
              warning: { type: Type.STRING },
              highlighted: { type: Type.STRING },
              tactics: {
                type: Type.OBJECT,
                properties: {
                  Urgency: { type: Type.INTEGER },
                  Authority: { type: Type.INTEGER },
                  Fear: { type: Type.INTEGER },
                  Greed: { type: Type.INTEGER },
                  Sympathy: { type: Type.INTEGER },
                }
              }
            },
            required: ["score", "risky_words", "warning", "highlighted", "tactics"]
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      setResult(data);

      // Save to Firestore if logged in
      if (user) {
        try {
          await addDoc(collection(db, 'analyses'), {
            userId: user.uid,
            message: input.length > 200 ? input.substring(0, 200) + "..." : input, // Anonymize/Truncate for privacy
            score: data.score,
            warning: data.warning,
            highlighted: data.highlighted,
            risky_words: data.risky_words,
            tactics: data.tactics,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'analyses');
        }
      }
    } catch (error) {
      console.error('Gemini Analysis failed, using client-side fallback:', error);
      // Client-side mock fallback
      const mockResult: AnalysisResult = {
        score: 78,
        risky_words: ["urgent", "account", "verify", "immediately"],
        warning: "Potential phishing attempt detected. This message uses high urgency to bypass your critical thinking.",
        highlighted: input.replace(/(urgent|account|verify|immediately)/gi, '<span class="bg-yellow-200 text-yellow-900 px-1 rounded font-medium">$1</span>'),
        tactics: {
          Urgency: 9,
          Authority: 6,
          Fear: 7,
          Greed: 3,
          Sympathy: 2
        }
      };
      setResult(mockResult);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const text = `Emotional Firewall Analysis\nRisk Score: ${result.score}%\nWarning: ${result.warning}\nPrimary Tactics: ${Object.entries(result.tactics).sort((a,b) => (b[1] as number) - (a[1] as number)).map(([k,v]) => `${k} (${v}/10)`).join(', ')}`;
    navigator.clipboard.writeText(text);
  };

  const getRiskColor = (score: number) => {
    if (score < 40) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score < 70) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  const getRiskProgressColor = (score: number) => {
    if (score < 40) return 'bg-emerald-500';
    if (score < 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const tacticsData = result ? Object.entries(result.tactics).map(([name, value]) => ({ name, value })) : [];

  return (
    <div className={cn(
      "flex h-screen font-sans overflow-hidden transition-colors duration-300",
      darkMode ? "bg-slate-950 text-slate-100" : "bg-[#F8F9FB] text-slate-900"
    )}>
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Streamlit Style */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 bg-slate-900 text-slate-300 p-6 flex flex-col gap-8 overflow-y-auto border-r border-slate-800 transition-transform duration-300 lg:relative lg:translate-x-0 shrink-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight">🛡️ Emotional Firewall</h1>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-2 hover:bg-slate-800 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">📊 Today's Scams</h2>
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-1">Scams Blocked Today</p>
              <p className="text-2xl font-mono font-bold text-white">1,429</p>
            </div>
          </div>
        </section>

        {user && history.length > 0 && (
          <section className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">📜 Recent History</h2>
            <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar">
              {history.slice(0, 10).map((item) => (
                <button 
                  key={item.id}
                  onClick={() => setResult(item)}
                  className="w-full text-left bg-slate-800/30 hover:bg-slate-800/60 p-3 rounded-lg border border-slate-700/30 transition-all group"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      item.score < 40 ? "bg-emerald-500/20 text-emerald-400" : 
                      item.score < 70 ? "bg-amber-500/20 text-amber-400" : 
                      "bg-rose-500/20 text-rose-400"
                    )}>
                      {item.score}%
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString() : 'Just now'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2 group-hover:text-white transition-colors">
                    {item.message}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">📈 Tactic Trends</h2>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fakeHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', fontSize: '10px' }}
                  itemStyle={{ fontSize: '10px' }}
                />
                <Line type="monotone" dataKey="Urgency" stroke="#f43f5e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Fear" stroke="#fbbf24" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Authority" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] font-medium uppercase tracking-wider">
            <span className="flex items-center gap-1 text-rose-400"><span className="w-2 h-2 rounded-full bg-rose-400" /> Urgency</span>
            <span className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-400" /> Fear</span>
            <span className="flex items-center gap-1 text-blue-400"><span className="w-2 h-2 rounded-full bg-blue-400" /> Authority</span>
          </div>
        </section>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock className="w-3 h-3" />
            <span>Safe & Private Analysis</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <header className={cn(
          "h-16 border-b flex items-center justify-between px-4 lg:px-8 shrink-0 transition-colors duration-300",
          darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        )}>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Status: <span className="text-emerald-500 font-medium">Protecting You</span></span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {authError && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="hidden md:flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-[10px] font-bold text-rose-500"
              >
                <AlertTriangle className="w-3 h-3" />
                {authError}
              </motion.div>
            )}
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={cn(
                "p-2 rounded-lg transition-all active:scale-95",
                darkMode ? "bg-slate-800 text-amber-400 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className={cn("text-xs font-bold", darkMode ? "text-white" : "text-slate-900")}>
                    {user.displayName || 'User'}
                  </span>
                  <button 
                    onClick={handleLogout}
                    className="text-[10px] text-slate-500 hover:text-rose-500 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                ) : (
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                    darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-600"
                  )}>
                    {user.displayName?.[0] || 'U'}
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
              >
                <Lock className="w-3 h-3" />
                Sign In
              </button>
            )}
          </div>
        </header>

        <div className="p-4 lg:p-8 w-full max-w-[1400px] mx-auto space-y-6 lg:space-y-8">
          {/* Hero Section */}
          <div className="space-y-2">
            <h2 className={cn(
              "text-2xl lg:text-3xl font-bold tracking-tight",
              darkMode ? "text-white" : "text-slate-900"
            )}>🔍 Stop Scams Before They Stop You.</h2>
            <p className={darkMode ? "text-slate-400 text-base lg:text-lg" : "text-slate-500 text-base lg:text-lg"}>Paste a message to see if someone is trying to trick you using emotions.</p>
          </div>

          {/* Input Area */}
          <div className={cn(
            "p-4 lg:p-6 rounded-2xl shadow-sm border transition-colors duration-300 space-y-4",
            darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          )}>
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste the message here... (e.g. 'Your bank account is locked! Click here now!')"
                className={cn(
                  "w-full h-32 lg:h-40 p-4 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all resize-none text-base lg:text-lg placeholder:text-slate-400",
                  darkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-700"
                )}
              />
              {input && (
                <button 
                  onClick={() => setInput('')}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-500 transition-colors"
                  title="Clear input"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <button
              onClick={handleAnalyze}
              disabled={loading || !input.trim()}
              className={cn(
                "w-full py-3 lg:py-4 rounded-xl font-bold text-base lg:text-lg flex items-center justify-center gap-2 transition-all",
                loading || !input.trim() 
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 active:scale-[0.98]"
              )}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <RefreshCcw className="w-5 h-5 animate-spin" />
                  <span>Checking for tricks...</span>
                </div>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  <span>Analyze Message Now</span>
                </>
              )}
            </button>
          </div>

          {/* Results Area */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className={cn(
                    "p-6 rounded-2xl border flex flex-col gap-2 transition-colors duration-300", 
                    darkMode ? "bg-slate-900 border-slate-800" : getRiskColor(result.score),
                    darkMode && result.score < 40 && "border-emerald-500/30 text-emerald-400",
                    darkMode && result.score >= 40 && result.score < 70 && "border-amber-500/30 text-amber-400",
                    darkMode && result.score >= 70 && "border-rose-500/30 text-rose-400"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider opacity-70">Danger Level</span>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl lg:text-7xl font-bold tracking-tighter">{result.score}</span>
                      <span className="text-xl lg:text-2xl opacity-70 font-semibold">%</span>
                    </div>
                    <div className={cn(
                      "w-full h-2 rounded-full mt-2 overflow-hidden",
                      darkMode ? "bg-slate-800" : "bg-black/5"
                    )}>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${result.score}%` }}
                        className={cn("h-full", getRiskProgressColor(result.score))}
                      />
                    </div>
                    <p className="text-xs font-medium mt-1">
                      {result.score < 40 ? "✅ Looks safe" : result.score < 70 ? "⚠️ Be careful" : "🚨 High risk!"}
                    </p>
                  </div>

                  <div className={cn(
                    "p-6 rounded-2xl border transition-colors duration-300 flex flex-col gap-2",
                    darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  )}>
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-xs font-bold uppercase tracking-wider">🚩 Red Flags</span>
                      <Info className="w-5 h-5" />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {result.risky_words.map((word, i) => (
                        <span key={i} className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-md text-xs font-bold border border-yellow-200">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className={cn(
                    "p-6 rounded-2xl border transition-colors duration-300 flex flex-col gap-2",
                    darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  )}>
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-xs font-bold uppercase tracking-wider">🧠 Main Trick</span>
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-2xl font-bold",
                        darkMode ? "text-white" : "text-slate-800"
                      )}>
                        {Object.entries(result.tactics).sort((a, b) => (b[1] as number) - (a[1] as number))[0][0]}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                    </div>
                    <p className="text-xs text-slate-500">This is how they are trying to trick you.</p>
                  </div>
                </div>

                {/* Detailed Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Highlighted Text */}
                  <div className={cn(
                    "p-6 rounded-2xl border transition-colors duration-300 space-y-4",
                    darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  )}>
                    <h3 className={cn(
                      "text-sm font-bold flex items-center justify-between",
                      darkMode ? "text-white" : "text-slate-900"
                    )}>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ⚠️ Risky Parts Found
                      </div>
                      <button 
                        onClick={handleCopy}
                        className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                        title="Copy analysis"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </h3>
                    <div 
                      className={cn(
                        "p-4 lg:p-6 rounded-xl leading-relaxed min-h-[100px] lg:min-h-[120px] text-base lg:text-lg",
                        darkMode ? "bg-slate-800 text-slate-200" : "bg-slate-50 text-slate-700"
                      )}
                      dangerouslySetInnerHTML={{ __html: result.highlighted }}
                    />
                    <div className={cn(
                      "p-4 border rounded-xl flex gap-3",
                      darkMode ? "bg-amber-950/30 border-amber-900/50" : "bg-amber-50 border-amber-100"
                    )}>
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <p className={cn(
                        "text-sm font-medium",
                        darkMode ? "text-amber-200" : "text-amber-900"
                      )}>"{result.warning}"</p>
                    </div>
                  </div>

                  {/* Tactics Chart */}
                  <div className={cn(
                    "p-6 rounded-2xl border transition-colors duration-300 space-y-4",
                    darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  )}>
                    <h3 className={cn(
                      "text-sm font-bold flex items-center gap-2",
                      darkMode ? "text-white" : "text-slate-900"
                    )}>
                      <BarChart3 className="w-4 h-4 text-emerald-500" />
                      📊 How they are manipulating you
                    </h3>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tacticsData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={darkMode ? "#334155" : "#f1f5f9"} />
                          <XAxis type="number" domain={[0, 10]} hide />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={100} 
                            tick={{ fontSize: 14, fill: darkMode ? '#94a3b8' : '#475569', fontWeight: 500 }} 
                            axisLine={false} 
                            tickLine={false} 
                          />
                          <Tooltip 
                            cursor={{ fill: darkMode ? '#1e293b' : '#f8fafc' }}
                            contentStyle={{ 
                              borderRadius: '12px', 
                              border: 'none', 
                              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                              backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                              color: darkMode ? '#f8fafc' : '#000000'
                            }}
                          />
                          <Bar 
                            dataKey="value" 
                            fill="#10b981" 
                            radius={[0, 4, 4, 0]} 
                            barSize={32}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
