import { mkdir, readFile, rm, writeFile, cp, readdir } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(rootDir, "dist");
const srcDir = join(rootDir, "src");
const dataDir = join(rootDir, "data");

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listFiles(fullPath);
      }
      return [fullPath];
    }),
  );

  return files.flat();
}

function rewriteImports(source: string): string {
  return source
    .replaceAll(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2")
    .replaceAll(/(import\s*\(\s*["'][^"']+)\.ts(["']\s*\))/g, "$1.js$2");
}

async function build() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const indexSource = await readFile(join(rootDir, "index.html"), "utf8");
  await writeFile(join(distDir, "index.html"), indexSource, "utf8");

  const srcFiles = await listFiles(srcDir);
  for (const filePath of srcFiles) {
    const relPath = relative(srcDir, filePath);
    const ext = extname(filePath);
    const outPath =
      ext === ".ts"
        ? join(distDir, "src", relPath.replace(/\.ts$/u, ".js"))
        : join(distDir, "src", relPath);

    await mkdir(dirname(outPath), { recursive: true });

    if (ext === ".ts") {
      const source = await readFile(filePath, "utf8");
      const stripped = stripTypeScriptTypes(rewriteImports(source));
      await writeFile(outPath, stripped, "utf8");
      continue;
    }

    await cp(filePath, outPath);
  }

  await cp(dataDir, join(distDir, "data"), { recursive: true });
}

await build();
