import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
await fs.rm(path.join(root, "dist"), { recursive: true, force: true });
await fs.mkdir(path.join(root, "dist/assets"), { recursive: true });
await fs.mkdir(path.join(root, ".deploy/functions"), { recursive: true });
const result = await build({
  entryPoints: [path.join(root, "src/main.jsx")],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020"],
  outdir: path.join(root, "dist/assets"),
  entryNames: "app-[hash]",
  assetNames: "[name]-[hash]",
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});
const entries = Object.entries(result.metafile.outputs);
const js = entries.find(([file, v]) => v.entryPoint?.endsWith("main.jsx"))[0];
const css = entries.find(([file]) => file.endsWith(".css"))[0];
const asset = (file) =>
  "/" +
  path
    .relative(path.join(root, "dist"), path.resolve(file))
    .split(path.sep)
    .join("/");
await fs.writeFile(
  path.join(root, "dist/index.html"),
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Schroeder and Pasha balloon quotations"><title>Balloon Budget Tool | Schroeder &amp; Pasha</title><link rel="stylesheet" href="${asset(css)}"><script type="module" src="${asset(js)}"></script></head><body><div id="root"></div><noscript>Enable JavaScript to use the quotation tool.</noscript></body></html>`,
);
await fs.cp(path.join(root, "public"), path.join(root, "dist"), {
  recursive: true,
});
await fs.writeFile(
  path.join(root, "dist/_redirects"),
  "/api/quotations /.netlify/functions/quotes 200!\n/api/db-test /.netlify/functions/health 200!\n/api/access /.netlify/functions/access 200!\n/* /index.html 200\n",
);
const pageHeaders="  Cache-Control: no-cache\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://uqusxqjrhksmvwliiheu.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'\n";
await fs.writeFile(path.join(root,"dist/_headers"),"/\n"+pageHeaders+"/register\n"+pageHeaders+"/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n");
for (const name of ["quotes", "health", "keep-alive", "access"])
  await build({
    entryPoints: [path.join(root, `netlify/functions/${name}.mjs`)],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: path.join(root, `.deploy/functions/${name}.js`),
    logLevel: "info",
  });
console.log("Built client and functions");
