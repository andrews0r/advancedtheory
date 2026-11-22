#!/usr/bin/env python3
"""Static server for Advanced Theory that tells browsers not to cache, so edits show on reload.

Usage: python3 scripts/serve.py [port]   (serves the site folder, default port 8765)
"""
import http.server
import pathlib
import sys

SITE = pathlib.Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(SITE), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter log: only errors
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Advanced Theory at http://localhost:{PORT} (no-cache)", flush=True)
        httpd.serve_forever()
