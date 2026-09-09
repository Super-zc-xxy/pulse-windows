import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist/frontend', { recursive: true });
await cp('src/renderer', 'dist/frontend', { recursive: true });
await cp('src/bridge/pulse.js', 'dist/frontend/pulse.js');
await cp('src/accounts', 'dist/frontend', { recursive: true });
const html = await readFile('src/renderer/index.html', 'utf8');
if (!html.includes('<script src="app.js"></script>')) throw new Error('Renderer script entry changed');
await writeFile('dist/frontend/index.html', html.replace('<script src="app.js"></script>', '<script src="pulse.js"></script>\n    <script src="app.js"></script>'));
