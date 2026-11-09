import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync, lstatSync} from 'node:fs';
import {dirname, resolve, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencies = resolve(process.argv[2] || root, 'package.json');
const {parseHTML} = createRequire(dependencies)('linkedom');
const designs = ['g', 'a', 'b', 'c', 'e', 'f'];
export const publicEntries = ['index.html', 'demo.js', 'demo.css', '.nojekyll', 'css', 'js', 'fonts', 'images',
    ...designs.flatMap(design => [`login-${design}.html`, `main-${design}.html`]), 'about-g.html'];
const blocked = /__RequestVerificationToken|fixture-only-link-key|REVIEW\.FIXTURE|SET_LOCALLY|WMS\w*DBCONNECTION|authEncryptionKey|User\s+Id\s*=/i;
let references = 0;
let pages = 0;
let assets = 0;

function checkReference(value, source) {
    if (value.startsWith('#') || value.startsWith('data:')) {
        return;
    }
    assert.ok(!value.startsWith('/'), `Root-relative reference in ${source}: ${value}`);
    const address = new URL(value, `https://demo.invalid/repository/${source.replaceAll('\\', '/')}`);
    assert.equal(address.origin, 'https://demo.invalid', `External reference: ${value}`);
    assert.ok(address.pathname.startsWith('/repository/'), `Reference escaped Pages prefix: ${value}`);
    const target = resolve(root, decodeURIComponent(address.pathname.slice('/repository/'.length)));
    assert.ok(target.startsWith(root + sep), `Reference escaped demo folder: ${value}`);
    assert.ok(existsSync(target) && lstatSync(target).isFile(), `Missing reference in ${source}: ${value}`);
    references += 1;
}

function checkFile(file) {
    const info = lstatSync(file);
    assert.ok(!info.isSymbolicLink(), `Symbolic link must not be published: ${file}`);
    if (info.isDirectory()) {
        readdirSync(file).forEach(name => checkFile(resolve(file, name)));
        return;
    }
    const source = relative(root, file).replaceAll('\\', '/');
    if (/\.(?:dll|pdb|cs|csproj|sql|config|cab)$/i.test(source) || /(?:^|\/)appsettings/i.test(source)) {
        throw new Error(`Backend/config file must not be published: ${source}`);
    }
    if (/\.(?:html|js|css)$/.test(source)) {
        const content = readFileSync(file, 'utf8');
        assert.ok(!blocked.test(content), `Sensitive/backend marker found in ${source}`);
        if (source.endsWith('.js')) {
            const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
            assert.equal(result.status, 0, `${source}: ${result.stderr}`);
        }
        if (source.endsWith('.css')) {
            for (const match of content.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^\s)]+))\)/g)) {
                checkReference(match[1] || match[2] || match[3], source);
            }
        }
    }
    assets += 1;
}

for (const entry of publicEntries) {
    assert.ok(existsSync(resolve(root, entry)), `Required entry missing: ${entry}`);
    checkFile(resolve(root, entry));
    if (!entry.endsWith('.html')) {
        continue;
    }
    const content = readFileSync(resolve(root, entry), 'utf8');
    const {document} = parseHTML(content);
    for (const element of document.querySelectorAll('script[src], link[href], img[src], a[href]')) {
        checkReference(element.getAttribute(element.localName === 'link' || element.localName === 'a' ? 'href' : 'src'), entry);
    }
    if (entry === 'index.html') {
        assert.ok(document.querySelector('meta[http-equiv="refresh"]').content.includes('login-g.html?palette=5'));
        continue;
    }
    const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content;
    assert.ok(policy?.includes("connect-src 'none'") && policy.includes("form-action 'none'"), `Network/form guard missing: ${entry}`);
    const scripts = [...document.querySelectorAll('script[src]')];
    assert.equal(scripts[0].getAttribute('src'), 'demo.js', `Demo adapter must run first: ${entry}`);
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
        JSON.parse(script.textContent);
    }
    for (const form of document.querySelectorAll('form')) {
        assert.equal(form.getAttribute('action'), '#', `Form has a backend target: ${entry}`);
    }
    if (entry.startsWith('login-') || entry.startsWith('main-')) {
        const navigation = document.querySelector('nav[aria-label="Design review"]');
        const choices = [...navigation.querySelectorAll('a:not([data-demo-unavailable])')].map(anchor => anchor.textContent.trim());
        assert.deepEqual(choices, ['G', 'A', 'B', 'C', 'E', 'F'], `Incorrect switcher: ${entry}`);
    }
    if (entry.endsWith('-g.html')) {
        const header = document.querySelector('.g-header');
        assert.equal(header.querySelectorAll('.g-system img').length, 6, `Missing G logos: ${entry}`);
        assert.equal(header.querySelectorAll('img').length, 7, `Missing company logo: ${entry}`);
        assert.equal(document.querySelectorAll('[data-g-palette-option]').length, 6, `Missing palettes: ${entry}`);
    }
    assert.ok(!document.querySelector('[data-summary-form][data-demo-logout]'), 'Summary form must not sign out');
    pages += 1;
}

assert.equal(pages, 13);
console.log(`Static demo verified: ${pages} review pages, ${assets} public files, ${references} local references.`);