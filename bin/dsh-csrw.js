#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { definitions } from '../lib/index.js';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort(new Error('Interrupted')));
const ctx = { get: key => key === 'workingDirectory' ? { ensure: async () => process.cwd() } : undefined };

try {
  const input = process.argv.slice(2), command = [];
  let workspace = process.cwd(), args = {}, help = false;
  for (let i = 0; i < input.length; i++) {
    const value = input[i];
    if (value === '--workspace') {
      if (!input[i + 1]) throw new Error('--workspace needs a directory');
      workspace = path.resolve(input[++i]);
    } else if (value === '--args') {
      if (!input[i + 1]) throw new Error('--args needs a JSON object');
      args = JSON.parse(input[++i]);
    } else if (value === '--args-file') {
      if (!input[i + 1]) throw new Error('--args-file needs a JSON file');
      args = JSON.parse(await fs.readFile(input[++i], 'utf8'));
    } else if (value === '--help' || value === '-h') help = true;
    else if (value.startsWith('-')) throw new Error('Unknown option: ' + value);
    else command.push(value);
  }
  const tools = definitions(ctx);
  if (!command.length) {
    console.log('dsh-csrw <module> <operation> [--workspace <directory>] [--args <JSON> | --args-file <file>]\ndsh-csrw health\ndsh-csrw <module> <operation> --help\n' + tools.map(t => t.name.replace(/^dsh_csrw_/, '').replaceAll('_', ' ') + '  ' + t.description).join('\n'));
  } else {
    const name = 'dsh_csrw_' + command.join('_');
    const definition = tools.find(t => t.name === name);
    if (!definition) throw new Error('Unknown command: ' + command.join(' '));
    if (help) console.log(JSON.stringify({ name, description: definition.description, parameters: definition.parameters }, null, 2));
    else {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be a JSON object');
      const result = await definition.execute({ ...args, workspace }, { signal: controller.signal });
      console.log(JSON.stringify(result, null, 2));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
}
