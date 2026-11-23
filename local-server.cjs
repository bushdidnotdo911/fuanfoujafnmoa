// This source code is by https://github.com/Penguins111 https://discord.gg/2TnE3nEEVc penguins r cool
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = __dirname;
const requestedPort = Number.parseInt(process.argv[2] || "8000", 10);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(request, response, filePath, stats) {
  const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || "");
  if (range) {
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : stats.size - 1, stats.size - 1);
    if (start > end || start >= stats.size) {
      response.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      "Content-Type": type,
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    "Accept-Ranges": "bytes",
    "Content-Length": stats.size,
    "Content-Type": type,
  });
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(root, `.${pathname.replaceAll("/", path.sep)}`);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    sendFile(request, response, filePath, stats);
  });
});

let port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 8000;
let attempts = 0;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && attempts < 10) {
    attempts += 1;
    port += 1;
    console.log(`Port was busy; trying ${port}...`);
    setTimeout(() => server.listen(port, "127.0.0.1"), 100);
    return;
  }
  console.error(`Could not start the game server: ${error.message}`);
  process.exitCode = 1;
});
server.on("listening", () => {
  const url = `http://localhost:${port}/`;
  console.log("");
  console.log(`Game ready: ${url}`);
  console.log("Keep this window open while playing.");
  console.log("Press Ctrl+C to stop the server.");
  if (process.env.FREELIFE_NO_OPEN !== "1") {
    spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }
});
server.listen(port, "127.0.0.1");
