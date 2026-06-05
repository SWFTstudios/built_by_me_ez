#!/usr/bin/env node
/**
 * Fetch Built By Me EZ Redesign product page from Google Stitch MCP.
 * Reads API key from .cursor/mcp.json (project) or ~/.cursor/mcp.json — never commit keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const PROJECT_ID = "11784673605105771486";
const SCREEN_ID = "de8f9fea08c14405998ec8fbcabaeacc";
const PROJECT = `projects/${PROJECT_ID}`;
const SCREEN_NAME = `${PROJECT}/screens/${SCREEN_ID}`;

const outRoot = path.join(root, "reference", "stitch-built-by-me-ez-redesign");
const screenDir = path.join(outRoot, "screens", "redesigned-product-page");

function loadKey() {
  const candidates = [
    path.join(root, ".cursor", "mcp.json"),
    path.join(os.homedir(), ".cursor", "mcp.json"),
  ];
  for (const mcpPath of candidates) {
    if (!fs.existsSync(mcpPath)) continue;
    const raw = fs.readFileSync(mcpPath, "utf8");
    const key = JSON.parse(raw).mcpServers?.stitch?.headers?.["X-Goog-Api-Key"];
    if (key && key !== "YOUR_STITCH_API_KEY") return key;
  }
  throw new Error(
    "Missing stitch X-Goog-Api-Key in .cursor/mcp.json — copy .cursor/mcp.json.example and add your key.",
  );
}

async function mcpCall(key, toolName, args = {}) {
  const res = await fetch("https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  const text = json.result?.content?.[0]?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return json.result;
}

function download(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execSync(`curl -fsSL "${url.replace(/"/g, '\\"')}" -o "${dest}"`, { stdio: "inherit" });
}

async function tryMcpCall(key, toolName, args) {
  try {
    return await mcpCall(key, toolName, args);
  } catch (err) {
    console.warn(`${toolName} failed:`, err.message);
    return null;
  }
}

async function main() {
  const key = loadKey();
  fs.mkdirSync(screenDir, { recursive: true });

  console.log(`Fetching screen: ${SCREEN_NAME}`);
  const screen = await mcpCall(key, "get_screen", { name: SCREEN_NAME });

  const manifest = {
    projectId: PROJECT_ID,
    projectTitle: "Built By Me EZ Redesign",
    screenId: SCREEN_ID,
    title: screen.title,
    width: screen.width,
    height: screen.height,
    deviceType: screen.deviceType,
    fetchedAt: new Date().toISOString(),
    files: {},
  };

  if (screen.screenshot?.downloadUrl) {
    const screenshotPath = path.join(screenDir, "screen.png");
    download(screen.screenshot.downloadUrl, screenshotPath);
    manifest.files.screenshot = path.relative(root, screenshotPath);
    console.log("Downloaded screenshot");
  }

  if (screen.htmlCode?.downloadUrl) {
    const htmlPath = path.join(screenDir, "code.html");
    download(screen.htmlCode.downloadUrl, htmlPath);
    manifest.files.html = path.relative(root, htmlPath);
    console.log("Downloaded HTML");
  }

  const designContext = await tryMcpCall(key, "extract_design_context", {
    name: SCREEN_NAME,
  });
  if (designContext) {
    const ctxPath = path.join(screenDir, "design-context.json");
    fs.writeFileSync(ctxPath, JSON.stringify(designContext, null, 2));
    manifest.files.designContext = path.relative(root, ctxPath);
  }

  const designTheme = await tryMcpCall(key, "get_design_theme", {
    projectId: PROJECT,
  });
  if (designTheme) {
    const themePath = path.join(outRoot, "design-theme.json");
    fs.writeFileSync(themePath, JSON.stringify(designTheme, null, 2));
    manifest.files.designTheme = path.relative(root, themePath);
  }

  fs.writeFileSync(path.join(screenDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. Assets saved to ${screenDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
