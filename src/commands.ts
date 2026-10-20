// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { firstSentence, skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Starts the web view and returns its address; only where a server can run. */
  serve?(options: ServeOptions): Promise<string>;
};

export type ServeOptions = {
  /** What the page scans first; without it, the page asks. */
  source?: string;
  port: number;
  host: string;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository and print it
  serve [GitHub URL | directory]  the same, as a page in the browser
        [--port 3000] [--host 127.0.0.1]
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'serve') await serveCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | directory>');
  const result = await scan(await context.open(args[0]));
  printRepository(result.repository, result.skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

const serveUsage = 'Usage: skill-atlas serve [GitHub URL | directory] [--port 3000] [--host 127.0.0.1]';

/** Starts the server and returns: the server keeps the process running until Ctrl+C. */
async function serveCommand(args: string[], context: Context) {
  if (!context.serve) throw new AtlasError('skill-atlas serve runs only from the command line');
  const options: ServeOptions = { port: 3000, host: '127.0.0.1' };
  for (let index = 0; index < args.length; index++) {
    const [flag, inline] = args[index].split(/=(.*)/s);
    const value = () => {
      const next = inline ?? args[++index];
      if (next === undefined || next === '') throw new AtlasError(`${flag} needs a value\n\n${serveUsage}`);
      return next;
    };
    if (flag === '--port') {
      const text = value();
      options.port = Number(text);
      if (!/^\d+$/.test(text) || options.port > 65535) throw new AtlasError(`Not a port: ${text}`);
    } else if (flag === '--host') options.host = value();
    else if (args[index].startsWith('--') || options.source !== undefined) throw new AtlasError(serveUsage);
    else options.source = args[index];
  }
  const address = await context.serve(options);
  context.print(`Skill Atlas: ${address}`);
  context.print('Press Ctrl+C to stop.');
}

/** `<owner>/<repo> · N skills`, then each skill's name, first sentence and link. */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  print(`${repository.id} · ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
  }
}
