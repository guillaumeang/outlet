// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("package manifest", () => {
  it("does not export local openclaw-studio bin", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      bin?: Record<string, unknown>;
    };
    const hasOpenclawStudioBin = Object.prototype.hasOwnProperty.call(
      parsed.bin ?? {},
      "openclaw-studio"
    );
    expect(hasOpenclawStudioBin).toBe(false);
  });
});
