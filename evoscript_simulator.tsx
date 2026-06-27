import React, { useState, useEffect } from 'react';
import { 
  Activity, Zap, AlertTriangle, Code2, 
  BrainCircuit, History, CheckCircle2, ChevronRight, Play, Terminal, ShieldCheck, Sparkles
} from 'lucide-react';
import syntaxRulesJSON from './rules.json';

// --- TypeScript Interfaces ---
interface StyleProfile {
  quotes: string;
  naming: string;
}

interface SyntaxRule {
  keyword: string;
  desc: string;
}

interface Insight {
  type: 'debt' | 'optimization' | string;
  message: string;
}

export default function App() {
  const [code, setCode] = useState<string>(`var i = 12
var c = (1, 2, 3, 4)
int b = 13
show type of b
print hi

// Let's test the new conversational logic!
make a variable called a and set it to 13
if a is the same as b then print yes
add 5 to a
`);
  const [compiledCode, setCompiledCode] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  // Execution States
  const [output, setOutput] = useState<string[] | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  
  // Symbiote States
  const [styleProfile, setStyleProfile] = useState<StyleProfile>({ quotes: 'learning', naming: 'learning' });
  const [insights, setInsights] = useState<Insight[]>([]);
  const [evolvedSyntax, setEvolvedSyntax] = useState<SyntaxRule[]>([]);

  // --- Real-time Word Finisher States ---
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [activeWord, setActiveWord] = useState<string>('');

  const isJsonConnected = Array.isArray(syntaxRulesJSON) && syntaxRulesJSON.length > 0;

  // The Offline Heuristic NLP Engine
  useEffect(() => {
    const timer = setTimeout(() => {
      analyzeWithHeuristics(code);
    }, 800); // 800ms debounce

    setIsAnalyzing(true);
    return () => clearTimeout(timer);
  }, [code]);

const analyzeWithHeuristics = (rawCode: string) => {
    // 1. Safely extract rules to handle production bundle variations (.default)
    const rules = Array.isArray(syntaxRulesJSON) 
      ? syntaxRulesJSON 
      : (syntaxRulesJSON as any)?.default || [];

    const isJsonConnected = Array.isArray(rules) && rules.length > 0;

    try {
      let newInsights: Insight[] = [];
      let currentEvolvedSyntax: SyntaxRule[] = [];
      let finalCodeLines: string[] = [];
      
      // --- 1. LEARN CODING STYLE ---
      const lines = rawCode.split('\n').filter((l: string) => l.trim().length > 0 && !l.trim().startsWith('//') && !l.trim().startsWith('#'));
      
      if (lines.length > 0) {
        const singleQuotes = (rawCode.match(/'/g) || []).length;
        const doubleQuotes = (rawCode.match(/"/g) || []).length;
        let quoteStyle = 'learning';
        if (doubleQuotes > singleQuotes) quoteStyle = 'Double (")';
        else if (singleQuotes > doubleQuotes) quoteStyle = "Single (')";
        else if (singleQuotes > 0 || doubleQuotes > 0) quoteStyle = 'Mixed';
        
        const snakeCase = (rawCode.match(/\b[a-z]+_[a-z]+\b/g) || []).length;
        const camelCase = (rawCode.match(/\b[a-z]+[A-Z][a-z]+\b/g) || []).length;
        let namingStyle = 'learning';
        if (snakeCase > camelCase) namingStyle = 'snake_case';
        else if (camelCase > snakeCase) namingStyle = 'camelCase';
        else if (snakeCase > 0 || camelCase > 0) namingStyle = 'Mixed';

        setStyleProfile({ quotes: quoteStyle, naming: namingStyle });
      }

      // --- 2. VAST DYNAMIC HEURISTIC TRANSLATION ---
      if (isJsonConnected) {
        rawCode.split('\n').forEach(line => {
          let translatedLine = line;
          let matched = false;

          if (line.trim() === '' || line.trim().startsWith('//') || line.trim().startsWith('#')) {
              finalCodeLines.push(line);
              return;
          }

          const indentMatch = line.match(/^(\s*)/);
          const indent = indentMatch ? indentMatch[1] : '';
          const trimmedLine = line.trim();

          // Using our safely resolved rules reference
          for (const rule of rules) {
             const pattern = new RegExp(rule.pattern, rule.flags);
             if (pattern.test(trimmedLine)) {
                 let tempTranslation = trimmedLine.replace(pattern, rule.replace);
                 
                 if (tempTranslation.includes(': ')) {
                     let parts = tempTranslation.split(': ');
                     let leftSide = parts[0];
                     let rightSide = parts[1];
                     
                     for (const nestedRule of rules) {
                         const nestedPattern = new RegExp(nestedRule.pattern, nestedRule.flags);
                         if (nestedPattern.test(rightSide)) {
                             rightSide = rightSide.replace(nestedPattern, nestedRule.replace);
                         }
                     }
                     tempTranslation = leftSide + ': ' + rightSide;
                 }
                 
                 translatedLine = indent + tempTranslation;

                 if (!currentEvolvedSyntax.some(s => s.keyword === rule.ruleKeyword)) {
                     currentEvolvedSyntax.push({ keyword: rule.ruleKeyword, desc: rule.desc });
                 }
                 matched = true;
                 break;
             }
          }

          if (!matched) {
              if (trimmedLine.match(/for\s*\([^)]+\)/)) {
                 translatedLine = indent + trimmedLine.replace(/for\s*\(\s*(?:let\s+|var\s+|int\s+)?([a-zA-Z0-9_]+)\s*=\s*(\d+)\s*;\s*\1\s*<\s*(\d+)\s*;\s*\1\+\+\s*\)/g, 'for $1 in range($2, $3):');
                 if (!currentEvolvedSyntax.some(s => s.keyword === 'for(i=0; i<N; i++)')) {
                     currentEvolvedSyntax.push({ keyword: 'for(i=0; i<N; i++)', desc: 'Translated C-style for-loop.' });
                 }
              }
          }

          finalCodeLines.push(translatedLine);
        });
      } else {
        finalCodeLines = rawCode.split('\n');
      }

      let finalCode = finalCodeLines.join('\n');

      if (/\b(var|let|const|int|float|string)\s+([a-zA-Z0-9_]+)\s*=/g.test(finalCode)) {
        newInsights.push({
          type: 'optimization',
          message: 'Static type/JS keyword removed. Python uses dynamic typing.'
        });
        finalCode = finalCode.replace(/\b(var|let|const|int|float|string)\s+([a-zA-Z0-9_]+)\s*=/g, '$2 =');
      }

      setEvolvedSyntax(currentEvolvedSyntax);
      setInsights(newInsights);
      setCompiledCode(finalCode);

    } catch (error) {
      // Catch and print any silent failures directly to your browser inspector
      console.error("Heuristics Engine encountered an error:", error);
    } finally {
      // This block ALWAYS runs, guaranteeing your loading message unfreezes
      setIsAnalyzing(false);
    }
  };

  // --- Real-time Word Finisher Extraction ---
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setCode(value);

    // 1. Identify the word currently being typed at the cursor position
    const selectionEnd = e.target.selectionEnd;
    const textUpToCursor = value.slice(0, selectionEnd);
    const wordMatch = textUpToCursor.match(/[a-zA-Z0-9_'-]+$/);
    const currentWord = wordMatch ? wordMatch[0] : '';
    
    setActiveWord(currentWord);

    if (currentWord.trim().length > 0) {
      // 2. Aggregate all loaded vocabulary from rules and base engine
      const vocabulary = new Set<string>([
        'print', 'if', 'for', 'in', 'range', 'make', 'variable', 
        'called', 'type', 'show', 'same', 'then', 'add', 'to'
      ]);

      if (isJsonConnected) {
        syntaxRulesJSON.forEach(rule => {
          if (rule.ruleKeyword) {
            vocabulary.add(rule.ruleKeyword);
            // Split up multi-word phrases so individual tokens are indexed too
            rule.ruleKeyword.split(/\s+/).forEach(w => {
              const cleaned = w.replace(/[^a-zA-Z0-9_'-]/g, '');
              if (cleaned.length > 1) vocabulary.add(cleaned);
            });
          }
        });
      }

      // 3. Filter for words that start with the active text fragment
      const matches = Array.from(vocabulary).filter(word => 
        word.toLowerCase().startsWith(currentWord.toLowerCase()) && 
        word.toLowerCase() !== currentWord.toLowerCase()
      );

      setFilteredSuggestions(matches.slice(0, 5)); // Limit to top 5 finishers
    } else {
      setFilteredSuggestions([]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  // The Mock Executor Engine
  const executeCode = () => {
    setIsRunning(true);
    
    setTimeout(() => {
      const lines = compiledCode.split('\n');
      const simulatedOutput: string[] = [];
      const mockMemory: Record<string, string> = {}; 
      
      let inLoop = false;
      let loopVar = '';
      let loopStart = 0;
      let loopEnd = 0;
      let loopBody: string[] = [];

      const processLine = (line: string) => {
        const assignMatch = line.match(/^\s*([a-zA-Z0-9_]+)\s*([+\-*/]?)=\s*(.*)$/);
        if (assignMatch) {
          const varName = assignMatch[1];
          const operator = assignMatch[2];
          const value = assignMatch[3].trim();
          
          if (operator === '+=' && mockMemory[varName]) {
             mockMemory[varName] = (Number(mockMemory[varName]) + Number(value)).toString();
          } else if (operator === '=') {
             mockMemory[varName] = value;
          }
          return;
        }

        const printMatch = line.match(/^\s*print\((.*)\)/);
        if (printMatch) {
          let val = printMatch[1].trim();

          const typeMatch = val.match(/^type\((.*)\)$/);
          if (typeMatch) {
            let varName = typeMatch[1].trim();
            let memVal = mockMemory[varName];
            
            if (memVal === undefined) {
               simulatedOutput.push(`<class 'NoneType'>`);
            } else {
               if ((memVal.startsWith('"') && memVal.endsWith('"')) || (memVal.startsWith("'") && memVal.endsWith("'"))) {
                   simulatedOutput.push(`<class 'str'>`);
               } else if (memVal.startsWith('(') && memVal.endsWith(')')) {
                   simulatedOutput.push(`<class 'tuple'>`);
               } else if (memVal.startsWith('[') && memVal.endsWith(']')) {
                   simulatedOutput.push(`<class 'list'>`);
               } else if (memVal === 'True' || memVal === 'False' || memVal === 'true' || memVal === 'false') {
                   simulatedOutput.push(`<class 'bool'>`);
               } else if (!isNaN(Number(memVal))) {
                   if (memVal.includes('.')) {
                       simulatedOutput.push(`<class 'float'>`);
                   } else {
                       simulatedOutput.push(`<class 'int'>`);
                   }
               } else {
                   simulatedOutput.push(`<class 'str'>`);
               }
            }
            return;
          }
          
          if (val.includes('+')) {
              const parts = val.split('+').map(p => p.trim());
              let combined = "";
              parts.forEach(p => {
                  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
                      combined += p.substring(1, p.length - 1);
                  } else if (mockMemory[p] !== undefined) {
                      let memVal = mockMemory[p];
                      if ((memVal.startsWith('"') && memVal.endsWith('"')) || (memVal.startsWith("'") && memVal.endsWith("'"))) {
                          memVal = memVal.substring(1, memVal.length - 1);
                      }
                      combined += memVal;
                  } else {
                      combined += p;
                  }
              });
              simulatedOutput.push(combined);
              return;
          }

          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          } else if (mockMemory[val] !== undefined) {
            val = mockMemory[val];
          }
          
          simulatedOutput.push(val);
        }
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        const singleIfMatch = line.match(/^\s*if\s+(.+)\s*==\s*(.+)\s*:\s*(.+)$/);
        if (singleIfMatch) {
           let left = mockMemory[singleIfMatch[1].trim()] || singleIfMatch[1].trim();
           let right = mockMemory[singleIfMatch[2].trim()] || singleIfMatch[2].trim();
           
           left = left.replace(/^['"](.*)['"]$/, '$1');
           right = right.replace(/^['"](.*)['"]$/, '$1');
    
           if (left === right) {
              processLine(singleIfMatch[3]);
           }
           continue;
        }

        if (line.trim().startsWith('if ') || line.trim().startsWith('elif ') || line.trim().startsWith('else:')) {
            continue; 
        }

        if (inLoop) {
          if (line.trim() === '') continue;
          if (line.startsWith(' ') || line.startsWith('\t')) {
             loopBody.push(line);
             continue;
          } else {
             for (let v = loopStart; v < loopEnd; v++) {
                mockMemory[loopVar] = v.toString();
                loopBody.forEach(l => processLine(l));
             }
             inLoop = false;
             loopBody = [];
          }
        }

        const loopMatch = line.match(/for\s+([a-zA-Z0-9_]+)\s+in\s+range\(\s*([0-9]+)\s*,\s*([0-9]+)\s*\)\s*:/) || 
                          line.match(/for\s+([a-zA-Z0-9_]+)\s+in\s+range\(\s*([0-9]+)\s*\)\s*:/);
                          
        if (loopMatch) {
           inLoop = true;
           loopVar = loopMatch[1] || '_';
           if (loopMatch.length === 3 && line.includes(',')) {
               loopStart = 0; loopEnd = parseInt(loopMatch[2]);
           } else if (loopMatch[3]) {
               loopStart = parseInt(loopMatch[2]);
               loopEnd = parseInt(loopMatch[3]);
           } else {
               loopStart = 0;
               loopEnd = parseInt(loopMatch[2]);
           }
           continue;
        }

        if (!inLoop) {
           processLine(line);
        }
      }

      if (inLoop) {
         for (let v = loopStart; v < loopEnd; v++) {
            mockMemory[loopVar] = v.toString();
            loopBody.forEach(l => processLine(l));
         }
      }
      
      if (simulatedOutput.length === 0) {
        simulatedOutput.push("> Process finished with exit code 0 (No output)");
      }
      
      setOutput(simulatedOutput);
      setIsRunning(false);
    }, 400); 
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-300 font-sans flex flex-col relative">
      {/* REAL-TIME MOUSE-FOLLOWING WORD FINISHER */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div 
          className="fixed z-50 pointer-events-none bg-neutral-900/95 border border-emerald-500/40 rounded-md p-2 shadow-xl backdrop-blur-sm min-w-[140px] text-xs animate-fade-in transition-all duration-75"
          style={{ 
            left: `${mousePos.x + 12}px`, 
            top: `${mousePos.y + 12}px` 
          }}
        >
          <div className="flex items-center space-x-1 text-emerald-400 font-bold border-b border-neutral-800 pb-1 mb-1.5 opacity-80">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>Finish word...</span>
          </div>
          <div className="space-y-1">
            {filteredSuggestions.map((suggestion, idx) => {
              // Highlight matching portion
              const matchesInput = suggestion.toLowerCase().startsWith(activeWord.toLowerCase());
              return (
                <div key={idx} className="font-mono px-1.5 py-0.5 rounded bg-black/30 flex items-center justify-between text-neutral-400">
                  <span>
                    {matchesInput ? (
                      <>
                        <span className="text-emerald-400 font-semibold">{suggestion.slice(0, activeWord.length)}</span>
                        <span>{suggestion.slice(activeWord.length)}</span>
                      </>
                    ) : (
                      suggestion
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <BrainCircuit className={`w-7 h-7 ${isAnalyzing ? 'text-blue-400 animate-pulse' : 'text-emerald-400'}`} />
            {isAnalyzing && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent flex items-center">
              EvoScript Engine 
            </h1>
            <p className="text-xs text-neutral-500">Living Python Compiler v3.5.0 (Offline NLP Core) • {isAnalyzing ? 'Parsing Intent...' : 'Symbiosis Stable'}</p>
          </div>
        </div>
        
        <div className="flex space-x-2 text-xs">
          {isJsonConnected ? (
            <div className="px-3 py-1 bg-blue-600/20 rounded-full flex items-center border border-blue-500/30 text-blue-400 font-medium">
              <CheckCircle2 className="w-3 h-3 mr-2 text-blue-400" /> Rules Loaded ({syntaxRulesJSON.length})
            </div>
          ) : (
            <div className="px-3 py-1 bg-red-600/20 rounded-full flex items-center border border-red-500/30 text-red-400 font-medium">
              <AlertTriangle className="w-3 h-3 mr-2 text-red-400" /> Rules.json Missing / Empty
            </div>
          )}
          <div className="px-3 py-1 bg-neutral-800 rounded-full flex items-center border border-neutral-700 text-emerald-400 font-medium">
            <ShieldCheck className="w-3 h-3 mr-2 text-emerald-400" /> 100% Offline Mode
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Editor Pane (Left) */}
        <div className="w-1/2 flex flex-col border-r border-neutral-800">
          <div className="bg-neutral-900 px-4 py-2 border-b border-neutral-800 flex justify-between items-center text-sm font-medium">
            <span className="flex items-center text-neutral-400"><Code2 className="w-4 h-4 mr-2" /> source.evopy</span>
            <button 
              onClick={executeCode}
              disabled={isRunning || isAnalyzing}
              className="flex items-center px-3 py-1 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 rounded transition-colors text-xs border border-emerald-500/30 font-bold disabled:opacity-50"
            >
              <Play className="w-3 h-3 mr-1" /> {isRunning ? 'Running...' : 'Run Code'}
            </button>
          </div>
          <textarea
            value={code}
            onChange={handleTextareaChange}
            onMouseMove={handleMouseMove}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            className="flex-1 w-full bg-neutral-950 text-emerald-300 p-6 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/30 leading-relaxed"
            spellCheck="false"
            placeholder="Type naturally... invent your own syntax..."
          />
        </div>

        {/* Symbiote & Output Pane (Right) */}
        <div className="w-1/2 flex flex-col bg-neutral-900 overflow-y-auto">
          <div className="flex flex-col border-b border-neutral-800 min-h-[30%] max-h-[40%]">
             <div className="bg-neutral-800/50 px-4 py-2 border-b border-neutral-800 flex items-center text-sm font-medium text-neutral-400 shrink-0">
              <ChevronRight className="w-4 h-4 mr-1" /> Compiled Python Target
            </div>
            <div className="p-6 font-mono text-sm text-blue-300 whitespace-pre-wrap overflow-y-auto flex-1">
               {isAnalyzing ? (
                <span className="text-neutral-500 animate-pulse"># Processing NLP Heuristics...</span>
              ) : (
                compiledCode || "# Waiting for input..."
              )}
            </div>
          </div>

          {/* TERMINAL OUTPUT */}
          {output !== null && (
            <div className="flex flex-col border-b border-neutral-800 bg-black min-h-[25%] max-h-[35%]">
               <div className="bg-neutral-900 px-4 py-2 border-b border-neutral-800 flex items-center text-sm font-medium text-neutral-500 shrink-0 uppercase tracking-wider">
                <Terminal className="w-4 h-4 mr-2" /> Output Console
              </div>
              <div className="p-4 font-mono text-sm text-green-400 whitespace-pre-wrap overflow-y-auto flex-1">
                {output.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}

          {/* Symbiote Dashboard */}
          <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-neutral-950 shadow-inner">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-4 flex items-center">
              <Activity className="w-4 h-4 mr-2 text-blue-500" /> NLP Heuristic Feedback
            </h2>

            {/* Profile Section */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-neutral-400 mb-3 uppercase flex items-center">
                <History className="w-3 h-3 mr-2" /> Learned Developer Profile
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800/50">
                  <span className="block text-neutral-500 text-xs mb-1">String Quotes</span>
                  <span className="font-mono text-blue-400">{styleProfile?.quotes || '...'}</span>
                </div>
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800/50">
                  <span className="block text-neutral-500 text-xs mb-1">Naming Convention</span>
                  <span className="font-mono text-blue-400">{styleProfile?.naming || '...'}</span>
                </div>
              </div>
            </div>

            {/* Evolved Syntax Section */}
            {evolvedSyntax.length > 0 && (
              <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-blue-400 mb-3 uppercase flex items-center">
                  <BrainCircuit className="w-3 h-3 mr-2" /> Heuristics Extracted Rules
                </h3>
                <div className="space-y-2">
                  {evolvedSyntax.map((syn: SyntaxRule, idx: number) => (
                    <div key={idx} className="flex items-start text-sm">
                      <CheckCircle2 className="w-4 h-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-mono text-blue-300 font-bold bg-blue-900/30 px-1 rounded">{syn.keyword}</span>
                        <p className="text-neutral-400 text-xs mt-1">{syn.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Insights Section */}
            {insights.length > 0 && (
              <div className="space-y-3">
                 <h3 className="text-xs font-semibold text-neutral-400 mb-2 uppercase flex items-center">
                  <Zap className="w-3 h-3 mr-2" /> Active Insights
                </h3>
                {insights.map((insight: Insight, idx: number) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-lg border text-sm flex items-start ${
                      insight.type === 'debt' 
                        ? 'bg-red-950/20 border-red-900/50 text-red-300'
                        : 'bg-yellow-950/20 border-yellow-900/50 text-yellow-300'
                    }`}
                  >
                    {insight.type === 'debt' 
                      ? <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                      : <Zap className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    }
                    <span>{insight.message}</span> 
                  </div>
                ))}
              </div>
            )}

            {insights.length === 0 && evolvedSyntax.length === 0 && !isAnalyzing && (
              <div className="text-center p-8 text-neutral-600 text-sm border border-dashed border-neutral-800 rounded-lg">
                The Heuristic Engine is dormant.<br/> Write some natural language code to wake it up.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}