import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, Zap, AlertTriangle, Code2, BrainCircuit, Play,
  Terminal, ShieldCheck, Sparkles, Trash2, Copy, Check, RotateCcw
} from 'lucide-react';
import syntaxRulesJSON from './rules.json';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StyleProfile { quotes: string; naming: string; }
interface SyntaxRule { keyword: string; desc: string; }
interface Insight { type: 'debt' | 'optimization' | 'info'; message: string; }
interface ExecutionResult { line: string; type: 'system' | 'output' | 'error' | 'divider'; }

// ─── Constants ────────────────────────────────────────────────────────────────
const EXAMPLES = [
  {
    label: 'Variables & Types',
    code: `var name = "Alice"
int age = 25
show type of age
print name
print age`,
  },
  {
    label: 'If / Elif / Else',
    code: `int a = 10
int b = 20
if a is the same as b then print equal
alternatively if a is not the same as b then print not equal
otherwise then print fallback`,
  },
  {
    label: 'Arithmetic',
    code: `int score = 100
add 50 to score
subtract 30 from score
print score`,
  },
  {
    label: 'Lists',
    code: `var fruits = ["apple", "banana", "cherry"]
show type of fruits
print fruits`,
  },
];

const BLACKLISTED_RULE_KEYWORDS = new Set([
  'list files in "[path]"',
  'set self.[X] to [Y]',
  'list directory "[path]"',
  'list files in directory',
  'show files in "[path]"',
  'show directory "[path]"',
  'add X to Y',
  'subtract X from Y',
]);

// ─── Rule Scoring ─────────────────────────────────────────────────────────────
const getRuleScore = (rule: any): number => {
  let score = 0;
  const kw = rule.ruleKeyword as string;
  const pat = rule.pattern as string;
  if (kw.includes('then') && kw.includes('Z')) score += 10000;
  if (kw.includes('else if') || kw.includes('elif')) score += 5000;
  if (kw.includes('try') || kw.includes('error')) score += 3000;
  if (kw.includes('cast') || kw.includes('type') || kw.includes('isinstance')) score += 2000;
  if (kw.includes('file') || kw.includes('directory') || kw.includes('json')) score += 1500;
  if (kw.includes('list') || kw.includes('dict') || kw.includes('set')) score += 1000;
  if (kw.includes('random') || kw.includes('math') || kw.includes('date')) score += 1000;
  if (kw === 'printshowsaydisplaylog X') score -= 8000;
  if (kw === 'X = Y') score -= 9000;
  if (kw.includes('bare') || kw.includes('generic')) score -= 7000;
  score += ((pat.match(/\(\?!.*?\)|(?:\()/g) || []).length) * 100;
  score += pat.length * 0.1;
  return score;
};

// ─── Pre-processor ────────────────────────────────────────────────────────────
// Handles patterns that rules.json gets wrong. Runs BEFORE the rules engine.
const preProcessLine = (t: string): string | null => {
  // elif: not equal
  let m = t.match(/^(?:alternatively|alternately|else if|otherwise if)\s+if\s+(.+?)\s+(?:is not the same as|is not equal to|!=|isn't|isnt)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `elif ${m[1].trim()} != ${m[2].trim()}: ${m[3].trim()}`;

  // elif: equal
  m = t.match(/^(?:alternatively|alternately|else if|otherwise if)\s+if\s+(.+?)\s+(?:is the same as|is equal to|==)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `elif ${m[1].trim()} == ${m[2].trim()}: ${m[3].trim()}`;

  // elif: greater than
  m = t.match(/^(?:alternatively|alternately|else if|otherwise if)\s+if\s+(.+?)\s+(?:is bigger than|is greater than|is more than|>)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `elif ${m[1].trim()} > ${m[2].trim()}: ${m[3].trim()}`;

  // elif: less than
  m = t.match(/^(?:alternatively|alternately|else if|otherwise if)\s+if\s+(.+?)\s+(?:is smaller than|is less than|<)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `elif ${m[1].trim()} < ${m[2].trim()}: ${m[3].trim()}`;

  // else (bare — must NOT be followed by "if")
  m = t.match(/^(?:alternatively|alternately|otherwise)\s+(?!if\s)(?:then\s+)?(.+)$/i);
  if (m) return `else: ${m[1].trim()}`;

  // add X to Y → Y += X
  m = t.match(/^(?:add|increase|plus)\s+(.+?)\s+(?:to|onto|into)\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
  if (m) return `${m[2].trim()} += ${m[1].trim()}`;

  // subtract X from Y → Y -= X
  m = t.match(/^(?:subtract|decrease|minus|remove)\s+(.+?)\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
  if (m) return `${m[2].trim()} -= ${m[1].trim()}`;

  // multiply Y by X → Y *= X
  m = t.match(/^multiply\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+by\s+(.+)$/i);
  if (m) return `${m[1].trim()} *= ${m[2].trim()}`;

  // divide Y by X → Y /= X
  m = t.match(/^divide\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+by\s+(.+)$/i);
  if (m) return `${m[1].trim()} /= ${m[2].trim()}`;

  return null;
};

// ─── Safe RegExp Compiler ─────────────────────────────────────────────────────
const compilePattern = (pat: string, flags: string): RegExp =>
  new RegExp(pat.replace(/\?\?\?/g, '??'), flags);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function App() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [compiledCode, setCompiledCode] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [output, setOutput] = useState<ExecutionResult[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [styleProfile, setStyleProfile] = useState<StyleProfile>({ quotes: 'learning', naming: 'learning' });
  const [insights, setInsights] = useState<Insight[]>([]);
  const [evolvedSyntax, setEvolvedSyntax] = useState<SyntaxRule[]>([]);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [copiedCompiled, setCopiedCompiled] = useState(false);
  const [activeExample, setActiveExample] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);

  // ── Translation Engine ──────────────────────────────────────────────────────
  const analyzeWithHeuristics = (rawCode: string) => {
    setIsAnalyzing(true);
    const rawRules = Array.isArray(syntaxRulesJSON) ? syntaxRulesJSON : (syntaxRulesJSON as any)?.default;
    const isJsonConnected = Array.isArray(rawRules) && rawRules.length > 0;

    try {
      const newInsights: Insight[] = [];
      const currentEvolvedSyntax: SyntaxRule[] = [];
      let finalCodeLines: string[] = [];

      const rules = isJsonConnected
        ? [...rawRules]
            .filter((r: any) => !BLACKLISTED_RULE_KEYWORDS.has(r.ruleKeyword))
            .sort((a: any, b: any) => getRuleScore(b) - getRuleScore(a))
        : [];

      // Style detection
      const nonCommentLines = rawCode.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('//'));
      if (nonCommentLines.length > 0) {
        const sq = (rawCode.match(/'/g) || []).length;
        const dq = (rawCode.match(/"/g) || []).length;
        setStyleProfile({
          quotes: dq > sq ? 'Double' : sq > dq ? 'Single' : sq > 0 ? 'Mixed' : 'learning',
          naming: (() => {
            const snake = (rawCode.match(/[a-z_][a-z_0-9]*_[a-z]/g) || []).length;
            const camel = (rawCode.match(/[a-z][A-Z][a-zA-Z]*/g) || []).length;
            return snake > camel ? 'snake_case' : camel > snake ? 'camelCase' : snake > 0 ? 'Mixed' : 'learning';
          })(),
        });
      }

      if (isJsonConnected) {
        rawCode.split('\n').forEach(line => {
          if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('//')) {
            finalCodeLines.push(line);
            return;
          }
          const indent = (line.match(/^(\s*)/) || ['', ''])[1];
          const trimmed = line.trim();

          // Pre-processor runs first
          const pre = preProcessLine(trimmed);
          if (pre !== null) {
            finalCodeLines.push(indent + pre);
            const key = pre.startsWith('elif') ? 'elif ... (pre-processed)'
              : pre.startsWith('else') ? 'else: (pre-processed)'
              : 'arithmetic shorthand (pre-processed)';
            if (!currentEvolvedSyntax.some(s => s.keyword === key))
              currentEvolvedSyntax.push({ keyword: key, desc: 'Pre-processed before rules engine to ensure correct output.' });
            return;
          }

          // Rules engine
          let translatedLine = line;
          let matched = false;

          for (const rule of rules) {
            try {
              const pattern = compilePattern(rule.pattern, rule.flags);
              if (!pattern.test(trimmed)) continue;

              let translation = trimmed.replace(pattern, rule.replace);

              // Handle tab-separated nested expressions
              if (translation.includes('\t')) {
                const [left, right] = translation.split('\t');
                let resolvedRight = right;
                for (const nested of rules) {
                  try {
                    const np = compilePattern(nested.pattern, nested.flags);
                    if (np.test(resolvedRight)) {
                      resolvedRight = resolvedRight.replace(np, nested.replace);
                      break;
                    }
                  } catch {}
                }
                translation = left + resolvedRight;
              }

              translatedLine = indent + translation;
              if (!currentEvolvedSyntax.some(s => s.keyword === rule.ruleKeyword))
                currentEvolvedSyntax.push({ keyword: rule.ruleKeyword, desc: rule.desc });
              matched = true;
              break;
            } catch (e) {
              console.warn('Skipped bad rule:', rule.ruleKeyword, e);
            }
          }

          // C-style for loop fallback
          if (!matched && /^for\s*\(/.test(trimmed)) {
            translatedLine = indent + trimmed.replace(
              /for\s*\(?(?:let|var|int)?\s*([a-zA-Z_]+)\s*=\s*([^;]+);\s*[^;]+;\s*[^)]+\)?/,
              'for $1 in range($2, $3)'
            );
            if (!currentEvolvedSyntax.some(s => s.keyword === 'C-style for loop'))
              currentEvolvedSyntax.push({ keyword: 'C-style for loop', desc: 'Translated C/JS for-loop to Python range().' });
          }

          finalCodeLines.push(translatedLine);
        });
      } else {
        finalCodeLines = rawCode.split('\n');
      }

      let finalCode = finalCodeLines.join('\n');

      // Strip type/var keywords
      if (/\b(var|let|const|int|float|string|bool)\s+[a-zA-Z0-9_]+\s*=/.test(finalCode)) {
        newInsights.push({ type: 'optimization', message: 'Type/var keywords stripped — Python uses dynamic typing.' });
        finalCode = finalCode.replace(/\b(var|let|const|int|float|string|bool)\s+([a-zA-Z0-9_]+)\s*=/g, '$2 =');
      }

      if (currentEvolvedSyntax.length === 0 && nonCommentLines.length > 0)
        newInsights.push({ type: 'info', message: 'No natural language patterns detected. Looks like standard Python!' });

      setEvolvedSyntax(currentEvolvedSyntax);
      setInsights(newInsights);
      setCompiledCode(finalCode);
    } catch (e) {
      console.error('Translation engine crash:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => analyzeWithHeuristics(code), 300);
    return () => clearTimeout(t);
  }, [code]);

  // ── Executor ─────────────────────────────────────────────────────────────────
  const getTypeString = (val: any): string => {
    if (val === null || val === undefined) return "<class 'NoneType'>";
    if (typeof val === 'boolean') return "<class 'bool'>";
    if (Array.isArray(val)) return "<class 'list'>";
    if (typeof val === 'number') return Number.isInteger(val) ? "<class 'int'>" : "<class 'float'>";
    return "<class 'str'>";
  };

  const resolveValue = (str: string, variables: Record<string, any>): any => {
    const s = str.trim();

    // type(x)
    const typeMatch = s.match(/^type\((.+)\)$/);
    if (typeMatch) {
      const v = typeMatch[1].trim();
      return v in variables ? getTypeString(variables[v]) : `NameError: '${v}' is not defined`;
    }

    // cast: int(...), float(...), str(...), bool(...)
    const castMatch = s.match(/^(int|float|str|bool)\((.+)\)$/);
    if (castMatch) {
      const inner = resolveValue(castMatch[2], variables);
      if (castMatch[1] === 'int') return parseInt(inner) || 0;
      if (castMatch[1] === 'float') return parseFloat(inner) || 0.0;
      if (castMatch[1] === 'str') return String(inner);
      if (castMatch[1] === 'bool') return !!inner;
    }

    // len(x)
    const lenMatch = s.match(/^len\((.+)\)$/);
    if (lenMatch) {
      const v = resolveValue(lenMatch[1], variables);
      return Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : 0;
    }

    // list / tuple literals
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('(') && s.endsWith(')'))) {
      const content = s.slice(1, -1).trim();
      return content ? content.split(',').map(i => resolveValue(i, variables)) : [];
    }

    // string literal
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
      return s.slice(1, -1);

    // simple math expression (only variables and numbers)
    if (/^[\w\s\+\-\*\/\%\(\)\.]+$/.test(s) && /[\+\-\*\/]/.test(s)) {
      try {
        const expr = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (_, name) =>
          name in variables ? String(variables[name]) : '0'
        );
        // eslint-disable-next-line no-new-func
        return Function('"use strict"; return (' + expr + ')')();
      } catch {}
    }

    if (s in variables) return variables[s];
    if (!isNaN(Number(s))) return Number(s);
    if (s === 'True') return true;
    if (s === 'False') return false;
    if (s === 'None') return null;
    return s;
  };

  const evaluateCondition = (expr: string, variables: Record<string, any>): boolean => {
    const rv = (t: string) => resolveValue(t, variables);
    if (expr.includes(' == ')) { const [a, b] = expr.split(' == '); return rv(a) == rv(b); }
    if (expr.includes(' != ')) { const [a, b] = expr.split(' != '); return rv(a) != rv(b); }
    if (expr.includes(' >= ')) { const [a, b] = expr.split(' >= '); return rv(a) >= rv(b); }
    if (expr.includes(' <= ')) { const [a, b] = expr.split(' <= '); return rv(a) <= rv(b); }
    if (expr.includes(' > '))  { const [a, b] = expr.split(' > ');  return rv(a) >  rv(b); }
    if (expr.includes(' < '))  { const [a, b] = expr.split(' < ');  return rv(a) <  rv(b); }
    if (expr.includes(' in ')) {
      const [a, b] = expr.split(' in ');
      const el = rv(a), cont = rv(b);
      return Array.isArray(cont) ? cont.includes(el) : String(cont).includes(String(el));
    }
    if (expr.includes(' not in ')) {
      const [a, b] = expr.split(' not in ');
      const el = rv(a), cont = rv(b);
      return Array.isArray(cont) ? !cont.includes(el) : !String(cont).includes(String(el));
    }
    return !!rv(expr);
  };

  const executeSingleStatement = (
    stmt: string,
    variables: Record<string, any>,
    logs: ExecutionResult[]
  ) => {
    const t = stmt.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) return;

    // print(...)  or  print ...
    if (t.startsWith('print(') || t.startsWith('print ')) {
      let expr = '';
      if (t.startsWith('print(')) {
        const inner = t.slice(6);
        let depth = 1, end = inner.length - 1;
        for (let i = 0; i < inner.length; i++) {
          if (inner[i] === '(') depth++;
          else if (inner[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
        }
        expr = inner.slice(0, end).trim();
      } else {
        expr = t.slice(6).trim();
      }
      if (!expr) return;
      const val = resolveValue(expr, variables);
      const isErr = typeof val === 'string' && val.startsWith('NameError');
      logs.push({ line: String(val), type: isErr ? 'error' : 'output' });
      return;
    }

    // assignment / compound operators
    const opMatch = t.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=|\*=|\/=|%=|:=|=)\s*(.+)$/);
    if (opMatch) {
      const [, name, op, rhs] = opMatch;
      const val = resolveValue(rhs, variables);
      if (op === '=' || op === ':=') variables[name] = val;
      else if (op === '+=') variables[name] = (Number(variables[name]) || 0) + Number(val);
      else if (op === '-=') variables[name] = (Number(variables[name]) || 0) - Number(val);
      else if (op === '*=') variables[name] = (Number(variables[name]) || 1) * Number(val);
      else if (op === '/=') variables[name] = (Number(variables[name]) || 0) / (Number(val) || 1);
      else if (op === '%=') variables[name] = (Number(variables[name]) || 0) % (Number(val) || 1);
      return;
    }

    // .append(x)
    const appendMatch = t.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.append\((.+)\)$/);
    if (appendMatch) {
      const arr = variables[appendMatch[1]];
      if (Array.isArray(arr)) arr.push(resolveValue(appendMatch[2], variables));
      return;
    }
  };

  const runCodeSimulated = () => {
    setIsRunning(true);
    setOutput(null);
    setTimeout(() => {
      const logs: ExecutionResult[] = [
        { line: '>>> EvoScript Symbiote — Execution started', type: 'system' },
        { line: '', type: 'divider' },
      ];
      const lines = compiledCode.split('\n');
      const variables: Record<string, any> = {};
      let lastConditionMet: boolean | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

        // inline if/elif/else: "if ...: action"
        const inlineMatch = trimmed.match(/^(if|elif|else)\s*(.*?):\s+(.+)$/);
        if (inlineMatch) {
          const [, kw, cond, action] = inlineMatch;
          if (kw === 'if') {
            lastConditionMet = evaluateCondition(cond.trim(), variables);
            if (lastConditionMet) executeSingleStatement(action, variables, logs);
          } else if (kw === 'elif' && !lastConditionMet) {
            const met = evaluateCondition(cond.trim(), variables);
            if (met) { executeSingleStatement(action, variables, logs); lastConditionMet = true; }
          } else if (kw === 'else' && !lastConditionMet) {
            executeSingleStatement(action, variables, logs);
            lastConditionMet = true;
          }
          continue;
        }

        // block if/elif/else:
        const blockMatch = trimmed.match(/^(if|elif|else)\s*(.*?):$/);
        if (blockMatch) {
          const [, kw, cond] = blockMatch;
          let met = false;
          if (kw === 'if') { met = evaluateCondition(cond.trim(), variables); lastConditionMet = met; }
          else if (kw === 'elif') { met = !lastConditionMet && evaluateCondition(cond.trim(), variables); if (met) lastConditionMet = true; }
          else if (kw === 'else') { met = !lastConditionMet; }
          let j = i + 1;
          const block: string[] = [];
          while (j < lines.length && (lines[j].startsWith('    ') || lines[j].startsWith('\t') || !lines[j].trim())) {
            if (lines[j].trim()) block.push(lines[j].trim());
            j++;
          }
          if (met) block.forEach(s => executeSingleStatement(s, variables, logs));
          i = j - 1;
          continue;
        }

        if (!trimmed.startsWith('elif') && !trimmed.startsWith('else')) lastConditionMet = null;
        executeSingleStatement(trimmed, variables, logs);
      }

      logs.push({ line: '', type: 'divider' });
      logs.push({ line: '>>> Execution completed successfully', type: 'system' });

      // Show final variable state
      const varEntries = Object.entries(variables);
      if (varEntries.length > 0) {
        logs.push({ line: '', type: 'divider' });
        logs.push({ line: '>>> Variable state at exit:', type: 'system' });
        varEntries.forEach(([k, v]) => {
          logs.push({ line: `    ${k} = ${JSON.stringify(v)}`, type: 'output' });
        });
      }

      setOutput(logs);
      setIsRunning(false);
      setTimeout(() => outputRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    }, 800);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const copyToClipboard = (text: string, which: 'output' | 'compiled') => {
    navigator.clipboard.writeText(text).then(() => {
      if (which === 'output') { setCopiedOutput(true); setTimeout(() => setCopiedOutput(false), 2000); }
      else { setCopiedCompiled(true); setTimeout(() => setCopiedCompiled(false), 2000); }
    });
  };

  const loadExample = (idx: number) => {
    setActiveExample(idx);
    setCode(EXAMPLES[idx].code);
    setOutput(null);
  };

  const lineCount = code.split('\n').length;
  const outputLineCount = output?.filter(l => l.type === 'output').length ?? 0;

  // ── UI ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">

      {/* Header */}
      <header className="border-b border-neutral-900 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-40 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 p-2 rounded-xl text-neutral-950 shadow-lg shadow-emerald-500/20">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-neutral-200 bg-clip-text text-transparent">
              EvoScript Simulator
            </h1>
            <p className="text-[11px] text-neutral-500">Natural language → Python • Heuristic Engine v2</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="hidden sm:flex items-center text-xs bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1 text-neutral-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
            Autopilot Active
          </span>
        </div>
      </header>

      {/* Example Picker */}
      <div className="border-b border-neutral-900 bg-neutral-950/60 px-6 py-2 flex items-center space-x-2 overflow-x-auto">
        <span className="text-[11px] text-neutral-500 whitespace-nowrap mr-1">Examples:</span>
        {EXAMPLES.map((ex, idx) => (
          <button
            key={idx}
            onClick={() => loadExample(idx)}
            className={`text-[11px] px-3 py-1 rounded-full border whitespace-nowrap transition-all ${
              activeExample === idx
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-300'
            }`}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* Main Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-hidden">

        {/* Left sidebar */}
        <div className="lg:col-span-3 space-y-4 flex flex-col">

          {/* Style Profile */}
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-900">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center">
                <Activity className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />Style Profile
              </h2>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['Quotes', styleProfile.quotes], ['Naming', styleProfile.naming], ['Lines', String(lineCount)], ['Outputs', String(outputLineCount)]].map(([label, val]) => (
                <div key={label} className="bg-neutral-950/60 p-2.5 rounded-xl border border-neutral-900">
                  <p className="text-[10px] text-neutral-500 uppercase mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-neutral-200 truncate">{val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Insights */}
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 pb-3 mb-3 border-b border-neutral-900 flex items-center">
              <Zap className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />Insights
            </h2>
            {insights.length > 0 ? (
              <div className="space-y-2">
                {insights.map((ins, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    ins.type === 'debt' ? 'bg-red-950/10 border-red-900/30 text-red-300'
                    : ins.type === 'info' ? 'bg-blue-950/10 border-blue-900/30 text-blue-300'
                    : 'bg-emerald-950/10 border-emerald-900/30 text-emerald-300'
                  }`}>
                    {ins.type === 'debt' ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      : <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                    {ins.message}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-neutral-600 text-xs py-4 border border-dashed border-neutral-900 rounded-xl">
                No insights yet.
              </p>
            )}
          </div>

          {/* Active Translations */}
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex-1 flex flex-col min-h-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 pb-3 mb-3 border-b border-neutral-900 flex items-center">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Active Translations
              {evolvedSyntax.length > 0 && (
                <span className="ml-auto bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0.5 rounded-full">
                  {evolvedSyntax.length}
                </span>
              )}
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
              {evolvedSyntax.length > 0 ? evolvedSyntax.map((rule, idx) => (
                <div key={idx} className="bg-neutral-950/40 border border-neutral-900 p-2.5 rounded-xl hover:border-neutral-800 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-[11px] text-emerald-400 font-mono bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800/80 truncate max-w-[140px]">
                      {rule.keyword}
                    </code>
                    <span className="text-[9px] text-neutral-600 uppercase font-mono ml-1 flex-shrink-0">matched</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">{rule.desc}</p>
                </div>
              )) : (
                <div className="text-center py-6 text-neutral-600 text-xs">
                  Write natural language code to see matched rules here.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center + Right editors */}
        <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[500px]">

          {/* Input */}
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-900">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-neutral-300">Input</span>
                <span className="text-[10px] text-neutral-600 font-mono">natural language / python</span>
              </div>
              <button
                onClick={() => { setCode(''); setOutput(null); }}
                className="text-neutral-600 hover:text-red-400 transition-colors p-1 rounded"
                title="Clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              className="flex-1 bg-neutral-950/40 border border-neutral-900 rounded-xl p-3.5 text-sm font-mono text-neutral-300 focus:outline-none focus:border-emerald-500/40 resize-none leading-relaxed transition-all placeholder:text-neutral-600"
              placeholder={`Try writing:\nprint hello world\nmake a variable called x and set it to 10\nif x is greater than 5 then print big\nalternatively then print small`}
              value={code}
              onChange={e => setCode(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-neutral-600 font-mono">{lineCount} line{lineCount !== 1 ? 's' : ''}</span>
              <button
                onClick={() => { setCode(code); analyzeWithHeuristics(code); }}
                className="text-[11px] text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Re-analyse
              </button>
            </div>
          </div>

          {/* Output column */}
          <div className="flex flex-col gap-4 h-full">

            {/* Translated Python */}
            <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-900">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-neutral-300">Translated Python</span>
                  {isAnalyzing && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />}
                </div>
                <button
                  onClick={() => copyToClipboard(compiledCode, 'compiled')}
                  className="text-neutral-600 hover:text-neutral-300 transition-colors p-1 rounded"
                  title="Copy"
                >
                  {copiedCompiled ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <pre className="flex-1 bg-neutral-950/40 border border-neutral-900 rounded-xl p-3.5 text-sm font-mono text-emerald-300/90 overflow-y-auto leading-relaxed select-all min-h-[120px]">
                {compiledCode || <span className="text-neutral-600">Waiting for input...</span>}
              </pre>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={runCodeSimulated}
                  disabled={isRunning || !compiledCode.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-500/10 disabled:shadow-none"
                >
                  {isRunning
                    ? <><div className="w-3.5 h-3.5 border-2 border-neutral-950/50 border-t-neutral-950 rounded-full animate-spin" />Running...</>
                    : <><Play className="w-3.5 h-3.5 fill-neutral-950" />Run Code</>}
                </button>
              </div>
            </div>

            {/* Execution Output */}
            <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex flex-col" style={{ height: '220px' }}>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-900">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Output</span>
                  {output && <span className="text-[10px] text-neutral-600 font-mono">{outputLineCount} line{outputLineCount !== 1 ? 's' : ''}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {output && (
                    <button
                      onClick={() => copyToClipboard(output.filter(l => l.type === 'output').map(l => l.line).join('\n'), 'output')}
                      className="text-neutral-600 hover:text-neutral-300 transition-colors p-1 rounded"
                      title="Copy output"
                    >
                      {copiedOutput ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {output && (
                    <button onClick={() => setOutput(null)} className="text-neutral-600 hover:text-red-400 transition-colors p-1 rounded" title="Clear output">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div ref={outputRef} className="flex-1 bg-neutral-950 rounded-xl p-3 font-mono text-xs overflow-y-auto space-y-0.5 border border-neutral-900">
                {output ? output.map((entry, idx) => (
                  entry.type === 'divider'
                    ? <div key={idx} className="border-t border-neutral-900 my-1" />
                    : <div key={idx} className={
                        entry.type === 'system' ? 'text-neutral-600' :
                        entry.type === 'error' ? 'text-red-400' :
                        'text-neutral-200'
                      }>{entry.line}</div>
                )) : (
                  <div className="text-neutral-600 italic text-center py-4">
                    Click <span className="text-emerald-500 not-italic font-medium">Run Code</span> to execute
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}