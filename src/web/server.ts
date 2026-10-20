// The web view: the page in ./page, and the scan behind it as JSON. Node only; nothing is stored,
// every scan is asked for by the page and answered at once.
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AtlasError } from '../core/errors.ts';
import { firstSentence, skillLink } from '../core/model.ts';
import { parseSkill } from '../core/parse.ts';
import { scan, type ScanResult, type Source } from '../core/scan.ts';
import { renderMarkdown } from './markdown.ts';

export type WebOptions = {
  /** Opens what the page asked to scan, as the CLI does. */
  open(input: string): Promise<Source>;
  /** Scanned when the page names no source. */
  source?: string;
};

const PAGE = new URL('./page/', import.meta.url);

/** The page's files: these and nothing else, so no path reaches the rest of the disk. */
const ASSETS: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
};

/** Only the page's own files run; rendered Markdown can show links and text, nothing else. */
const HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export function createWebServer(options: WebOptions): Server {
  return createServer((request, response) => {
    handle(request, response, options).catch((error: unknown) => {
      send(response, 500, json({ error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` }));
    });
  });
}

/** Listens and returns the page's address; a port that is taken is a failure explained to the user. */
export async function serve(options: WebOptions & { port: number; host: string }): Promise<string> {
  const server = createWebServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      const reason = error.code === 'EADDRINUSE' ? 'the port is taken; choose another with --port' : error.message;
      reject(new AtlasError(`Cannot listen on ${options.host}:${options.port}: ${reason}`));
    });
    server.listen(options.port, options.host, resolve);
  });
  const { address, port } = server.address() as AddressInfo;
  const host = address === '0.0.0.0' || address === '::' ? 'localhost' : address.includes(':') ? `[${address}]` : address;
  return `http://${host}:${port}/`;
}

type Answer = { status: number; type: string; body: string | Uint8Array };

async function handle(request: IncomingMessage, response: ServerResponse, options: WebOptions) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, text('Only GET'));
  if (url.pathname === '/api/scan') return send(response, ...(await scanAnswer(url.searchParams.get('source'), options)));
  const asset = Object.hasOwn(ASSETS, url.pathname) ? ASSETS[url.pathname] : undefined;
  if (!asset) return send(response, 404, text('Not found'));
  send(response, 200, { type: asset.type, body: await readFile(new URL(asset.file, PAGE)) });
}

async function scanAnswer(requested: string | null, options: WebOptions): Promise<[number, Omit<Answer, 'status'>]> {
  const source = requested?.trim() || options.source;
  if (!source) return [400, json({ source: '', error: 'Enter a GitHub URL or a directory to scan' })];
  try {
    return [200, json(view(source, await scan(await options.open(source))))];
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    return [422, json({ source, error: error.message })];
  }
}

/** What the page shows: the scan, with each SKILL.md's front matter and body ready to display. */
export function view(source: string, { repository, skills, warnings }: ScanResult) {
  return {
    source,
    repository,
    warnings,
    skills: skills.map((skill) => {
      const link = skillLink(repository, skill);
      const parsed = parseSkill(skill.content);
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        summary: firstSentence(skill.description),
        path: skill.path,
        link,
        copies: skill.copies,
        properties: Object.entries(parsed.properties).map(([key, value]) => [key, display(value)]),
        warning: parsed.warning,
        html: renderMarkdown(parsed.body, link),
        content: skill.content,
      };
    }),
  };
}

function display(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object' || item === null)) return value.join(', ');
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function json(body: unknown) {
  return { type: 'application/json; charset=utf-8', body: JSON.stringify(body) };
}

function text(body: string) {
  return { type: 'text/plain; charset=utf-8', body };
}

function send(response: ServerResponse, status: number, { type, body }: Omit<Answer, 'status'>) {
  response.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(response.req.method === 'HEAD' ? undefined : body);
}
