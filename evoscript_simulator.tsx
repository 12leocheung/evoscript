import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, Zap, AlertTriangle, Code2, BrainCircuit, Play,
  Terminal, ShieldCheck, Sparkles, Trash2, Copy, Check, RotateCcw,
  BookOpen, X, Search, ChevronRight
} from 'lucide-react';
import syntaxRulesJSON from './rules.json';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StyleProfile { quotes: string; naming: string; }
interface SyntaxRule { keyword: string; desc: string; }
interface Insight { type: 'debt' | 'optimization' | 'info'; message: string; }
interface ExecutionResult { line: string; type: 'system' | 'output' | 'error' | 'divider'; }
interface RuleEntry { ruleKeyword: string; desc: string; pattern: string; replace: string; flags: string; }

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

const BUILTIN_COMMANDS = [
  {
    category: 'Conditionals (pre-processed)',
    commands: [
      { keyword: 'alternatively if X is not the same as Y then Z', desc: 'elif X != Y: Z', example: 'alternatively if a is not the same as b then print no' },
      { keyword: 'alternatively if X is the same as Y then Z', desc: 'elif X == Y: Z', example: 'alternatively if score is the same as 100 then print perfect' },
      { keyword: 'alternatively if X is bigger than Y then Z', desc: 'elif X > Y: Z', example: 'alternatively if age is bigger than 18 then print adult' },
      { keyword: 'alternatively if X is smaller than Y then Z', desc: 'elif X < Y: Z', example: 'alternatively if score is smaller than 50 then print fail' },
      { keyword: 'alternatively then Z / otherwise then Z', desc: 'else: Z', example: 'otherwise then print unknown' },
    ],
  },
  {
    category: 'Arithmetic (pre-processed)',
    commands: [
      { keyword: 'add X to Y', desc: 'Y += X', example: 'add 5 to score' },
      { keyword: 'subtract X from Y', desc: 'Y -= X', example: 'subtract 10 from health' },
      { keyword: 'multiply Y by X', desc: 'Y *= X', example: 'multiply score by 2' },
      { keyword: 'divide Y by X', desc: 'Y /= X', example: 'divide total by 4' },
    ],
  },
  {
    category: 'Inline Math Words (post-processed)',
    commands: [
      { keyword: 'X times Y', desc: 'X * Y', example: 'make variable x 5 times 3' },
      { keyword: 'X plus Y', desc: 'X + Y', example: 'make variable y 10 plus 2' },
      { keyword: 'X minus Y', desc: 'X - Y', example: 'make variable z 9 minus 4' },
      { keyword: 'X divided by Y', desc: 'X / Y', example: 'make variable r 10 divided by 2' },
      { keyword: 'X to the power of Y', desc: 'X ** Y', example: 'make variable p 2 to the power of 8' },
      { keyword: 'X squared', desc: 'X ** 2', example: 'make variable s n squared' },
      { keyword: 'X modulo Y', desc: 'X % Y', example: 'make variable m 10 modulo 3' },
    ],
  },
];

// ─── Rule Scoring ─────────────────────────────────────────────────────────────
// Rules are scored so that SPECIFIC patterns beat GENERIC ones.
// The pre-processor already handles print/if/elif/else/arithmetic, so
// the JSON engine only runs on lines the pre-processor didn't claim.
// Within the JSON engine, specificity (number of capture groups + anchors)
// beats raw pattern length — long synonym lists must not win by size alone.
const getRuleScore = (rule: any): number => {
  let score = 0;
  const kw: string = rule.ruleKeyword || '';
  const pat: string = rule.pattern || '';

  // Specific structural patterns get priority
  if (kw.includes('then') || kw.includes('[Z]')) score += 10000;
  if (kw.includes('else if') || kw.includes('elif')) score += 5000;
  if (kw.includes('try') || kw.includes('error')) score += 3000;
  if (kw.includes('cast') || kw.includes('type') || kw.includes('isinstance')) score += 2000;
  if (kw.includes('file') || kw.includes('directory') || kw.includes('json')) score += 1500;
  if (kw.includes('list') || kw.includes('dict') || kw.includes('set')) score += 1000;
  if (kw.includes('random') || kw.includes('math') || kw.includes('date')) score += 1000;

  // Heavily penalise catch-all / bare passthrough rules — they should only
  // fire if nothing more specific matched
  if (kw === '[X] = [Y]') score -= 9000;
  if (kw.includes('bare') || kw.includes('generic')) score -= 7000;

  // Score by number of NAMED capture groups (specificity), NOT by raw length.
  // Long synonym alternation lists inflate pat.length without adding specificity.
  const captureGroups = (pat.match(/\((?!\?[=!:])/g) || []).length;
  score += captureGroups * 200;

  // Small length bonus capped so bloated synonym lists can't dominate
  score += Math.min(pat.length * 0.05, 300);

  return score;
};

// ─── Pre-processor ────────────────────────────────────────────────────────────
// Handles the most common natural-language constructs BEFORE the JSON rule
// engine runs. Anything matched here is guaranteed correct and fast.
// The JSON engine only sees lines that fall through all of these.
const preProcessLine = (t: string): string | null => {
  let m: RegExpMatchArray | null;

  // ── show type of X  (must come before generic print/show rule) ──────────────
  m = t.match(/^(?:show|print|get|check|display|what is(?: the)?)\s+type(?:\s+of)?\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
  if (m) return `print(type(${m[1].trim()}))`;

  // ── Print / output ─────────────────────────────────────────────────────────
  // "print X", "show X", "say X", "display X", "log X", "output X", "echo X"
  // Must run BEFORE the JSON engine so synonym-heavy rules can't steal it.
  m = t.match(/^(?:print|show|say|display|log|output|echo|write out|put out|emit|dump)\s+(.+)$/i);
  if (m) {
    const arg = m[1].trim();
    // If already wrapped in parens leave as-is, otherwise wrap
    return /^\(.*\)$/.test(arg) ? `print${arg}` : `print(${arg})`;
  }

  // ── Single-line if: "if X (comp) Y then Z" ────────────────────────────────
  m = t.match(/^if\s+(.+?)\s+(?:is not the same as|is not equal to|!=|isn't|isnt)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `if ${m[1].trim()} != ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^if\s+(.+?)\s+(?:is the same as|is equal to|==|equals)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `if ${m[1].trim()} == ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^if\s+(.+?)\s+(?:is bigger than|is greater than|is more than|>)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `if ${m[1].trim()} > ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^if\s+(.+?)\s+(?:is smaller than|is less than|<)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `if ${m[1].trim()} < ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^if\s+(.+?)\s+(?:>=|is at least|is greater than or equal to)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `if ${m[1].trim()} >= ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^if\s+(.+?)\s+(?:<=|is at most|is less than or equal to)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `if ${m[1].trim()} <= ${m[2].trim()}: ${m[3].trim()}`;

  // ── elif / else ────────────────────────────────────────────────────────────
  m = t.match(/^(?:alternatively|alternately|else if|otherwise if)\s+if\s+(.+?)\s+(?:is not the same as|is not equal to|!=|isn't|isnt)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `elif ${m[1].trim()} != ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^(?:alternatively|alternately|else if|otherwise if)\s+if\s+(.+?)\s+(?:is the same as|is equal to|==)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `elif ${m[1].trim()} == ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^(?:alternatively|alternately|else if|otherwise if)\s+if\s+(.+?)\s+(?:is bigger than|is greater than|is more than|>)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `elif ${m[1].trim()} > ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^(?:alternatively|alternately|else if|otherwise if)\s+if\s+(.+?)\s+(?:is smaller than|is less than|<)\s+(.+?)\s+then\s+(.+)$/i);
  if (m) return `elif ${m[1].trim()} < ${m[2].trim()}: ${m[3].trim()}`;

  m = t.match(/^(?:alternatively|alternately|otherwise)\s+(?!if\s)(?:then\s+)?(.+)$/i);
  if (m) return `else: ${m[1].trim()}`;

  // ── Arithmetic shorthands ──────────────────────────────────────────────────
  m = t.match(/^(?:add|increase|plus)\s+(.+?)\s+(?:to|onto|into)\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
  if (m) return `${m[2].trim()} += ${m[1].trim()}`;

  m = t.match(/^(?:subtract|decrease|minus|remove)\s+(.+?)\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
  if (m) return `${m[2].trim()} -= ${m[1].trim()}`;

  m = t.match(/^multiply\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+by\s+(.+)$/i);
  if (m) return `${m[1].trim()} *= ${m[2].trim()}`;

  m = t.match(/^divide\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+by\s+(.+)$/i);
  if (m) return `${m[1].trim()} /= ${m[2].trim()}`;

  return null;
};

// ─── Post-processor: math words → operators ───────────────────────────────────
const postProcessMathWords = (line: string): string =>
  line
    .replace(/\bto the power of\b/gi, '**')
    .replace(/\bdivided by\b/gi, '/')
    .replace(/\btimes\b/g, '*')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\bmodulo\b/gi, '%')
    .replace(/\bsquared\b/g, '** 2')
    .replace(/\bcubed\b/g, '** 3');

// ─── compilePattern ───────────────────────────────────────────────────────────
const compilePattern = (pat: string, flags: string): RegExp =>
  new RegExp(pat.replace(/\?\?\?/g, '??'), flags);

// ─── Commands Reference Modal ─────────────────────────────────────────────────
const CommandsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'builtin' | 'rules'>('builtin');

  const rawRules: RuleEntry[] = Array.isArray(syntaxRulesJSON)
    ? syntaxRulesJSON as RuleEntry[]
    : (syntaxRulesJSON as any)?.default ?? [];

  const filteredRules = rawRules.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.ruleKeyword.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
  });

  const grouped: Record<string, RuleEntry[]> = {};
  filteredRules.forEach(r => {
    const cat = r.desc.match(/^([A-Z][a-z]+(?:\s+[a-z]+)?)/)?.[1] ?? 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  });

  const filteredBuiltins = BUILTIN_COMMANDS.map(cat => ({
    ...cat,
    commands: cat.commands.filter(c => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return c.keyword.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.example.toLowerCase().includes(q);
    }),
  })).filter(cat => cat.commands.length > 0);

  const totalBuiltin = BUILTIN_COMMANDS.reduce((a, c) => a + c.commands.length, 0);
  const totalRules = rawRules.length;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-neutral-100">Commands Reference</h2>
              <p className="text-[11px] text-neutral-500">All supported EvoScript syntax and natural language patterns</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 p-1.5 rounded-lg hover:bg-neutral-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-neutral-900 flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search commands..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-9 py-2 text-sm text-neutral-300 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex border-b border-neutral-900 px-6 flex-shrink-0">
          {[
            { key: 'builtin', label: 'Built-in Patterns', count: totalBuiltin },
            { key: 'rules', label: 'rules.json', count: totalRules },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === tab.key
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-neutral-900 text-neutral-500 border border-neutral-800'
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0">
          {activeTab === 'builtin' ? (
            filteredBuiltins.length > 0 ? filteredBuiltins.map((cat, ci) => (
              <div key={ci}>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-neutral-800 flex-shrink-0" />
                  {cat.category}
                  <span className="flex-1 h-px bg-neutral-900" />
                </h3>
                <div className="space-y-2">
                  {cat.commands.map((cmd, i) => (
                    <div key={i} className="bg-neutral-900/50 border border-neutral-900 rounded-xl p-3.5 hover:border-neutral-800 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                        <code className="text-sm text-emerald-400 font-mono leading-relaxed">{cmd.keyword}</code>
                        <span className="text-xs text-neutral-400 font-mono bg-neutral-950 border border-neutral-800 px-2 py-0.5 rounded-lg whitespace-nowrap flex-shrink-0">
                          → {cmd.desc}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ChevronRight className="w-3 h-3 text-neutral-600 flex-shrink-0" />
                        <code className="text-[11px] text-neutral-500 font-mono">{cmd.example}</code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="text-center py-16 text-neutral-600 text-sm">No built-in commands match "{search}"</div>
            )
          ) : (
            Object.keys(grouped).length > 0 ? Object.entries(grouped).map(([cat, rules]) => (
              <div key={cat}>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-neutral-800 flex-shrink-0" />
                  {cat}
                  <span className="text-[10px] text-neutral-700 font-mono normal-case tracking-normal">({rules.length})</span>
                  <span className="flex-1 h-px bg-neutral-900" />
                </h3>
                <div className="space-y-2">
                  {rules.map((rule, i) => (
                    <div key={i} className="bg-neutral-900/50 border border-neutral-900 rounded-xl p-3.5 hover:border-neutral-800 transition-colors">
                      <code className="text-sm text-emerald-400 font-mono block mb-1.5">{rule.ruleKeyword}</code>
                      <p className="text-[11px] text-neutral-500 leading-relaxed mb-2">{rule.desc}</p>
                      <span className="text-[10px] text-neutral-600 font-mono bg-neutral-950 border border-neutral-905 px-2 py-0.5 rounded inline-block">
                        → {rule.replace.replace(/\t/g, ' ').slice(0, 80)}{rule.replace.length > 80 ? '…' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="text-center py-16 text-neutral-600 text-sm">No rules match "{search}"</div>
            )
          )}
        </div>

        <div className="px-6 py-3 border-t border-neutral-900 flex items-center justify-between flex-shrink-0">
          <p className="text-[11px] text-neutral-600">
            {activeTab === 'builtin' ? `${totalBuiltin} built-in patterns` : `${totalRules} rules loaded from rules.json`}
          </p>
          <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors border border-neutral-800 hover:border-neutral-700 px-3 py-1.5 rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
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
  const [showCommands, setShowCommands] = useState(false);
  const [jsonConnected, setJsonConnected] = useState<boolean | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // ── Translation Engine ──────────────────────────────────────────────────────
  const analyzeWithHeuristics = (rawCode: string) => {
    setIsAnalyzing(true);

    const rawRules: RuleEntry[] = (() => {
      const r = syntaxRulesJSON as any;
      if (Array.isArray(r)) return r;
      if (Array.isArray(r?.default)) return r.default;
      return [];
    })();

    const isJsonConnected = rawRules.length > 0;
    setJsonConnected(isJsonConnected);

    try {
      const newInsights: Insight[] = [];
      const currentEvolvedSyntax: SyntaxRule[] = [];
      let finalCodeLines: string[] = [];

      const rules = isJsonConnected
        ? [...rawRules].sort((a, b) => getRuleScore(b) - getRuleScore(a))
        : [];

      // Style profiling
      const nonCommentLines = rawCode.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('//'));
      if (nonCommentLines.length > 0) {
        const sq = (rawCode.match(/'/g) || []).length;
        const dq = (rawCode.match(/"/g) || []).length;
        setStyleProfile({
          quotes: dq > sq ? 'Double' : sq > dq ? 'Single' : sq > 0 ? 'Mixed' : 'learning',
          naming: (() => {
            const snake = (rawCode.match(/\b[a-z]+_[a-z]+\b/g) || []).length;
            const camel = (rawCode.match(/\b[a-z]+[A-Z][a-z]+\b/g) || []).length;
            return snake > camel ? 'snake_case' : camel > snake ? 'camelCase' : snake > 0 ? 'Mixed' : 'learning';
          })(),
        });
      }

      // ── Multi-statement splitter ─────────────────────────────────────────────
      // Expands each raw line into potentially several logical lines before
      // the rule engine runs. Handles two cases:
      //   1. Semicolons:  "set x to 5; print x"      → two separate lines
      //   2. Bare "then": "set x to 5 then print x"  → split into two lines
      //      (If/elif/else cases are handled by preProcessLine, left intact)
      const splitIntoLogicalLines = (raw: string): string[] => {
        const indent = (raw.match(/^(\s*)/) || ['', ''])[1];
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return [raw];

        // Split on semicolons (respecting quoted strings)
        const semiParts: string[] = [];
        let buf = '';
        let inStr: string | null = null;
        for (let i = 0; i < trimmed.length; i++) {
          const ch = trimmed[i];
          if (inStr) { buf += ch; if (ch === inStr) inStr = null; }
          else if (ch === '"' || ch === "'") { inStr = ch; buf += ch; }
          else if (ch === ';') { if (buf.trim()) semiParts.push(buf.trim()); buf = ''; }
          else { buf += ch; }
        }
        if (buf.trim()) semiParts.push(buf.trim());

        // For each segment, split on bare "then" that isn't part of an if/elif/otherwise clause
        const isConditionalLine = /^(?:if|alternatively|alternately|else if|otherwise if|otherwise)\b/i.test(trimmed);
        const expanded: string[] = [];
        for (const part of semiParts) {
          if (!isConditionalLine && /\bthen\b/i.test(part)) {
            const thenIdx = part.search(/\bthen\b/i);
            const left = part.slice(0, thenIdx).trim();
            const right = part.slice(thenIdx + 4).trim();
            if (left && right && !/^if\b/i.test(left)) {
              expanded.push(indent + left);
              expanded.push(indent + right);
              continue;
            }
          }
          expanded.push(indent + part);
        }
        return expanded;
      };

      if (isJsonConnected) {
        const expandedLines = rawCode.split('\n').flatMap(splitIntoLogicalLines);
        expandedLines.forEach(line => {
          if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('//')) {
            finalCodeLines.push(line);
            return;
          }

          const indent = (line.match(/^(\s*)/) || ['', ''])[1];
          const trimmed = line.trim();

          // Pre-processor first — handles print/show/if/elif/else/arithmetic
          // before the JSON rule engine ever sees the line.
          const pre = preProcessLine(trimmed);
          if (pre !== null) {
            finalCodeLines.push(indent + postProcessMathWords(pre));
            const key = pre.startsWith('print(') ? 'print/show/say/display/log [X]'
              : pre.startsWith('elif') ? 'elif (pre-processed)'
              : pre.startsWith('else') ? 'else: (pre-processed)'
              : pre.startsWith('if ') ? 'if [X] then [Z] (pre-processed)'
              : /[+\-*\/]=/.test(pre) ? 'arithmetic shorthand'
              : 'pre-processor';
            const desc = pre.startsWith('print(') ? 'Resolved by built-in print handler — not the JSON engine.'
              : pre.startsWith('if ') ? 'Single-line if resolved by built-in handler.'
              : 'Handled by pre-processor before rules engine.';
            if (!currentEvolvedSyntax.some(s => s.keyword === key))
              currentEvolvedSyntax.push({ keyword: key, desc });
            return;
          }

          // ── Pre-JSON guard ──────────────────────────────────────────────
          // The JSON rules contain enormous synonym lists that accidentally match
          // common short lines like "var name = X" or "int age = 5".
          // Handle these safe patterns here before the JSON engine sees them,
          // so the JSON is only used for things it's actually good at.
          let guardedLine: string | null = null;

          // "var/let/const/int/float/string/bool name = value" — type-prefixed assignment
          const typedAssign = trimmed.match(/^(?:var|let|const|int|float|string|bool|integer|double)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/i);
          if (typedAssign) {
            const [, varName, val] = typedAssign;
            const kw = trimmed.split(/\s+/)[0].toLowerCase();
            if (kw === 'int' || kw === 'integer') guardedLine = `${varName} = int(${val.trim()})`;
            else if (kw === 'float' || kw === 'double') guardedLine = `${varName} = float(${val.trim()})`;
            else if (kw === 'string') guardedLine = `${varName} = str(${val.trim()})`;
            else if (kw === 'bool') guardedLine = `${varName} = bool(${val.trim()})`;
            else guardedLine = `${varName} = ${val.trim()}`;
            if (!currentEvolvedSyntax.some(s => s.keyword === 'type-prefixed assignment'))
              currentEvolvedSyntax.push({ keyword: 'type-prefixed assignment', desc: 'Typed var declaration stripped to Python assignment.' });
          }

          // "name = value" bare assignment — already valid Python, pass through
          if (!guardedLine) {
            const bareAssign = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*([+\-*\/%]?=)\s*(.+)$/);
            if (bareAssign) {
              guardedLine = trimmed; // already Python-valid, don't let JSON touch it
            }
          }

          if (guardedLine !== null) {
            finalCodeLines.push(indent + postProcessMathWords(guardedLine));
            return;
          }

          // ── Multi-pass rules engine ──────────────────────────────────────
          // Keeps applying rules until the line fully stabilises (no more changes).
          // This lets compound natural-language statements resolve completely even
          // when two rules need to fire on the same line.
          let translatedLine = trimmed;
          let passChanged = true;
          const matchedRuleKeys = new Set<string>();
          let safetyLimit = 20; // prevent infinite loops on pathological rules

          while (passChanged && safetyLimit-- > 0) {
            passChanged = false;
            for (const rule of rules) {
              try {
                const pattern = compilePattern(rule.pattern, rule.flags);
                if (!pattern.test(translatedLine)) continue;

                let translation = translatedLine.replace(
                  compilePattern(rule.pattern, rule.flags),
                  rule.replace
                );

                // Tab-delimited nested substitution
                if (translation.includes('\t')) {
                  const tabIdx = translation.indexOf('\t');
                  const left = translation.slice(0, tabIdx);
                  let right = translation.slice(tabIdx + 1);
                  for (const nested of rules) {
                    try {
                      const np = compilePattern(nested.pattern, nested.flags);
                      if (np.test(right)) {
                        right = right.replace(compilePattern(nested.pattern, nested.flags), nested.replace);
                        break;
                      }
                    } catch { /* skip bad nested rule */ }
                  }
                  translation = left + right;
                }

                if (translation !== translatedLine) {
                  translatedLine = translation;
                  passChanged = true;
                  if (!matchedRuleKeys.has(rule.ruleKeyword)) {
                    matchedRuleKeys.add(rule.ruleKeyword);
                    if (!currentEvolvedSyntax.some(s => s.keyword === rule.ruleKeyword))
                      currentEvolvedSyntax.push({ keyword: rule.ruleKeyword, desc: rule.desc });
                  }
                  break; // restart from top of sorted rules with updated line
                }
              } catch (e) {
                console.warn('Skipped bad rule:', rule.ruleKeyword, e);
              }
            }
          }

          // Post-processor: resolve any remaining inline math words
          translatedLine = postProcessMathWords(translatedLine);

          // C-style for loop fallback
          if (matchedRuleKeys.size === 0 && /^for\s*\(/.test(trimmed)) {
            translatedLine = trimmed.replace(
              /for\s*\(\s*(?:let\s+|var\s+|int\s+)?([a-zA-Z0-9_]+)\s*=\s*(\d+)\s*;\s*\1\s*<\s*(\d+)\s*;\s*\1\+\+\s*\)/,
              'for $1 in range($2, $3):'
            );
            if (!currentEvolvedSyntax.some(s => s.keyword === 'C-style for loop'))
              currentEvolvedSyntax.push({ keyword: 'C-style for loop', desc: 'Translated C/JS for-loop to Python range().' });
          }

          finalCodeLines.push(indent + translatedLine);
        });
      } else {
        // Even without JSON rules, still run the pre-processor so basic
        // constructs like print/show/if/arithmetic work.
        const expandedLines = rawCode.split('\n').flatMap(splitIntoLogicalLines);
        expandedLines.forEach(line => {
          if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('//')) {
            finalCodeLines.push(line); return;
          }
          const indent = (line.match(/^(\s*)/) || ['', ''])[1];
          const trimmed = line.trim();
          const pre = preProcessLine(trimmed);
          if (pre !== null) {
            finalCodeLines.push(indent + postProcessMathWords(pre));
          } else {
            finalCodeLines.push(line);
          }
        });
        newInsights.push({ type: 'debt', message: 'rules.json failed to load — JSON rules unavailable. Basic patterns still work.' });
      }

      // ── Brace normaliser ────────────────────────────────────────────────────
      // Converts C/JS-style brace blocks into Python-indented blocks so the
      // executor always sees consistent indentation regardless of input style.
      // Works by tracking brace depth, stripping brackets, and re-indenting.
      const normaliseBraces = (raw: string[]): string[] => {
        const out: string[] = [];
        let depth = 0;
        const INDENT = '    ';
        
        for (let i = 0; i < raw.length; i++) {
          const line = raw[i];
          const t = line.trim();
          if (!t) { out.push(''); continue; }

          // Opening brace on its own line — just increase depth, skip emitting the brace
          if (t === '{') { 
            depth++; 
            continue; 
          }
          
          // Closing brace on its own line — decrease depth, skip emitting the brace
          if (t === '}') { 
            depth = Math.max(0, depth - 1); 
            continue; 
          }

          // Line ending with { — it's a block header; emit without brace, bump depth
          if (t.endsWith('{') && !t.endsWith('\\{')) {
            let header = t.slice(0, -1).trimEnd();
            // Automatically append colon (:) if it's a structural keyword and lacking one
            if (/^(?:if|elif|else|while|for|def|class)\b/i.test(header) && !header.endsWith(':')) {
              header += ':';
            }
            out.push(INDENT.repeat(depth) + header);
            depth++;
            continue;
          }

          // Look-ahead to check if the next non-empty line starts a block with {
          let nextIsBrace = false;
          for (let j = i + 1; j < raw.length; j++) {
            const nextTrim = raw[j].trim();
            if (nextTrim === '{') {
              nextIsBrace = true;
              break;
            }
            if (nextTrim !== '') {
              break;
            }
          }

          let processedLine = t;
          if (nextIsBrace) {
            // Append Python colon helper
            if (/^(?:if|elif|else|while|for|def|class)\b/i.test(processedLine) && !processedLine.endsWith(':')) {
              processedLine += ':';
            }
          }

          out.push(INDENT.repeat(depth) + processedLine);
        }
        return out;
      };

      // Only run brace normalisation if the translated lines contain bracing symbols
      const hasBraces = finalCodeLines.some(l => l.trim() === '{' || l.trim() === '}' || l.trimEnd().endsWith('{'));
      if (hasBraces) {
        finalCodeLines = normaliseBraces(finalCodeLines);
      }

      let finalCode = finalCodeLines.join('\n');

      // Strip leftover type/var keywords
      if (/\b(var|let|const|int|float|string|bool)\s+[a-zA-Z0-9_]+\s*=/.test(finalCode)) {
        newInsights.push({ type: 'optimization', message: 'Type/var keywords stripped — Python uses dynamic typing.' });
        finalCode = finalCode.replace(/\b(var|let|const|int|float|string|bool)\s+([a-zA-Z0-9_]+)\s*=/g, '$2 =');
      }

      if (currentEvolvedSyntax.length === 0 && nonCommentLines.length > 0)
        newInsights.push({ type: 'info', message: 'No natural language patterns found. Looks like valid Python already!' });

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
    const typeMatch = s.match(/^type\((.+)\)$/);
    if (typeMatch) {
      const v = typeMatch[1].trim();
      return v in variables ? getTypeString(variables[v]) : `NameError: '${v}' is not defined`;
    }
    const castMatch = s.match(/^(int|float|str|bool)\((.+)\)$/);
    if (castMatch) {
      const inner = resolveValue(castMatch[2], variables);
      if (castMatch[1] === 'int') return parseInt(inner) || 0;
      if (castMatch[1] === 'float') return parseFloat(inner) || 0.0;
      if (castMatch[1] === 'str') return String(inner);
      if (castMatch[1] === 'bool') return !!inner;
    }
    const lenMatch = s.match(/^len\((.+)\)$/);
    if (lenMatch) {
      const v = resolveValue(lenMatch[1], variables);
      return Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : 0;
    }
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('(') && s.endsWith(')'))) {
      const content = s.slice(1, -1).trim();
      return content ? content.split(',').map(i => resolveValue(i.trim(), variables)) : [];
    }
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
      return s.slice(1, -1);
    if (/^[\w\s\+\-\*\/\%\(\)\.]+$/.test(s) && /[\+\-\*\/]/.test(s)) {
      try {
        const expr = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (_, n) =>
          n in variables ? String(variables[n]) : '0'
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
    return !!rv(expr);
  };

  const executeSingleStatement = (stmt: string, variables: Record<string, any>, logs: ExecutionResult[]) => {
    const t = stmt.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) return;

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
      logs.push({ line: String(val), type: typeof val === 'string' && val.startsWith('NameError') ? 'error' : 'output' });
      return;
    }

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

    const appendMatch = t.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.append\((.+)\)$/);
    if (appendMatch) {
      const arr = variables[appendMatch[1]];
      if (Array.isArray(arr)) arr.push(resolveValue(appendMatch[2], variables));
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
      const varEntries = Object.entries(variables);
      if (varEntries.length > 0) {
        logs.push({ line: '', type: 'divider' });
        logs.push({ line: '>>> Variables at exit:', type: 'system' });
        varEntries.forEach(([k, v]) => logs.push({ line: `    ${k} = ${JSON.stringify(v)}`, type: 'output' }));
      }

      setOutput(logs);
      setIsRunning(false);
      setTimeout(() => outputRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    }, 800);
  };

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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {showCommands && createPortal(
        <CommandsModal onClose={() => setShowCommands(false)} />,
        document.body
      )}

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCommands(true)}
              className="flex items-center gap-2 text-xs bg-neutral-900 border border-neutral-800 hover:border-emerald-500/50 hover:text-emerald-400 text-neutral-300 rounded-xl px-3 py-2 transition-all font-medium"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Commands
            </button>
            <span
              title={jsonConnected === null ? 'Checking rules.json…' : jsonConnected ? 'rules.json loaded successfully' : 'rules.json failed to load'}
              className={`hidden sm:flex items-center text-xs border rounded-full px-3 py-1 transition-colors ${
                jsonConnected === null
                  ? 'bg-neutral-900 border-neutral-800 text-neutral-500'
                  : jsonConnected
                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
                  : 'bg-red-950/30 border-red-800/40 text-red-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0 ${
                jsonConnected === null ? 'bg-neutral-600 animate-pulse'
                : jsonConnected ? 'bg-emerald-400 animate-pulse'
                : 'bg-red-400'
              }`} />
              {jsonConnected === null ? 'rules.json…' : jsonConnected ? 'rules.json ✓' : 'rules.json ✗'}
            </span>
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
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">

          {/* Left Sidebar */}
          <div className="lg:col-span-3 space-y-4 flex flex-col">

            <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-900">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center">
                  <Activity className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />Style Profile
                </h2>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[['Quotes', styleProfile.quotes], ['Naming', styleProfile.naming], ['Lines', String(lineCount)], ['Outputs', String(outputLineCount)]].map(([label, val]) => (
                  <div key={label} className="bg-neutral-950/60 p-2.5 rounded-xl border border-neutral-905">
                    <p className="text-[10px] text-neutral-500 uppercase mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-neutral-200 truncate">{val}</p>
                  </div>
                ))}
              </div>
            </div>

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
                      {ins.type === 'debt'
                        ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        : <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                      {ins.message}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-neutral-600 text-xs py-4 border border-dashed border-neutral-900 rounded-xl">No insights yet.</p>
              )}
            </div>

            <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex-1 flex flex-col">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 pb-3 mb-3 border-b border-neutral-900 flex items-center">
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                Active Translations
                {evolvedSyntax.length > 0 && (
                  <span className="ml-auto bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0.5 rounded-full">
                    {evolvedSyntax.length}
                  </span>
                )}
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2">
                {evolvedSyntax.length > 0 ? evolvedSyntax.map((rule, idx) => (
                  <div key={idx} className="bg-neutral-950/40 border border-neutral-905 p-2.5 rounded-xl hover:border-neutral-800 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-[11px] text-emerald-400 font-mono bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800/80 truncate max-w-[150px]">
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

          {/* Editors */}
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
                  onClick={() => { setCode(''); setOutput(null); setActiveExample(-1); }}
                  className="text-neutral-600 hover:text-red-400 transition-colors p-1 rounded"
                  title="Clear"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                className="flex-1 bg-neutral-950/40 border border-neutral-900 rounded-xl p-3.5 text-sm font-mono text-neutral-300 focus:outline-none focus:border-emerald-500/40 resize-none leading-relaxed transition-all placeholder:text-neutral-600"
                placeholder={`Try:\nprint hello world\nmake variable x 5 times 3\nif x is greater than 5 then print big\nalternatively then print small\nadd 1 to x`}
                value={code}
                onChange={e => setCode(e.target.value)}
                spellCheck={false}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-neutral-600 font-mono">{lineCount} line{lineCount !== 1 ? 's' : ''}</span>
                <button
                  onClick={() => analyzeWithHeuristics(code)}
                  className="text-[11px] text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Re-analyse
                </button>
              </div>
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-4 h-full">

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
                  {compiledCode || <span className="text-neutral-600 not-italic font-sans text-xs">Waiting for input...</span>}
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

              <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex flex-col" style={{ height: '220px' }}>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-900">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Output</span>
                    {output && <span className="text-[10px] text-neutral-600 font-mono">{outputLineCount} line{outputLineCount !== 1 ? 's' : ''}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {output && (
                      <>
                        <button
                          onClick={() => copyToClipboard(output.filter(l => l.type === 'output').map(l => l.line).join('\n'), 'output')}
                          className="text-neutral-600 hover:text-neutral-300 transition-colors p-1 rounded"
                        >
                          {copiedOutput ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setOutput(null)} className="text-neutral-600 hover:text-red-400 transition-colors p-1 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div ref={outputRef} className="flex-1 bg-neutral-950 rounded-xl p-3 font-mono text-xs overflow-y-auto space-y-0.5 border border-neutral-900">
                  {output ? output.map((entry, idx) => (
                    entry.type === 'divider'
                      ? <div key={idx} className="border-t border-neutral-900 my-1" />
                      : <div key={idx} className={
                          entry.type === 'system' ? 'text-neutral-600'
                          : entry.type === 'error' ? 'text-red-400'
                          : 'text-neutral-200'
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
    </>
  );
}