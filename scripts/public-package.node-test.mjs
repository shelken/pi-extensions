import assert from "node:assert/strict";
import { test } from "node:test";
import { manifestErrors, tarballErrors } from "./public-package.mjs";

const validManifest = {
  name: "@shelken/example",
  version: "1.0.0",
  license: "MIT",
  files: ["index.ts"],
  repository: {
    type: "git",
    url: "git+https://github.com/shelken/pi-extensions.git",
    directory: "extensions/example",
  },
  publishConfig: { access: "public" },
  pi: { extensions: ["./index.ts"] },
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
