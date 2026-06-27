import React, { useState, useEffect } from 'react';
import { Activity, Zap, AlertTriangle, Code2, BrainCircuit, Play, Terminal, ShieldCheck, Sparkles } from 'lucide-react';
import syntaxRulesJSON from './rules.json';

interface StyleProfile { quotes: string; naming: string; }
interface SyntaxRule { keyword: string; desc: string; }
interface Insight { type: 'debt' | 'optimization'; message: string; }

const getRuleScore = (rule: any): number => {
  let score = 0;
  const keyword = rule.ruleKeyword;
  const pattern = rule.pattern;
  if (keyword.includes('then') && keyword.includes('Z')) score += 10000;
  if (keyword.includes('else if') || keyword.includes('elif')) score += 5000;
  if (keyword.includes('try') || keyword.includes('error')) score += 3000;
  if (keyword.includes('cast') || keyword.includes('type') || keyword.includes('isinstance')) score += 2000;
  if (keyword.includes('file') || keyword.includes('directory') || keyword.includes('json')) score += 1500;
  if (keyword.includes('list') || keyword.includes('dict') || keyword.includes('set')) score += 1000;
  if (keyword.includes('random') || keyword.includes('math') || keyword.includes('date')) score += 1000;
  // Heavy penalties for rules known to be too greedy
  if (keyword === 'printshowsaydisplaylog X') score -= 8000;
  if (keyword === 'X = Y') score -= 9000;
  if (keyword.includes('bare') || keyword.includes('generic')) score -= 7000;
  // Extra penalty for os/self/file rules that tend to swallow simple statements
  if (pattern.includes('os.listdir') || pattern.includes('os.path') || pattern.includes('listdir')) score -= 5000;
  if (keyword.includes('self.') || keyword.includes('set self')) score -= 4000;
  if (keyword.includes('list files') || keyword.includes('directory')) score -= 4000;
  const groupCount = (pattern.match(/\(\?!.*?\)|(?:\()/g) || []).length;
  score += groupCount * 100;
  score += pattern.length * 0.1;
  return score;
};

export default function App() {
  const [code, setCode] = useState<string>(
`var i = 12
var c = [1, 2, 3, 4]
int b = 13
show type of b
print hi
make a variable called a and set it to 13
if a is the same as b then print yes
add 5 to a`
  );
  const [compiledCode, setCompiledCode] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [output, setOutput] = useState<string[] | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [styleProfile, setStyleProfile] = useState<StyleProfile>({ quotes: 'learning', naming: 'learning' });
  const [insights, setInsights] = useState<Insight[]>([]);
  const [evolvedSyntax, setEvolvedSyntax] = useState<SyntaxRule[]>([]);

  const compilePattern = (patternStr: string, flags: string): RegExp => {
    let sanitized = patternStr;
    if (sanitized.includes('???')) sanitized = sanitized.replace(/\?\?\?/g, '??');
    return new RegExp(sanitized, flags);
  };

  const analyzeWithHeuristics = (rawCode: string) => {
    setIsAnalyzing(true);
    const rawRules = Array.isArray(syntaxRulesJSON) ? syntaxRulesJSON : (syntaxRulesJSON as any)?.default;
    const isJsonConnected = Array.isArray(rawRules) && rawRules.length > 0;
    try {
      let newInsights: Insight[] = [];
      let currentEvolvedSyntax: SyntaxRule[] = [];
      let finalCodeLines: string[] = [];
      const rules = isJsonConnected
        ? [...rawRules].sort((a, b) => getRuleScore(b) - getRuleScore(a))
        : [];

      const lines = rawCode.split('\n').filter((l: string) => l.trim().length > 0 && !l.trim().startsWith('#') && !l.trim().startsWith('//'));
      if (lines.length > 0) {
        const singleQuotes = (rawCode.match(/'/g) || []).length;
        const doubleQuotes = (rawCode.match(/"/g) || []).length;
        let quoteStyle = 'learning';
        if (doubleQuotes > singleQuotes) quoteStyle = 'Double';
        else if (singleQuotes > doubleQuotes) quoteStyle = 'Single';
        else if (singleQuotes > 0 && doubleQuotes > 0) quoteStyle = 'Mixed';
        const snakeCase = (rawCode.match(/[a-z_][a-z_0-9]*_[a-z]/g) || []).length;
        const camelCase = (rawCode.match(/[a-z][A-Z][a-zA-Z]*/g) || []).length;
        let namingStyle = 'learning';
        if (snakeCase > camelCase) namingStyle = 'snakecase';
        else if (camelCase > snakeCase) namingStyle = 'camelCase';
        else if (snakeCase > 0 && camelCase > 0) namingStyle = 'Mixed';
        setStyleProfile({ quotes: quoteStyle, naming: namingStyle });
      }

      if (isJsonConnected) {
        rawCode.split('\n').forEach((line: string) => {
          let translatedLine = line;
          let matched = false;
          if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('//')) {
            finalCodeLines.push(line);
            return;
          }
          const indentMatch = line.match(/^(\s*)/);
          const indent = indentMatch ? indentMatch[1] : '';
          const trimmedLine = line.trim();

          for (const rule of rules) {
            try {
              const pattern = compilePattern(rule.pattern, rule.flags);
              if (pattern.test(trimmedLine)) {
                let tempTranslation = trimmedLine.replace(pattern, rule.replace);
                if (tempTranslation.includes('\t')) {
                  let parts = tempTranslation.split('\t');
                  let leftSide = parts[0];
                  let rightSide = parts[1];
                  for (const nestedRule of rules) {
                    try {
                      const nestedPattern = compilePattern(nestedRule.pattern, nestedRule.flags);
                      if (nestedPattern.test(rightSide)) {
                        rightSide = rightSide.replace(nestedPattern, nestedRule.replace);
                      }
                    } catch (nestedErr) {}
                  }
                  tempTranslation = leftSide + rightSide;
                }
                translatedLine = indent + tempTranslation;
                if (!currentEvolvedSyntax.some(s => s.keyword === rule.ruleKeyword)) {
                  currentEvolvedSyntax.push({ keyword: rule.ruleKeyword, desc: rule.desc });
                }
                matched = true;
                break;
              }
            } catch (ruleError) {
              console.warn('Engine skipped corrupted rule pattern:', rule.ruleKeyword, ruleError);
            }
          }

          if (!matched) {
            if (trimmedLine.match(/^for\s*\(/)) {
              translatedLine = indent + trimmedLine.replace(
                /for\s*\(?let|var|int\)?\s*([a-zA-Z_]+)\s*=\s*([^;]+);\s*[^;]+;\s*[^)]+\)?/,
                'for $1 in range($2, $3)'
              );
              if (!currentEvolvedSyntax.some(s => s.keyword === 'for(i=0;i<N;i++)')) {
                currentEvolvedSyntax.push({ keyword: 'for(i=0;i<N;i++)', desc: 'Translated C-style for-loop.' });
              }
            }
          }
          finalCodeLines.push(translatedLine);
        });
      } else {
        finalCodeLines = rawCode.split('\n');
      }

      let finalCode = finalCodeLines.join('\n');
      if (/\b(var|let|const|int|float|string)\s+[a-zA-Z0-9_]+\s*=/g.test(finalCode)) {
        newInsights.push({ type: 'optimization', message: 'Static type or JS variable keyword removed. Python uses dynamic typing.' });
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

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => analyzeWithHeuristics(code), 300);
    return () => clearTimeout(delayDebounceFn);
  }, [code]);

  const evaluateCondition = (expr: string, variables: Record<string, any>): boolean => {
    const resolveValue = (token: string) => {
      const cleanToken = token.trim().replace(/['"]/g, '');
      if (cleanToken in variables) return variables[cleanToken];
      if (!isNaN(Number(cleanToken))) return Number(cleanToken);
      if (cleanToken === 'True') return true;
      if (cleanToken === 'False') return false;
      if (cleanToken === 'None') return null;
      return cleanToken;
    };
    if (expr.includes(' == ')) { const p = expr.split(' == '); return resolveValue(p[0]) == resolveValue(p[1]); }
    if (expr.includes(' != ')) { const p = expr.split(' != '); return resolveValue(p[0]) != resolveValue(p[1]); }
    if (expr.includes(' >= ')) { const p = expr.split(' >= '); return resolveValue(p[0]) >= resolveValue(p[1]); }
    if (expr.includes(' <= ')) { const p = expr.split(' <= '); return resolveValue(p[0]) <= resolveValue(p[1]); }
    if (expr.includes(' > ')) { const p = expr.split(' > '); return resolveValue(p[0]) > resolveValue(p[1]); }
    if (expr.includes(' < ')) { const p = expr.split(' < '); return resolveValue(p[0]) < resolveValue(p[1]); }
    if (expr.includes(' in ')) {
      const p = expr.split(' in ');
      const el = resolveValue(p[0]);
      const cont = resolveValue(p[1]);
      if (Array.isArray(cont)) return cont.includes(el);
      if (typeof cont === 'string') return cont.includes(String(el));
      return false;
    }
    return !!resolveValue(expr);
  };

  const executeSingleStatement = (stmt: string, variables: Record<string, any>, logs: string[]) => {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;

    const getTypeString = (val: any): string => {
      if (val === null) return "<class 'NoneType'>";
      if (typeof val === 'boolean') return "<class 'bool'>";
      if (Array.isArray(val)) return "<class 'list'>";
      if (typeof val === 'number') return Number.isInteger(val) ? "<class 'int'>" : "<class 'float'>";
      return "<class 'str'>";
    };

    const resolveExprValue = (valStr: string): any => {
      const str = valStr.trim();

      // Handle type(...) calls
      const typeCallMatch = str.match(/^type\((.+)\)$/);
      if (typeCallMatch) {
        const targetVar = typeCallMatch[1].trim();
        if (targetVar in variables) return getTypeString(variables[targetVar]);
        return `NameError: name '${targetVar}' is not defined`;
      }

      // Handle explicit casts: int(...), float(...), str(...), bool(...)
      const castMatch = str.match(/^(int|float|str|bool)\((.+)\)$/);
      if (castMatch) {
        const inner = resolveExprValue(castMatch[2]);
        if (castMatch[1] === 'int') return parseInt(inner) || 0;
        if (castMatch[1] === 'float') return parseFloat(inner) || 0.0;
        if (castMatch[1] === 'str') return String(inner);
        if (castMatch[1] === 'bool') return inner === 'True' || inner === true;
      }

      // Lists/tuples
      if ((str.startsWith('[') && str.endsWith(']')) || (str.startsWith('(') && str.endsWith(')'))) {
        const content = str.slice(1, -1).trim();
        if (!content) return [];
        return content.split(',').map((item: string) => resolveExprValue(item));
      }

      if (str in variables) return variables[str];
      if (!isNaN(Number(str))) return Number(str);
      if (str === 'True') return true;
      if (str === 'False') return false;
      if (str === 'None') return null;
      return str.replace(/['"]/g, '');
    };

    // Assignment operators
    const opMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=|\*=|\/=|:=|=)\s*(.+)$/);
    if (opMatch) {
      const varName = opMatch[1];
      const op = opMatch[2];
      const val = resolveExprValue(opMatch[3]);
      if (op === '=' || op === ':=') variables[varName] = val;
      else if (op === '+=') variables[varName] = (variables[varName] ?? 0) + val;
      else if (op === '-=') variables[varName] = (variables[varName] ?? 0) - val;
      else if (op === '*=') variables[varName] = (variables[varName] ?? 1) * val;
      else if (op === '/=') variables[varName] = (variables[varName] ?? 1) / (val || 1);
      return;
    }

    // Print statements
    if (trimmed.startsWith('print(') || trimmed.startsWith('print ')) {
      let expr = '';

      if (trimmed.startsWith('print(')) {
        // Balanced paren extraction — avoids slicing off inner closing parens
        const inner = trimmed.slice(6); // after "print("
        let depth = 1, end = inner.length - 1;
        for (let ci = 0; ci < inner.length; ci++) {
          if (inner[ci] === '(') depth++;
          else if (inner[ci] === ')') {
            depth--;
            if (depth === 0) { end = ci; break; }
          }
        }
        expr = inner.slice(0, end).trim();
      } else {
        expr = trimmed.slice(6).trim(); // after "print "
      }

      if (!expr) return;

      // Top-level type() check
      const typeMatch = expr.match(/^type\((.+)\)$/);
      if (typeMatch) {
        const targetVar = typeMatch[1].trim();
        if (targetVar in variables) {
          logs.push(getTypeString(variables[targetVar]));
        } else {
          logs.push(`NameError: name '${targetVar}' is not defined`);
        }
        return;
      }

      const evaluated = resolveExprValue(expr);
      logs.push(String(evaluated));
      return;
    }
  };

  const runCodeSimulated = () => {
    setIsRunning(true);
    setOutput(null);
    setTimeout(() => {
      const logs: string[] = [];
      const lines = compiledCode.split('\n');
      const variables: Record<string, any> = {};
      logs.push(">>> Starting Execution of EvoScript Symbiote Output...");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

        if (trimmed.startsWith('if ')) {
          const ifMatch = trimmed.match(/^if (.+?):\s*(.+)$/);
          if (ifMatch) {
            if (evaluateCondition(ifMatch[1].trim(), variables)) {
              executeSingleStatement(ifMatch[2].trim(), variables, logs);
            }
            continue;
          }
          const blockMatch = trimmed.match(/^if (.+?):$/);
          if (blockMatch) {
            const conditionMet = evaluateCondition(blockMatch[1].trim(), variables);
            let j = i + 1;
            const subLines: string[] = [];
            while (j < lines.length && (lines[j].startsWith('    ') || lines[j].startsWith('\t') || lines[j].trim() === '')) {
              if (lines[j].trim()) subLines.push(lines[j].trim());
              j++;
            }
            if (conditionMet) subLines.forEach((s: string) => executeSingleStatement(s, variables, logs));
            i = j - 1;
            continue;
          }
        }

        executeSingleStatement(trimmed, variables, logs);
      }

      logs.push(">>> Execution completed successfully.");
      setOutput(logs);
      setIsRunning(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-neutral-800">
      <header className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-500 p-2 rounded-xl text-neutral-950 shadow-lg shadow-emerald-500/20">
            <BrainCircuit className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-200 to-neutral-100 bg-clip-text text-transparent">EvoScript Simulator</h1>
            <p className="text-xs text-neutral-400">Heuristic Engine &amp; Syntax Symbiote</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className="flex items-center text-xs bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1 text-neutral-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
            Autopilot Active
          </span>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        <div className="lg:col-span-3 space-y-6 flex flex-col h-full">
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-300 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-emerald-400" />
                Symbiote Stats
              </h2>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
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
            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Dynamic Insights</h3>
              {insights.length > 0 ? (
                <div className="space-y-3">
                  {insights.map((insight, idx) => (
                    <div key={idx} className={`p-3.5 rounded-xl border text-xs flex items-start ${insight.type === 'debt' ? 'bg-red-950/10 border-red-900/30 text-red-300' : 'bg-emerald-950/10 border-emerald-900/30 text-emerald-300'}`}>
                      {insight.type === 'debt'
                        ? <AlertTriangle className="w-4 h-4 mr-2.5 mt-0.5 text-red-400 flex-shrink-0" />
                        : <Zap className="w-4 h-4 mr-2.5 mt-0.5 text-emerald-400 flex-shrink-0" />}
                      <span>{insight.message}</span>
                    </div>
                  ))}
                </div>
              ) : !isAnalyzing && (
                <div className="text-center p-6 text-neutral-600 text-xs border border-dashed border-neutral-900 rounded-xl">
                  The Heuristic Engine is monitoring your environment.
                </div>
              )}
            </div>
          </div>

          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 flex-1 flex flex-col min-h-[250px]">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-300 pb-4 border-b border-neutral-900 flex items-center">
              <Sparkles className="w-4 h-4 mr-2 text-emerald-400" />
              Active Translations
            </h2>
            <div className="flex-1 overflow-y-auto pt-4 space-y-3 pr-1 max-h-[350px]">
              {evolvedSyntax.map((rule, idx) => (
                <div key={idx} className="bg-neutral-950/40 border border-neutral-900 p-3 rounded-xl space-y-1.5 hover:border-neutral-800 transition-colors">
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-emerald-400 font-mono bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800/80">{rule.keyword}</code>
                    <span className="text-[9px] text-neutral-500 uppercase tracking-wider font-mono">Matched</span>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">{rule.desc}</p>
                </div>
              ))}
              {evolvedSyntax.length === 0 && (
                <div className="text-center py-10 text-neutral-600 text-xs">
                  No matches. Write basic natural code like <code>print hello world</code> or <code>make variable count and set to 10</code> to see automatic rule matching.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-[500px]">
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4 mb-4">
              <div className="flex items-center space-x-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-neutral-300">Natural Language Input</span>
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">SimulType v1.4</span>
            </div>
            <textarea
              className="flex-1 bg-neutral-950/40 border border-neutral-900 rounded-xl p-4 text-sm font-mono text-neutral-300 focus:outline-none focus:border-emerald-500/50 resize-none leading-relaxed transition-all placeholder:text-neutral-600"
              placeholder="Write natural language ideas or standard scripts here..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="space-y-6 flex flex-col h-full">
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
                {compiledCode || 'Waiting for input script...'}
              </pre>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={runCodeSimulated}
                  disabled={isRunning || !compiledCode}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-xs flex items-center transition-all shadow-md shadow-emerald-500/10 disabled:shadow-none"
                >
                  {isRunning
                    ? <><div className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin mr-2" />Running Symbiote...</>
                    : <><Play className="w-3.5 h-3.5 mr-2 fill-neutral-950" />Run Code</>}
                </button>
              </div>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 h-[200px] flex flex-col">
              <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-neutral-900">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold tracking-wider uppercase text-neutral-400">Execution Output</span>
              </div>
              <div className="flex-1 bg-neutral-950 rounded-xl p-3.5 font-mono text-xs overflow-y-auto space-y-1 text-emerald-400/90 border border-neutral-900">
                {output ? output.map((line, idx) => (
                  <div key={idx} className={
                    line.startsWith('>>>') ? 'text-neutral-500 border-b border-neutral-900/50 pb-1 mb-1' :
                    line.startsWith('NameError') ? 'text-red-400' :
                    'text-neutral-300'
                  }>{line}</div>
                )) : (
                  <div className="text-neutral-600 italic">No logs. Click Run Code above to simulate program compilation and execution.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}