import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {dirname, extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prefix = process.argv[2] || '/layout-review/';
const port = Number(process.env.PORT || 5400);
const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

if (!prefix.startsWith('/') || !prefix.endsWith('/') || !Number.isInteger(port)) {
    throw new Error('Use a /repository-name/ prefix and a valid PORT.');
}

createServer(async (request, response) => {
    try {
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, {'Allow': 'GET, HEAD'}).end();
            return;
        }
        const address = new URL(request.url, `http://localhost:${port}`);
        if (address.pathname === '/') {
            response.writeHead(302, {'Location': prefix}).end();
            return;
        }
        if (!address.pathname.startsWith(prefix)) {
            response.writeHead(404).end();
            return;
        }
        const relative = decodeURIComponent(address.pathname.slice(prefix.length)) || 'index.html';
        const allowed = /^(?:(?:index|login-[abcefg]|main-[abcefg]|about-g)\.html|demo\.(?:js|css)|(?:css|js|fonts|images)\/[^\\]+)$/;
        const file = resolve(root, relative);
        if (!allowed.test(relative) || !file.startsWith(root + sep) || !(await stat(file)).isFile()) {
            response.writeHead(404).end();
            return;
        }
        const data = await readFile(file);
        response.writeHead(200, {
            'Content-Type': types[extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
        response.writeHead(404).end();
    }
}).listen(port, '127.0.0.1', () => {
    console.log(`Layout demo: http://localhost:${port}${prefix}`);
});