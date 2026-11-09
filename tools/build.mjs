import {cpSync, mkdirSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, publicEntries} from './check.mjs';

const site = resolve(root, '_site');
rmSync(site, {recursive: true, force: true});
mkdirSync(site);
for (const entry of publicEntries) {
    cpSync(resolve(root, entry), resolve(site, entry), {recursive: true});
}
console.log('Publish folder: _site (static assets only).');