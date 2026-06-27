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

  // Safety checker for Regex pattern strings
  const compilePattern = (patternStr: string, flags: string): RegExp => {
    let sanitized = patternStr;
    // Replace raw ??? with escaped \?\?\?
    if (sanitized.includes('???')) {
      sanitized = sanitized.replace(/\?\?\?/g, '\\?\\?\\?');
    }
    return new RegExp(sanitized, flags);
  };

  const analyzeWithHeuristics = (rawCode: string) => {
    setIsAnalyzing(true);
    
    // Safely extract rules to handle production bundle variations (.default)
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

          // Search dictionary rules with full fault-isolation
          for (const rule of rules) {
             try {
                const pattern = compilePattern(rule.pattern, rule.flags);
                if (pattern.test(trimmedLine)) {
                    let tempTranslation = trimmedLine.replace(pattern, rule.replace);
                    
                    if (tempTranslation.includes(': ')) {
                        let parts = tempTranslation.split(': ');
                        let leftSide = parts[0];
                        let rightSide = parts[1];
                        
                        // Handle potential nested substitutions
                        for (const nestedRule of rules) {
                            try {
                               const nestedPattern = compilePattern(nestedRule.pattern, nestedRule.flags);
                               if (nestedPattern.test(rightSide)) {
                                   rightSide = rightSide.replace(nestedPattern, nestedRule.replace);
                               }
                            } catch (nestedErr) {
                               // Silently isolate nested compile errors
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
             } catch (ruleError) {
                // If a single pattern is invalid, warn but keep going!
                console.warn(`Engine skipped corrupted rule pattern "${rule.ruleKeyword}":`, ruleError);
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
          message: 'Static type or JS variable keyword removed. Python uses dynamic typing.'
        });
        finalCode = finalCode.replace(/\b(var|let|const|int|float|string)\s+([a-zA-Z0-9_]+)\s*=/g, '$2 =');
      }

      setEvolvedSyntax(currentEvolvedSyntax);
      setInsights(newInsights);
      setCompiledCode(finalCode);

    } catch (globalError) {
      console.error("Heuristics core translation crash averted:", globalError);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Re-run heuristics processing whenever the source code changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      analyzeWithHeuristics(code);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [code]);

  // Simulated code execution logic
  const runCodeSimulated = () => {
    setIsRunning(true);
    setOutput(null);

    setTimeout(() => {
      const logs: string[] = [];
      const lines = compiledCode.split('\n');
      const variables: Record<string, any> = {};

      logs.push(">>> Starting Execution of EvoScript Symbiote Output...");

      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) return;

        // Variable Assignments
        if (trimmed.includes('=')) {
          const parts = trimmed.split('=');
          const varName = parts[0].trim();
          const varValueStr = parts[1].trim();

          // Strip simple type prefixes if they leaked through
          const cleanedVarName = varName.replace(/\b(let|var|const|int|float|string)\s+/g, '');

          try {
            // Attempt a simple math evaluation or parsing
            if (varValueStr.startsWith('(') && varValueStr.endsWith(')')) {
              // Parse tuple mock
              const items = varValueStr.slice(1, -1).split(',').map(i => parseInt(i.trim()) || i.trim());
              variables[cleanedVarName] = items;
            } else if (!isNaN(Number(varValueStr))) {
              variables[cleanedVarName] = Number(varValueStr);
            } else {
              // Standard string evaluation
              variables[cleanedVarName] = varValueStr.replace(/['"]/g, '');
            }
          } catch (e) {
            variables[cleanedVarName] = varValueStr;
          }
          return;
        }

        // Show type expressions
        if (trimmed.startsWith('show type of ') || trimmed.startsWith('print(type(')) {
          const varMatch = trimmed.match(/(?:show type of\s+|print\(type\()([a-zA-Z0-9_]+)\)?/);
          if (varMatch) {
            const varName = varMatch[1];
            if (varName in variables) {
              const val = variables[varName];
              let typeStr = 'class \'str\'';
              if (Array.isArray(val)) typeStr = "class 'tuple'";
              else if (typeof val === 'number') typeStr = Number.isInteger(val) ? "class 'int'" : "class 'float'";
              logs.push(`<type: ${typeStr}>`);
            } else {
              logs.push(`NameError: name '${varName}' is not defined`);
            }
          }
          return;
        }

        // Simple Print statements
        if (trimmed.startsWith('print(') || trimmed.startsWith('print ')) {
          const contentMatch = trimmed.match(/(?:print\((.+)\)|print\s+(.+))/);
          if (contentMatch) {
            const expression = (contentMatch[1] || contentMatch[2]).trim();
            if (expression in variables) {
              logs.push(String(variables[expression]));
            } else {
              // Clean quotes and print raw text
              logs.push(expression.replace(/['"]/g, ''));
            }
          }
          return;
        }
      });

      logs.push(">>> Execution completed successfully.");
      setOutput(logs);
      setIsRunning(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-neutral-800">
      {/* Header Bar */}
      <header className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-500 p-2 rounded-xl text-neutral-950 shadow-lg shadow-emerald-500/20">
            <BrainCircuit className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-200 to-neutral-100 bg-clip-text text-transparent">
              EvoScript Simulator
            </h1>
            <p className="text-xs text-neutral-400">Heuristic Engine & Syntax Symbiote</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className="flex items-center text-xs bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1 text-neutral-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mr-1.5" /> Autopilot Active
          </span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        
        {/* Left Hand: Style Symbiote and Insights */}
        <div className="lg:col-span-3 space-y-6 flex flex-col h-full">
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-300 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-emerald-400" /> Symbiote Stats
              </h2>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>

            {/* Coding Style profile */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Style Profile</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-900">
                  <p className="text-[10px] text-neutral-500 uppercase">Quotes</p>
                  <p className="text-sm font-medium text-neutral-200">{styleProfile.quotes}</p>
                </div>
                <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-900">
                  <p className="text-[10px] text-neutral-500 uppercase">Variable Naming</p>
                  <p className="text-sm font-medium text-neutral-200">{styleProfile.naming}</p>
                </div>
              </div>
            </div>

            {/* Insights panel */}
            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Dynamic Insights</h3>
              
              {insights.length > 0 && (
                <div className="space-y-3">
                  {insights.map((insight, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3.5 rounded-xl border text-xs flex items-start ${
                        insight.type === 'debt' 
                          ? 'bg-red-950/10 border-red-900/30 text-red-300'
                          : 'bg-emerald-950/10 border-emerald-900/30 text-emerald-300'
                      }`}
                    >
                      {insight.type === 'debt' 
                        ? <AlertTriangle className="w-4 h-4 mr-2.5 mt-0.5 text-red-400 flex-shrink-0" />
                        : <Zap className="w-4 h-4 mr-2.5 mt-0.5 text-emerald-400 flex-shrink-0" />
                      }
                      <span>{insight.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {insights.length === 0 && !isAnalyzing && (
                <div className="text-center p-6 text-neutral-600 text-xs border border-dashed border-neutral-900 rounded-xl">
                  The Heuristic Engine is monitoring your environment.
                </div>
              )}
            </div>
          </div>

          {/* Active Evolved Rules Panel */}
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 flex-1 flex flex-col min-h-[250px]">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-300 pb-4 border-b border-neutral-900 flex items-center">
              <Sparkles className="w-4 h-4 mr-2 text-emerald-400" /> Active Translations
            </h2>
            <div className="flex-1 overflow-y-auto pt-4 space-y-3 pr-1 max-h-[350px]">
              {evolvedSyntax.map((rule, idx) => (
                <div key={idx} className="bg-neutral-950/40 border border-neutral-900 p-3 rounded-xl space-y-1.5 hover:border-neutral-800 transition-colors">
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-emerald-400 font-mono bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800/80">
                      {rule.keyword}
                    </code>
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider font-mono">Matched</span>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">{rule.desc}</p>
                </div>
              ))}
              {evolvedSyntax.length === 0 && (
                <div className="text-center py-10 text-neutral-600 text-xs">
                  No matches. Write basic natural code like "print hello world" or "make variable count and set to 10" to see automatic rule matching.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center / Right Hand Side: Workspace Editors */}
        <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-[500px]">
          
          {/* Natural Language Code Editor */}
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4 mb-4">
              <div className="flex items-center space-x-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-neutral-300">Natural Language Input</span>
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">SimulType v1.4</span>
            </div>
            
            <textarea
              className="flex-1 bg-neutral-950/40 border border-neutral-900 rounded-xl p-4 text-sm font-mono text-neutral-300 focus:outline-none focus:border-emerald-500/50 resize-none leading-relaxed transition-all"
              placeholder="Write natural language ideas or standard scripts here..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
            />
          </div>

          {/* Compiled Code Output & Sandbox Terminal */}
          <div className="space-y-6 flex flex-col h-full">
            
            {/* Compiled Output Preview */}
            <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 flex-1 flex flex-col">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-4 mb-4">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-neutral-300">Heuristic Translation (Python)</span>
                </div>
                
                {isAnalyzing ? (
                  <div className="flex items-center space-x-2 text-xs text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span className="font-mono text-[10px]">Processing...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-xs text-neutral-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-600"></span>
                    <span className="font-mono text-[10px]">Waiting for input...</span>
                  </div>
                )}
              </div>
              
              <pre className="flex-1 bg-neutral-950/40 border border-neutral-900 rounded-xl p-4 text-sm font-mono text-emerald-300/90 overflow-y-auto leading-relaxed select-all">
                {compiledCode || "# Waiting for input script..."}
              </pre>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={runCodeSimulated}
                  disabled={isRunning || !compiledCode}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-xs flex items-center transition-all shadow-md shadow-emerald-500/10 disabled:shadow-none"
                >
                  {isRunning ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Running Symbiote...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 mr-2 fill-neutral-950" />
                      Run Code
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Output simulated terminal */}
            <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 h-[200px] flex flex-col">
              <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-neutral-900">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold tracking-wider uppercase text-neutral-400">Execution Output</span>
              </div>
              <div className="flex-1 bg-neutral-950 rounded-xl p-3.5 font-mono text-xs overflow-y-auto space-y-1 text-emerald-400/90 border border-neutral-900">
                {output ? (
                  output.map((line, idx) => (
                    <div 
                      key={idx} 
                      className={
                        line.startsWith('>>>') 
                          ? 'text-neutral-500 border-b border-neutral-900/50 pb-1 mb-1' 
                          : line.startsWith('NameError') 
                            ? 'text-red-400' 
                            : 'text-neutral-300'
                      }
                    >
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-neutral-600 italic">No logs. Click "Run Code" above to simulate program compilation and execution.</div>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}