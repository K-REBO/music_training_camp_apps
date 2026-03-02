#!/usr/bin/env bun
// メンテナンス中に5173番ポートで静的HTMLを返す軽量サーバー

const GIF_PATH = import.meta.dir + "/construction_dog.gif";

const HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>メンテナンス中 | 合宿予約システム</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100svh;
    }
    .card {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 3rem 2.5rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
    }
    img { max-width: 100%; margin-bottom: 1.25rem; border-radius: 0.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; }
    p { color: #64748b; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="card">
    <img src="/reservation/construction_dog.gif" alt="工事中の犬" />
    <h1>メンテナンス中</h1>
    <p>現在システムのメンテナンスを行っています。<br>しばらくお待ちください。</p>
  </div>
</body>
</html>`;

const server = Bun.serve({
  port: 5173,
  async fetch(req) {
    const url = new URL(req.url);
if (url.pathname.endsWith("/construction_dog.gif")) {
      const file = Bun.file(GIF_PATH);
      return new Response(file, {
        headers: { "Content-Type": "image/gif" },
      });
    }
    return new Response(HTML, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "300",
      },
    });
  },
});

const gifExists = await Bun.file(GIF_PATH).exists();
console.log(`Maintenance server listening on http://localhost:${server.port}`);
console.log(`GIF: ${GIF_PATH} (exists: ${gifExists})`);
