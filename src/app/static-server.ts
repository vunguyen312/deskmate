import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';

const HTTP_STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
} as const;

const MIME: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.onnx': 'application/octet-stream',
};

export class StaticServer {
    private readonly vendorRoots: Record<string, string>;

    constructor(private readonly appDir: string) {
        this.vendorRoots = {
            '/vendor/': path.join(
                appDir,
                'node_modules',
                '@ricky0123',
                'vad-web',
                'dist',
            ),
            '/ort-wasm/': path.join(
                appDir,
                'node_modules',
                'onnxruntime-web',
                'dist',
            ),
        };
    }

    public start(): Promise<number> {
        const server = http.createServer((req, res) => {
            let urlPath: string;
            try {
                urlPath = decodeURIComponent(
                    new URL(req.url || '/', 'http://localhost').pathname,
                );
            } catch {
                res.writeHead(HTTP_STATUS.BAD_REQUEST);
                res.end();
                return;
            }
            let filePath: string | null = null;
            for (const [prefix, root] of Object.entries(this.vendorRoots)) {
                if (urlPath.startsWith(prefix)) {
                    filePath = path.join(root, urlPath.slice(prefix.length));
                    break;
                }
            }
            if (!filePath) {
                filePath = path.join(this.appDir, urlPath);
            }
            const fp = filePath;
            const outsideRoots = !Object.values(this.vendorRoots).some((r) => {
                return fp.startsWith(r);
            });
            if (!fp.startsWith(this.appDir) && outsideRoots) {
                res.writeHead(HTTP_STATUS.FORBIDDEN);
                res.end();
                return;
            }
            fs.stat(fp, (err, st) => {
                if (err || !st.isFile()) {
                    res.writeHead(HTTP_STATUS.NOT_FOUND);
                    res.end('not found');
                    return;
                }
                const contentType =
                    MIME[path.extname(fp)] || 'application/octet-stream';
                res.writeHead(HTTP_STATUS.OK, { 'Content-Type': contentType });
                fs.createReadStream(fp).pipe(res);
            });
        });
        return new Promise((resolve) => {
            

            server.listen(0, '127.0.0.1', () => {
                const address = server.address() as AddressInfo;
                resolve(address.port);
            });
        });
    }
}