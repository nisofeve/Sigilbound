#!/usr/bin/env node

const url = 'http://127.0.0.1:5174/';
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5_000);

try {
  const response = await fetch(url, { signal: controller.signal });
  const html = await response.text();

  if (!response.ok || !html.includes('<title>Sigilbound</title>')) {
    throw new Error(`Unexpected response: HTTP ${response.status}`);
  }

  console.log(`Playtest ready: ${url}`);
} catch (error) {
  console.error(`Playtest unavailable: ${url}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
