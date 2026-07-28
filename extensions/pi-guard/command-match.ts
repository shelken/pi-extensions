/**
 * deny_commands: match shell simple-command argv, not raw command substrings.
 */
import { globToRegExpSource } from "./match.ts";

function patternUsesStructuralGlob(pattern: string): boolean {
  // `curl *| bash` spans simple commands — full-line glob, not argv prefix.
  return pattern.includes("*") && /[|;&\n]/.test(pattern);
}

export function commandMatchesPattern(
  command: string,
  pattern: string,
): boolean {
  if (patternUsesStructuralGlob(pattern)) {
    return new RegExp(globToRegExpSource(pattern)).test(command);
  }
  const argvs = simpleCommandArgvs(tokenizeShell(command));
  const patternWords = patternWordsOf(pattern);
  if (!patternWords) {
    if (pattern.includes("*")) {
      return new RegExp(globToRegExpSource(pattern)).test(command);
    }
    return false;
  }
  for (const argv of argvs) {
    if (argvStartsWith(stripWrappers(argv), patternWords)) return true;
  }
  return false;
}

function isAssignment(word: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

function stripLeadingAssignments(words: string[]): string[] {
  let i = 0;
  while (i < words.length && isAssignment(words[i])) i++;
  return words.slice(i);
}

/** Simple wrappers: drop the name and any leading flags. */
const FLAG_WRAPPERS = new Set([
  "nohup",
  "command",
  "builtin",
  "exec",
  "setsid",
  "stdbuf",
  "ionice",
  "watch",
  "xargs",
  "time",
]);

/** Strip assignments + process wrappers so `sudo env` still matches `env`. */
export function stripWrappers(words: string[]): string[] {
  let w = stripLeadingAssignments(words);
  for (;;) {
    if (w.length === 0) return w;
    const head = basenames(w[0]);

    // `env` is the command when nothing follows options/assignments;
    // otherwise it wraps the remaining command.
    if (head === "env") {
      let j = 1;
      while (j < w.length && w[j].startsWith("-")) {
        const f = w[j];
        if (
          f === "-u" ||
          f === "--unset" ||
          f === "-C" ||
          f === "--chdir" ||
          f === "-S" ||
          f === "--split-string"
        ) {
          j += 2;
        } else {
          j++;
        }
      }
      while (j < w.length && isAssignment(w[j])) j++;
      if (j >= w.length) return w;
      w = stripLeadingAssignments(w.slice(j));
      continue;
    }

    if (head === "sudo" || head === "doas") {
      let j = 1;
      while (j < w.length && w[j].startsWith("-")) {
        const f = w[j];
        if (f === "--") {
          j++;
          break;
        }
        if (
          f === "-u" ||
          f === "-g" ||
          f === "-p" ||
          f === "--user" ||
          f === "--group" ||
          f === "--prompt"
        ) {
          j += 2;
        } else {
          j++;
        }
      }
      w = stripLeadingAssignments(w.slice(j));
      continue;
    }

    if (head === "timeout") {
      let j = 1;
      while (j < w.length && w[j].startsWith("-")) {
        const f = w[j];
        if (
          f === "-k" ||
          f === "--kill-after" ||
          f === "-s" ||
          f === "--signal"
        ) {
          j += 2;
        } else {
          j++;
        }
      }
      if (j < w.length) j++; // duration
      w = stripLeadingAssignments(w.slice(j));
      continue;
    }

    if (head === "nice") {
      let j = 1;
      if (j < w.length && (w[j] === "-n" || w[j] === "--adjustment")) {
        j += 2;
      } else if (j < w.length && /^-\d+$/.test(w[j])) {
        j++;
      }
      w = stripLeadingAssignments(w.slice(j));
      continue;
    }

    if (FLAG_WRAPPERS.has(head)) {
      let j = 1;
      while (j < w.length && w[j].startsWith("-")) j++;
      w = stripLeadingAssignments(w.slice(j));
      continue;
    }

    return w;
  }
}

type ShellToken =
  | { kind: "word"; value: string }
  | { kind: "op"; value: string };

const CONTROL_OPS = new Set(["|", "||", "&&", ";", "&", "\n", "(", ")"]);

export function tokenizeShell(input: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      tokens.push({ kind: "op", value: "\n" });
      i++;
      continue;
    }
    if (input.startsWith("||", i) || input.startsWith("&&", i)) {
      tokens.push({ kind: "op", value: input.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if (ch === "|" || ch === ";" || ch === "&" || ch === "(" || ch === ")") {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    const redir = input.slice(i).match(/^(\d*)(>>|<<|<|>)/);
    if (redir) {
      tokens.push({ kind: "op", value: redir[0] });
      i += redir[0].length;
      continue;
    }

    let word = "";
    while (i < input.length) {
      const c = input[i];
      if (
        c === " " ||
        c === "\t" ||
        c === "\r" ||
        c === "\n" ||
        c === "|" ||
        c === ";" ||
        c === "&" ||
        c === "(" ||
        c === ")" ||
        c === "<" ||
        c === ">"
      ) {
        break;
      }
      if (input.startsWith("||", i) || input.startsWith("&&", i)) break;

      if (c === "'") {
        i++;
        while (i < input.length && input[i] !== "'") word += input[i++];
        if (i < input.length) i++;
        continue;
      }
      if (c === '"') {
        i++;
        while (i < input.length && input[i] !== '"') {
          if (input[i] === "\\" && i + 1 < input.length) {
            word += input[i + 1];
            i += 2;
            continue;
          }
          word += input[i++];
        }
        if (i < input.length) i++;
        continue;
      }
      if (c === "\\" && i + 1 < input.length) {
        word += input[i + 1];
        i += 2;
        continue;
      }
      word += c;
      i++;
    }
    tokens.push({ kind: "word", value: word });
  }
  return tokens;
}

export function simpleCommandArgvs(tokens: ShellToken[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "op") {
      if (CONTROL_OPS.has(t.value)) {
        if (current.length > 0) out.push(current);
        current = [];
        continue;
      }
      if (i + 1 < tokens.length && tokens[i + 1].kind === "word") i++;
      continue;
    }
    current.push(t.value);
  }
  if (current.length > 0) out.push(current);
  return out;
}

function patternWordsOf(pattern: string): string[] | null {
  const tokens = tokenizeShell(pattern);
  if (tokens.some((t) => t.kind === "op" && CONTROL_OPS.has(t.value))) {
    return null;
  }
  const words = simpleCommandArgvs(tokens)[0] ?? [];
  return words.length > 0 ? words : null;
}

function basenames(word: string): string {
  if (word === "/" || word === "." || word === "..") return word;
  const slash = word.lastIndexOf("/");
  return slash === -1 ? word : word.slice(slash + 1);
}

function argvStartsWith(argv: string[], patternWords: string[]): boolean {
  if (argv.length < patternWords.length) return false;
  for (let i = 0; i < patternWords.length; i++) {
    const a = argv[i];
    const p = patternWords[i];
    if (p.includes("*")) {
      const re = new RegExp(`^${globToRegExpSource(p)}$`);
      if (re.test(a)) continue;
      if (i === 0 && re.test(basenames(a))) continue;
      return false;
    }
    if (i === 0) {
      if (a !== p && basenames(a) !== p) return false;
      continue;
    }
    if (a === p) continue;
    // `rm -rf /` still catches `rm -rf /*`, not `rm -rf /tmp`
    if (a.startsWith(p) && /^[*?\[\]]*$/.test(a.slice(p.length))) {
      continue;
    }
    return false;
  }
  return true;
}
