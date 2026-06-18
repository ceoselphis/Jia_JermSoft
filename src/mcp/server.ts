import * as http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools';

/**
 * Servidor MCP de Jia: expone las conversaciones/perfil de Jhonattan como
 * herramientas para Hermes (u otro agente).
 *
 * Conectar desde Hermes:
 *   - stdio (mismo servidor):  hermes mcp add jia --command node --args dist/mcp/server.js
 *   - HTTP  (por URL):         npm run mcp:http   →   hermes mcp add jia --url http://localhost:8787/mcp
 *
 * Uso local:
 *   npm run mcp        (stdio)
 *   npm run mcp:http   (HTTP en MCP_HTTP_PORT, default 8787)
 */

function nuevoServer(): McpServer {
  const server = new McpServer({ name: 'jia', version: '1.0.0' });
  registerTools(server);
  return server;
}

async function runStdio(): Promise<void> {
  const server = nuevoServer();
  await server.connect(new StdioServerTransport());
  // stdio: el proceso queda vivo atendiendo al cliente (Hermes).
  console.error('Jia MCP (stdio) listo.');
}

async function runHttp(port: number): Promise<void> {
  // Modo stateless: un server+transport por request (simple y robusto para 1 agente).
  const httpServer = http.createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith('/mcp')) {
      res.writeHead(404).end('Not found. Usa /mcp');
      return;
    }
    try {
      const body = await leerBody(req);
      const server = nuevoServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error('Error MCP HTTP:', e instanceof Error ? e.message : e);
      if (!res.headersSent) res.writeHead(500).end('error');
    }
  });
  httpServer.listen(port, () => {
    console.error(`Jia MCP (HTTP) en http://localhost:${port}/mcp`);
  });
}

function leerBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') return resolve(undefined);
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Modo HTTP si pasas --http [puerto] o defines MCP_HTTP_PORT. Si no, stdio.
const args = process.argv.slice(2);
const httpFlag = args.includes('--http');
const portArg = args.find((a) => /^\d+$/.test(a));
const envPort = process.env.MCP_HTTP_PORT;
const usarHttp = httpFlag || !!envPort;
const port = Number(portArg ?? envPort ?? 8787);

const main = usarHttp ? runHttp(port) : runStdio();
main.catch((e) => {
  console.error('No se pudo iniciar el MCP:', e instanceof Error ? e.message : e);
  process.exit(1);
});
