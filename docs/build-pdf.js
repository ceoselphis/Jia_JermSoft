/* Renderiza el Markdown a un HTML imprimible (estilo profesional). */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const mdPath = path.join(__dirname, 'DOCUMENTACION-DESARROLLADORES.md');
const htmlPath = path.join(__dirname, 'DOCUMENTACION-DESARROLLADORES.html');

let md = fs.readFileSync(mdPath, 'utf-8');
// Quitar el front-matter YAML (entre --- ... ---) si existe.
md = md.replace(/^---[\s\S]*?---\s*/, '');

const body = marked.parse(md);

const css = `
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1a1a1a; line-height: 1.55; font-size: 11.5pt; max-width: 820px; margin: 0 auto; }
  h1 { font-size: 24pt; color: #0b3d66; border-bottom: 3px solid #0b3d66; padding-bottom: 6px; margin-top: 0; }
  h2 { font-size: 16pt; color: #0b3d66; margin-top: 26px; border-bottom: 1px solid #d0d7de; padding-bottom: 4px; }
  h3 { font-size: 12.5pt; color: #1f6feb; margin-top: 18px; }
  p, li { font-size: 11pt; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-family: "Cascadia Code", Consolas, monospace; font-size: 9.5pt; }
  pre { background: #0d1117; color: #e6edf3; padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 8.8pt; line-height: 1.4; }
  pre code { background: none; color: inherit; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; }
  th, td { border: 1px solid #d0d7de; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #0b3d66; color: #fff; }
  tr:nth-child(even) td { background: #f6f8fa; }
  hr { border: none; border-top: 1px solid #d0d7de; margin: 22px 0; }
  blockquote { border-left: 4px solid #1f6feb; margin: 12px 0; padding: 4px 14px; background: #f0f6ff; color: #344; }
  h2 { page-break-after: avoid; }
  pre, table { page-break-inside: avoid; }
`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Jia — Documentación para desarrolladores</title><style>${css}</style></head>
<body>${body}</body></html>`;

fs.writeFileSync(htmlPath, html, 'utf-8');
console.log('HTML generado:', htmlPath);
