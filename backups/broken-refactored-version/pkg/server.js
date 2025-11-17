// Simple HTTP server for XVG Editor
// This solves CORS issues with WASM loading
// UI is for the xvg project and the rules are being followed.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || process.argv[2] || '3000', 10);
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
];

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

// Security headers
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' https://r2cdn.perplexity.ai https://fonts.googleapis.com https://fonts.gstatic.com; connect-src 'self';"
};

// Validate origin for CORS
function isValidOrigin(origin) {
    if (!origin) return false;
    return ALLOWED_ORIGINS.includes(origin);
}

// Sanitize file path to prevent directory traversal
function sanitizePath(filePath) {
    // Remove any path traversal attempts
    const sanitized = filePath.replace(/\.\./g, '').replace(/\/+/g, '/');
    return sanitized.startsWith('./') ? sanitized : './' + sanitized;
}

const server = http.createServer((req, res) => {
    try {
        // Parse URL safely
        const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
        let pathname = sanitizePath(`.${parsedUrl.pathname}`);
        
        // Default to index.html
        if (pathname === './') {
            pathname = './index.html';
        }

        // If requested path does not exist, alias /pkg/* and /modules/* to project root
        // This lets existing <script src="pkg/..."> continue to work without moving files
        try {
            const fsPath = pathname;
            const exists = fs.existsSync(fsPath);
            if (!exists) {
                if (pathname.startsWith('./pkg/')) {
                    const candidate = './' + pathname.slice('./pkg/'.length);
                    if (fs.existsSync(candidate)) pathname = candidate;
                } else if (pathname.startsWith('./modules/')) {
                    const candidate = './' + pathname.slice('./modules/'.length);
                    if (fs.existsSync(candidate)) pathname = candidate;
                }
            }
        } catch (error) {
            console.warn('Path resolution error:', error.message);
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
                    res.writeHead(404, { 
                        'Content-Type': 'text/plain',
                        ...SECURITY_HEADERS
                    });
                    res.end('404 Not Found');
                } else {
                    // Server error
                    console.error('File read error:', err.message);
                    res.writeHead(500, { 
                        'Content-Type': 'text/plain',
                        ...SECURITY_HEADERS
                    });
                    res.end('500 Internal Server Error');
                }
            } else {
                // Get origin for CORS validation
                const origin = req.headers.origin;
                const corsOrigin = isValidOrigin(origin) ? origin : 'null';
                
                // Set secure headers
                const headers = {
                    'Content-Type': contentType,
                    'Access-Control-Allow-Origin': corsOrigin,
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Cross-Origin-Embedder-Policy': 'require-corp',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    ...SECURITY_HEADERS
                };
                
                res.writeHead(200, headers);
                res.end(data);
            }
        });
        
    } catch (error) {
        console.error('Server request error:', error.message);
        res.writeHead(500, { 
            'Content-Type': 'text/plain',
            ...SECURITY_HEADERS
        });
        res.end('500 Internal Server Error');
    }
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
