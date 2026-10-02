const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function handleCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With');
}

const server = http.createServer((req, res) => {
    handleCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // ================== PROXY PLANNING CENTER ==================
    if (parsedUrl.pathname.startsWith('/pco-api')) {
        const targetPath = parsedUrl.pathname.replace(/^\/pco-api/, '') + parsedUrl.search;
        const targetUrl = 'https://api.planningcenteronline.com' + targetPath;

        const forwardHeaders = { ...req.headers };
        delete forwardHeaders.host;
        forwardHeaders['user-agent'] = 'GestionCamarasMedia-Proxy/1.0';

        const pcoReq = https.request(targetUrl, {
            method: req.method,
            headers: forwardHeaders
        }, (pcoRes) => {
            handleCorsHeaders(res);
            res.writeHead(pcoRes.statusCode, pcoRes.headers);
            pcoRes.pipe(res);
        });

        pcoReq.on('error', (err) => {
            console.error('Error al conectar con Planning Center:', err.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error', details: err.message }));
        });

        req.pipe(pcoReq);
        return;
    }

    // ================== ARCHIVOS ESTÁTICOS ==================
    let filePath = path.join(ROOT_DIR, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
    
    // Normalizar ruta para seguridad
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Fallback a index.html para SPA
            filePath = path.join(ROOT_DIR, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, content) => {
            if (readErr) {
                res.writeHead(500);
                res.end('Error interno del servidor');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    });
});

server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  🎥 Sistema de Gestión de Cámaras Media`);
    console.log(`  🌐 Web App:    http://localhost:${PORT}`);
    console.log(`  ⚡ PCO Proxy:  http://localhost:${PORT}/pco-api/`);
    console.log(`  (Sin bloqueos de CORS al conectar con Services)`);
    console.log(`======================================================\n`);
});
