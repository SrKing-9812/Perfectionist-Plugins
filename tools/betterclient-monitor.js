#!/usr/bin/env node
// BetterClient memory monitor.
//
// Samples every League/Riot process once per interval, records client phase
// (read straight from the LCU with the running client's own credentials) and
// writes a CSV you can chart. With --diff it compares two V8 heap snapshots and
// prints the constructors that grew the most.
//
//   node tools/betterclient-monitor.mjs                     # live table + CSV
//   node tools/betterclient-monitor.mjs --minutes 240       # long session
//   node tools/betterclient-monitor.mjs --snapshots 15      # heap snapshots via CDP
//   node tools/betterclient-monitor.mjs --diff a.heapsnapshot b.heapsnapshot
//
// Nothing is installed and nothing is written outside --out / --snapshot-dir.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : true;
};

const diffFiles = args.filter((entry) => entry.endsWith(".heapsnapshot"));
if (args.includes("--diff")) {
  diffSnapshots(diffFiles[0], diffFiles[1]);
  process.exit(0);
}

const intervalSec = Number(flag("interval", 5));
const minutes = Number(flag("minutes", 0));
const out = String(flag("out", "betterclient-monitor.csv"));
const snapshotEvery = Number(flag("snapshots", 0));
const snapshotDir = String(flag("snapshot-dir", "heapsnapshots"));
const snapshotPrefix = String(flag("prefix", "betterclient"));

const NAMES = ["LeagueClient", "LeagueClientUx", "LeagueClientUxRender", "RiotClientServices", "RiotClientCrashHandler"];

function powershell(script) {
  return execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", windowsHide: true });
}

function sampleProcesses() {
  const filter = NAMES.map((name) => `$_.ProcessName -eq '${name}'`).join(" -or ");
  const script = `Get-Process -ErrorAction SilentlyContinue | Where-Object { ${filter} } | ForEach-Object { "$($_.ProcessName)|$($_.Id)|$($_.WorkingSet64)|$($_.PrivateMemorySize64)|$($_.TotalProcessorTime.TotalSeconds)" }`;
  const rows = powershell(script)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, pid, workingSet, priv, cpu] = line.split("|");
      return { name, pid: Number(pid), mb: Math.round(Number(workingSet) / 1048576), privateMb: Math.round(Number(priv) / 1048576), cpu: Number(cpu) };
    });
  return rows.sort((a, b) => a.pid - b.pid);
}

let lcu = null;
function discoverLcu() {
  if (lcu) return lcu;
  try {
    const commandLine = powershell(`(Get-CimInstance Win32_Process -Filter "Name='LeagueClientUx.exe'").CommandLine`);
    const port = /"?"--app-port=(\d+)/.exec(commandLine)?.[1];
    const token = /"?"--remoting-auth-token=([\w-]+)/.exec(commandLine)?.[1];
    if (port && token) lcu = { port: Number(port), token };
  } catch {}
  return lcu;
}

function lcuGet(path) {
  const auth = discoverLcu();
  if (!auth) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = https.request(
      {
        host: "127.0.0.1",
        port: auth.port,
        path,
        method: "GET",
        rejectUnauthorized: false,
        headers: { Authorization: `Basic ${Buffer.from(`riot:${auth.token}`).toString("base64")}`, Accept: "application/json" },
        timeout: 4000,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        });
      },
    );
    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.end();
  });
}

async function cdpTarget() {
  for (const port of [9222, 9223, 9229, 9333]) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) continue;
      const targets = await response.json();
      const page = targets.find((t) => t.webSocketDebuggerUrl && /league|client|riot/i.test(t.url ?? "")) ?? targets.find((t) => t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
  }
  return null;
}

async function takeHeapSnapshot() {
  const url = await cdpTarget();
  if (!url) {
    console.log("[snapshot] no CDP endpoint found - start the client with a remote debugging port to record heap snapshots");
    return null;
  }
  if (!existsSync(snapshotDir)) mkdirSync(snapshotDir, { recursive: true });
  const name = `${snapshotDir}/${snapshotPrefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.heapsnapshot`;
  const socket = new WebSocket(url);
  const chunks = [];
  let id = 0;
  const send = (method, params = {}) => socket.send(JSON.stringify({ id: ++id, method, params }));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("snapshot timed out")), 180000);
    socket.addEventListener("open", () => {
      send("HeapProfiler.enable");
      send("HeapProfiler.collectGarbage");
      send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "HeapProfiler.addHeapSnapshotChunk") chunks.push(message.params.chunk);
      if (message.id === id) {
        clearTimeout(timer);
        if (message.error) reject(new Error(message.error.message));
        else resolve();
      }
    });
    socket.addEventListener("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  }).finally(() => socket.close());
  writeFileSync(name, chunks.join(""));
  console.log(`[snapshot] wrote ${name} (${(chunks.join("").length / 1048576).toFixed(1)} MB)`);
  return name;
}

function diffSnapshots(fromPath, toPath) {
  if (!fromPath || !toPath) {
    console.log("usage: node tools/betterclient-monitor.mjs --diff old.heapsnapshot new.heapsnapshot");
    return;
  }
  for (const path of [fromPath, toPath]) {
    if (!existsSync(path)) {
      console.log(`missing file: ${path}`);
      return;
    }
  }
  const tally = (snapshot) => {
    const nodeFields = snapshot.snapshot.meta.node_fields;
    const nodeTypes = snapshot.snapshot.meta.node_types[nodeFields.indexOf("type")];
    const nameOffset = nodeFields.indexOf("name");
    const sizeOffset = nodeFields.indexOf("self_size");
    const width = nodeFields.length;
    const nodes = snapshot.nodes;
    const strings = snapshot.strings;
    const map = new Map();
    for (let i = 0; i < nodes.length; i += width) {
      const type = nodeTypes[nodes[i]];
      const name = strings[nodes[i + nameOffset]] ?? type;
      const key = `${type}:${name}`;
      const entry = map.get(key) ?? { count: 0, bytes: 0 };
      entry.count += 1;
      entry.bytes += nodes[i + sizeOffset];
      map.set(key, entry);
    }
    return map;
  };
  const before = tally(JSON.parse(readFileSync(fromPath, "utf8")));
  const after = tally(JSON.parse(readFileSync(toPath, "utf8")));
  const rows = [];
  for (const [key, value] of after) {
    const previous = before.get(key) ?? { count: 0, bytes: 0 };
    rows.push({ key, count: value.count - previous.count, bytes: value.bytes - previous.bytes });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  console.log(`\ntop growers between the two snapshots:`);
  for (const row of rows.slice(0, 25)) {
    if (row.bytes <= 0) break;
    console.log(`  +${(row.bytes / 1048576).toFixed(2)} MB  ${String(row.count).padStart(7)} nodes  ${row.key}`);
  }
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  console.log(`\nnet ${(total / 1048576).toFixed(1)} MB`);
}

const started = Date.now();
const history = new Map();
writeFileSync(out, "timestamp,phase,pid,process,working_set_mb,private_mb,cpu_seconds,cpu_percent\n");
console.log(`writing ${out} - every ${intervalSec}s${minutes ? ` for ${minutes} min` : " until Ctrl+C"}`);

const lastCpu = new Map();
let lastCpuAt = Date.now();
let tick = 0;

async function loop() {
  tick += 1;
  let phase = "?";
  try {
    phase = await lcuGet("/lol-gameflow/v1/gameflow-phase");
  } catch {}
  const rows = sampleProcesses();
  const now = Date.now();
  const elapsed = (now - lastCpuAt) / 1000;
  const parts = [];
  for (const row of rows) {
    const previous = lastCpu.get(row.pid);
    const cpuPercent = previous !== undefined && elapsed > 0 ? Math.max(0, ((row.cpu - previous) / elapsed) * 100) : 0;
    lastCpu.set(row.pid, row.cpu);
    appendFileSync(out, `${new Date(now).toISOString()},${phase},${row.pid},${row.name},${row.mb},${row.privateMb},${row.cpu.toFixed(1)},${cpuPercent.toFixed(1)}\n`);
    parts.push(`${row.name.replace("LeagueClient", "LC")}#${row.pid} ${row.mb}MB ${cpuPercent.toFixed(0)}%`);
    const series = history.get(row.pid) ?? [];
    series.push(row.mb);
    history.set(row.pid, series);
  }
  lastCpuAt = now;
  const totalMb = rows.reduce((sum, row) => sum + row.mb, 0);
  console.log(`[${new Date(now).toLocaleTimeString()}] phase=${phase} total=${totalMb}MB | ${parts.join(" | ")}`);

  if (snapshotEvery > 0 && tick % Math.max(1, Math.round((snapshotEvery * 60) / intervalSec)) === 0) {
    await takeHeapSnapshot().catch((error) => console.log(`[snapshot] failed: ${error.message}`));
  }

  if (minutes > 0 && now - started >= minutes * 60 * 1000) {
    console.log("\ngrowth over the run:");
    for (const [pid, series] of history) {
      if (series.length < 2) continue;
      const first = series[0];
      const last = series[series.length - 1];
      const delta = last - first;
      const minutesRun = Math.max(0.1, (Date.now() - started) / 60000);
      const perHour = (delta / minutesRun) * 60;
      const row = rows.find((entry) => entry.pid === pid);
      console.log(`  ${row?.name ?? "process"}#${pid}: ${first}MB -> ${last}MB (${delta >= 0 ? "+" : ""}${delta}MB, ${perHour >= 0 ? "+" : ""}${perHour.toFixed(0)}MB/h)`);
      if (perHour > 200) console.log("    ^ leak candidate - this process alone keeps growing");
    }
    console.log(`\nfull series in ${out}`);
    process.exit(0);
  }
}

while (true) {
  try {
    await loop();
  } catch (error) {
    console.log(`sample failed: ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
}
