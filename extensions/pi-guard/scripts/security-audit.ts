import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { evaluateGuard } from "../src/evaluate.ts";
import { buildPolicy } from "../src/policy.ts";

type Expected = {
  blocked: boolean;
  extracted: string[];
};

type AuditCase = {
  id: string;
  finding?: "bypass" | "false-positive";
  expected: Expected;
} & (
  | { tool: "bash"; command: string }
  | { tool: "read"; path: string }
);

const secrets = {
  env: "PI_GUARD_CANARY_ENV_7eaf1d",
  netrc: "PI_GUARD_CANARY_NETRC_19c64b",
} as const;

function redact(text: string): string {
  let redacted = text;
  for (const [id, secret] of Object.entries(secrets)) {
    redacted = redacted.replaceAll(secret, `[REDACTED:${id}]`);
  }
  return redacted;
}

function extractedIds(text: string): string[] {
  return Object.entries(secrets)
    .filter(([, secret]) => text.includes(secret))
    .map(([id]) => id);
}

function run(): void {
  const root = mkdtempSync(path.join(tmpdir(), "pi-guard-audit-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "work");
  const netrc = path.join(home, ".netrc");
  const alias = path.join(cwd, "credential-alias");

  try {
    mkdirSync(home);
    mkdirSync(cwd);
    writeFileSync(
      netrc,
      `machine example.invalid login canary password ${secrets.netrc}\n`,
      { mode: 0o600 },
    );
    symlinkSync(netrc, alias);

    const cases: AuditCase[] = [
      {
        id: "direct-env",
        tool: "bash",
        command: "env",
        expected: { blocked: true, extracted: [] },
      },
      {
        id: "direct-netrc",
        tool: "bash",
        command: `cat ${netrc}`,
        expected: { blocked: true, extracted: [] },
      },
      {
        id: "shell-wrapper-env",
        tool: "bash",
        command: "sh -c env",
        finding: "bypass",
        expected: { blocked: false, extracted: ["env"] },
      },
      {
        id: "command-variable-env",
        tool: "bash",
        command: 'tool=env; "$tool"',
        finding: "bypass",
        expected: { blocked: false, extracted: ["env"] },
      },
      {
        id: "printenv",
        tool: "bash",
        command: "printenv PI_GUARD_CANARY",
        expected: { blocked: true, extracted: [] },
      },
      {
        id: "export-vars",
        tool: "bash",
        command: "export FOO=bar; printf safe",
        expected: { blocked: false, extracted: [] },
      },
      {
        id: "eval-env",
        tool: "bash",
        command: "eval env",
        finding: "bypass",
        expected: { blocked: false, extracted: ["env"] },
      },
      {
        id: "shell-set",
        tool: "bash",
        command: "set",
        finding: "bypass",
        expected: { blocked: false, extracted: ["env"] },
      },
      {
        id: "exported-env",
        tool: "bash",
        command: "export -p",
        expected: { blocked: true, extracted: [] },
      },
      {
        id: "split-path",
        tool: "bash",
        command: 'cat "$HOME"/.ne"trc"',
        finding: "bypass",
        expected: { blocked: false, extracted: ["netrc"] },
      },
      {
        id: "bash-symlink-path",
        tool: "bash",
        command: `cat ${alias}`,
        finding: "bypass",
        expected: { blocked: false, extracted: ["netrc"] },
      },
      {
        id: "read-symlink-path",
        tool: "read",
        path: alias,
        finding: "bypass",
        expected: { blocked: false, extracted: ["netrc"] },
      },
      {
        id: "path-as-text",
        tool: "bash",
        command: `printf '%s\\n' ${netrc}`,
        finding: "false-positive",
        expected: { blocked: true, extracted: [] },
      },
      {
        id: "env-wrapper",
        tool: "bash",
        command: "env FOO=bar printf safe",
        expected: { blocked: false, extracted: [] },
      },
    ];

    const policy = buildPolicy({ home, cwd }).policy;
    let failed = false;

    for (const auditCase of cases) {
      const decision =
        auditCase.tool === "bash"
          ? evaluateGuard(
              { tool: "bash", command: auditCase.command, cwd, home },
              policy,
            )
          : evaluateGuard(
              { tool: "read", path: auditCase.path, cwd, home },
              policy,
            );
      let output = "";
      if (!decision.block && auditCase.tool === "bash") {
        const child = spawnSync("/bin/sh", ["-c", auditCase.command], {
          cwd,
          encoding: "utf8",
          env: {
            HOME: home,
            PATH: "/usr/bin:/bin",
            PI_GUARD_CANARY: secrets.env,
          },
          timeout: 2_000,
        });
        if (child.error || child.status !== 0) {
          throw child.error ?? new Error(`${auditCase.id} exited ${child.status}`);
        }
        output = `${child.stdout ?? ""}${child.stderr ?? ""}`;
      } else if (!decision.block && auditCase.tool === "read") {
        output = readFileSync(auditCase.path, "utf8");
      }

      const actual: Expected = {
        blocked: decision.block,
        extracted: extractedIds(output),
      };
      const matches = JSON.stringify(actual) === JSON.stringify(auditCase.expected);
      failed ||= !matches;

      const safeOutput = redact(output).trim().replaceAll("\n", " ");
      const details = safeOutput === "" ? "" : ` output=${safeOutput.slice(0, 160)}`;
      const status = !matches ? "FAIL" : auditCase.finding ? "FINDING" : "PASS";
      console.log(
        `${status} ${auditCase.id} blocked=${actual.blocked} extracted=${actual.extracted.join(",") || "none"}${details}`,
      );
    }

    if (failed) process.exitCode = 1;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

run();
