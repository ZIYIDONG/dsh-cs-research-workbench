import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadConfig,setConfig} from '../lib/services/config.js';
import {configTools} from '../lib/tools/config.js';
const base=path.resolve('.test-artifacts');await fs.mkdir(base,{recursive:true});
test('config defaults, safe setter, secret and URL rejection, actual defineTool DSL',async()=>{const w=await fs.mkdtemp(path.join(base,'config-'));assert.equal((await loadConfig(w)).backup.target,'local');await setConfig(w,'obsidian.vaultPath','vault');assert.equal((await loadConfig(w)).obsidian.vaultPath,'vault');await assert.rejects(setConfig(w,'nutstore.password','secret'));await assert.rejects(setConfig(w,'zotero.localApi','https://evil.example/api'));await assert.rejects(setConfig(w,'nutstore.baseUrl','https://user:secret@example.org/'));await assert.rejects(setConfig(w,'obsidian.autoDetect','yes'));const defs=configTools({get:()=>undefined});assert.equal(defs.length,2);const shown=await defs[0].execute({workspace:w},{signal:new AbortController().signal});assert.equal(shown.config.obsidian.vaultPath,'vault');});
