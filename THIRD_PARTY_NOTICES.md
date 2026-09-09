# Third-party references

Pulse desktop provider and authentication adapters were independently written in Rust using these protocol references:

- qunqin24/Pulse, commit 7a9480ddf05fe725fa237cc36d6b8c1013591b5b (Apache-2.0): Cursor and Antigravity data formats; Codex, Claude and Kimi quota routes. Project: https://github.com/qunqin24/Pulse . This repository also uses Apache-2.0, included in LICENSE. Rust/platform implementations are modifications from the reference behavior, not upstream-verified implementations.
- router-for-me/CLIProxyAPI, commit d198db54d4c4886c99b21488d54fc576933019a3 plus the Antigravity OAuth sources on `main` reviewed 2026-09-09 (MIT): Codex/Claude PKCE, Kimi device authorization, and Antigravity Google OAuth/project discovery protocol constants. Original license follows.

The Antigravity Google OAuth client credentials are public-client protocol constants inherited from the referenced desktop authentication flow. They are distributed with the application and must not be treated as confidential user credentials; user access and refresh tokens remain stored in the operating system credential store.

MIT License

Copyright (c) 2025-2005.9 Luis Pater
Copyright (c) 2025.9-present Router-For.ME

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
