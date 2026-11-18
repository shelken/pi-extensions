import assert from "node:assert/strict";
import { test } from "node:test";
import {
  firstPublishSteps,
  firstVersionErrors,
  hasPublishTrust,
  manifestErrors,
  packageExists,
  tarballErrors,
  withTempNpmConfig,
} from "./public-package.mjs";

const validManifest = {
  name: "@shelken/example",
  version: "1.0.0",
  license: "MIT",
  files: ["src"],
  repository: {
    type: "git",
    url: "git+https://github.com/shelken/pi-extensions.git",
    directory: "extensions/example",
  },
  publishConfig: { access: "public" },
  pi: { extensions: ["./src/index.ts"] },
};

test("manifestErrors accepts a publishable package", () => {
  const errors = manifestErrors({
    slug: "example",
    packageDir: new URL("../extensions/pi-add-dir", import.meta.url).pathname,
    manifest: validManifest,
    readme: "pi install npm:@shelken/example",
    rootReadme: "@shelken/example",
  });

  assert.deepEqual(errors, []);
});

test("manifestErrors rejects private packages", () => {
  const errors = manifestErrors({
    slug: "example",
    packageDir: new URL("../extensions/pi-add-dir", import.meta.url).pathname,
    manifest: { ...validManifest, private: true },
    readme: "pi install npm:@shelken/example",
    rootReadme: "@shelken/example",
  });

  assert.ok(errors.includes("必须删除 private: true"));
});

test("withTempNpmConfig overrides the managed user npmrc", () => {
  const env = withTempNpmConfig({ NPM_CONFIG_USERCONFIG: "/managed/.npmrc" });

  assert.equal(env.NPM_CONFIG_USERCONFIG, "/tmp/.npmrc-user");
});

test("packageExists ignores npm access status for an unowned package", () => {
  assert.equal(packageExists("@shelken/new-package", null, {}), false);
  assert.equal(packageExists("@shelken/new-package", null, { "@shelken/new-package": "read-write" }), true);
});

test("tarballErrors rejects tests and env files", () => {
  const errors = tarballErrors([
    "LICENSE",
    "README.md",
    "package.json",
    "index.ts",
    "tests/index.test.ts",
    ".env",
  ]);

  assert.deepEqual(errors, [
    "tarball 包含禁止文件: tests/index.test.ts",
    "tarball 包含禁止文件: .env",
  ]);
});

test("firstVersionErrors requires 0.1.0 only before the first publish", () => {
  assert.deepEqual(firstVersionErrors({ version: "0.0.0" }, null), ["首发 version 必须是 0.1.0（当前 0.0.0）"]);
  assert.deepEqual(firstVersionErrors({ version: "0.1.0" }, null), []);
  assert.deepEqual(firstVersionErrors({ version: "0.3.0" }, "0.2.0"), []);
});

test("hasPublishTrust recognizes the publish workflow binding", () => {
  const bound = "type: github\nid: x\nfile: publish.yml\nrepository: shelken/pi-extensions\npermissions: publish, stage publish\n";
  assert.equal(hasPublishTrust(bound), true);
  assert.equal(hasPublishTrust(""), false);
  assert.equal(hasPublishTrust(bound.replace("shelken/pi-extensions", "someone/else")), false);
});

test("firstPublishSteps resumes after a partial first publish", () => {
  assert.deepEqual(firstPublishSteps({ exists: false, trusted: false }), ["publish", "trust", "baseline"]);
  assert.deepEqual(firstPublishSteps({ exists: true, trusted: false }), ["trust", "baseline"]);
  assert.deepEqual(firstPublishSteps({ exists: true, trusted: true }), ["baseline"]);
});
