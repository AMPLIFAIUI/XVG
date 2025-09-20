// Simple HTTP server for XVG Editor
// This solves CORS issues with WASM loading

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || process.argv[2] || '3000', 10);
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.xvg': 'application/octet-stream'
};

const server = http.createServer((req, res) => {
    // Parse URL
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = `.${parsedUrl.pathname}`;
    
    // Default to index.html
    if (pathname === './') {
        pathname = './index.html';
    }
    
    // Handle subdirectories properly
    if (pathname.startsWith('./modules/') || pathname.startsWith('./pkg/') || pathname.startsWith('./assets/')) {
        // These are valid subdirectories, keep the path as is
        console.log(`Serving file from subdirectory: ${pathname}`);
    } else if (pathname.startsWith('./')) {
        // Other paths are relative to current directory
        console.log(`Serving file from current directory: ${pathname}`);
    }
    
    // Get file extension
    const ext = path.extname(pathname).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Read and serve file
    fs.readFile(pathname, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                // Server error
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
        } else {
            // Set CORS headers for WASM
            res.writeHead(200, {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cross-Origin-Embedder-Policy': 'require-corp',
                'Cross-Origin-Opener-Policy': 'same-origin'
            });
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('           XVG EDITOR SERVER STARTED                   ');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
    console.log('');
    console.log('Open your browser and navigate to:');
    console.log(`   http://localhost:${PORT}`);
    console.log('═══════════════════════════════════════════════════════');
});

// Handle server shutdown gracefully
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});
