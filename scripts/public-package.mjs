#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY = "shelken/pi-extensions";
const NPM_OWNER = "shelken";
const REPOSITORY_URL = `git+https://github.com/${REPOSITORY}.git`;
const DEFAULT_USERCONFIG = "/tmp/.npmrc-user";

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
  });

  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} ${args.join(" ")} 失败`);
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadPackage(slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    fail(`非法子包名: ${slug}`);
  }

  const packageDir = join(ROOT, "extensions", slug);
  const manifestPath = join(packageDir, "package.json");
  if (!existsSync(manifestPath)) {
    fail(`子包不存在: extensions/${slug}`);
  }

  return {
    slug,
    packageDir,
    manifest: readJson(manifestPath),
    readme: existsSync(join(packageDir, "README.md"))
      ? readFileSync(join(packageDir, "README.md"), "utf8")
      : "",
    rootReadme: readFileSync(join(ROOT, "README.md"), "utf8"),
  };
}

export function manifestErrors({ slug, packageDir, manifest, readme, rootReadme }) {
  const expectedName = `@shelken/${slug}`;
  const errors = [];

  if (manifest.name !== expectedName) errors.push(`name 必须是 ${expectedName}`);
  if (manifest.private === true) errors.push("必须删除 private: true");
  if (!manifest.version) errors.push("缺少 version");
  if (!manifest.license) errors.push("缺少 license");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) errors.push("缺少 files 白名单");
  if (manifest.repository?.type !== "git") errors.push("repository.type 必须是 git");
  if (manifest.repository?.url !== REPOSITORY_URL) errors.push(`repository.url 必须是 ${REPOSITORY_URL}`);
  if (manifest.repository?.directory !== `extensions/${slug}`) errors.push(`repository.directory 必须是 extensions/${slug}`);
  if (manifest.publishConfig?.access !== "public") errors.push("publishConfig.access 必须是 public");
  if (!manifest.pi?.extensions?.includes("./index.ts")) errors.push("pi.extensions 必须包含 ./index.ts");
  if (!existsSync(join(packageDir, "LICENSE"))) errors.push("缺少 LICENSE");
  if (!readme.includes(`pi install npm:${expectedName}`)) errors.push("README 缺少 npm 安装命令");
  if (!rootReadme.includes(expectedName)) errors.push("根 README 缺少 npm 包名");

  for (const entry of manifest.files ?? []) {
    if (!existsSync(join(packageDir, entry))) errors.push(`files 中的路径不存在: ${entry}`);
  }

  return errors;
}

export function tarballErrors(paths) {
  const errors = [];
  const required = ["LICENSE", "README.md", "package.json"];
  const forbidden = /(^|\/)(tests?|fixtures?)(\/|$)|\.test\.|(^|\/)\.env($|\.)/;

  for (const path of required) {
    if (!paths.includes(path)) errors.push(`tarball 缺少 ${path}`);
  }
  for (const path of paths) {
    if (forbidden.test(path)) errors.push(`tarball 包含禁止文件: ${path}`);
  }
  return errors;
}

function inspectTarball(pkg) {
  const result = run("npm", ["pack", `--workspace=${pkg.manifest.name}`, "--dry-run", "--json"], { capture: true });
  const report = JSON.parse(result.stdout)[0];
  const paths = report.files.map((file) => file.path);
  const errors = tarballErrors(paths);
  if (errors.length > 0) fail(errors.join("\n"));

  console.log(`${report.name}@${report.version}: ${report.size} bytes, ${paths.length} files`);
  for (const path of paths) console.log(`  ${path}`);
}

function auditPackage(pkg) {
  const errors = manifestErrors(pkg);
  if (errors.length > 0) fail(errors.join("\n"));

  run("bun", ["--filter", pkg.manifest.name, "test"]);
  inspectTarball(pkg);
  console.log(`${pkg.manifest.name} 首发门禁通过`);
}

export function withTempNpmConfig(env) {
  return { ...env, NPM_CONFIG_USERCONFIG: DEFAULT_USERCONFIG };
}

function npmEnvironment() {
  if (!existsSync(DEFAULT_USERCONFIG)) {
    fail(`npm 登录文件不存在: ${DEFAULT_USERCONFIG}；先运行 just package-login`);
  }
  return withTempNpmConfig(process.env);
}

function registryVersion(name) {
  const result = run("npm", ["view", name, "version", "--json"], { capture: true, allowFailure: true });
  if (result.status !== 0) return null;
  return JSON.parse(result.stdout);
}

function accessStatus(name, env) {
  const result = run("npm", ["access", "get", "status", name], { capture: true, env });
  return result.stdout.trim();
}

function ownedPackages(env) {
  const result = run("npm", ["access", "list", "packages", NPM_OWNER, "--json"], {
    capture: true,
    env,
  });
  return JSON.parse(result.stdout);
}

export function packageExists(name, publishedVersion, packages) {
  return Boolean(publishedVersion) || Object.hasOwn(packages, name);
}

function bootstrapPackage(pkg) {
  auditPackage(pkg);
  const env = npmEnvironment();
  const published = registryVersion(pkg.manifest.name);
  const packages = ownedPackages(env);
  if (packageExists(pkg.manifest.name, published, packages)) {
    fail(`${pkg.manifest.name} 已存在于 npm (${published ?? packages[pkg.manifest.name]})，不要重复人工首发`);
  }

  run("npm", ["publish", `--workspace=${pkg.manifest.name}`, "--access", "public"], { env });
}

function trustPackage(pkg) {
  run("npm", [
    "trust",
    "github",
    pkg.manifest.name,
    "--file",
    "publish.yml",
    "--repo",
    REPOSITORY,
    "--allow-publish",
    "--yes",
  ], { env: npmEnvironment() });
}

function resolveCommit(commit) {
  const result = run("git", ["rev-parse", `${commit}^{commit}`], { capture: true });
  return result.stdout.trim();
}

function localTagSha(tag) {
  const result = run("git", ["rev-parse", `refs/tags/${tag}^{commit}`], { capture: true, allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function remoteTagSha(tag) {
  const result = run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`], { capture: true });
  return result.stdout.trim() ? result.stdout.trim().split(/\s+/)[0] : null;
}

function createBaseline(pkg, commit) {
  const published = registryVersion(pkg.manifest.name);
  if (published !== pkg.manifest.version) {
    fail(`npm latest=${published ?? "不存在"}，manifest=${pkg.manifest.version}，不能创建 baseline tag`);
  }

  const commitSha = resolveCommit(commit);
  const tag = `${pkg.manifest.name}@${pkg.manifest.version}`;
  const localSha = localTagSha(tag);
  const remoteSha = remoteTagSha(tag);

  if (localSha && localSha !== commitSha) fail(`本地 tag ${tag} 指向错误 commit`);
  if (remoteSha && remoteSha !== commitSha) fail(`远程 tag ${tag} 指向错误 commit`);

  if (!localSha) run("git", ["tag", tag, commitSha]);
  if (!remoteSha) run("git", ["push", "origin", tag]);

  const release = run("gh", ["release", "view", tag, "--repo", REPOSITORY], {
    capture: true,
    allowFailure: true,
  });
  if (release.status !== 0) {
    run("gh", ["release", "create", tag, "--repo", REPOSITORY, "--generate-notes", "--title", tag]);
  }

  console.log(`${tag} baseline 已对齐 ${commitSha}`);
}

function showStatus(pkg) {
  const result = run("npm", [
    "view",
    pkg.manifest.name,
    "name",
    "version",
    "repository",
    "license",
    "dist-tags",
    "--json",
  ], { capture: true, allowFailure: true });
  if (result.status === 0) console.log(result.stdout.trim());

  const env = withTempNpmConfig(process.env);
  const owned = existsSync(DEFAULT_USERCONFIG) && Object.hasOwn(ownedPackages(env), pkg.manifest.name);
  if (owned) console.log(accessStatus(pkg.manifest.name, env));

  if (result.status !== 0 && !owned) fail(`${pkg.manifest.name} 在 npm 不可见`);
  if (result.status !== 0) console.log("npm view 尚未传播完成，请等待后重试");
}

function usage() {
  console.log(`用法:
  public-package.mjs audit <package>
  public-package.mjs bootstrap <package>
  public-package.mjs trust <package>
  public-package.mjs baseline <package> [commit]
  public-package.mjs status <package>`);
}

function main() {
  const [command, slug, commit = "HEAD"] = process.argv.slice(2);
  if (!command || !slug) {
    usage();
    process.exitCode = 2;
    return;
  }

  const pkg = loadPackage(slug);
  if (command === "audit") auditPackage(pkg);
  else if (command === "bootstrap") bootstrapPackage(pkg);
  else if (command === "trust") trustPackage(pkg);
  else if (command === "baseline") createBaseline(pkg, commit);
  else if (command === "status") showStatus(pkg);
  else fail(`未知命令: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
