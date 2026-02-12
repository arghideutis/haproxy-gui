# HAProxy GUI (minimal)

This is a small prototype GUI for visualizing and editing a HAProxy configuration.

Features
- Graphical view of `frontend` -> `backend` relationships
- Simple editor for the raw `haproxy.cfg` with save/reload

Quick start

1. Create a python virtualenv and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Run the app:

```bash
python app.py
```

3. Open http://127.0.0.1:5000 in your browser.

Notes
- The parser is intentionally simple: it finds `frontend` and `backend` blocks and reads `use_backend` / `default_backend` directives inside frontends to draw edges. It won't cover all HAProxy config features.
- This is a starter scaffold — I can extend the parser, add node details, editing helpers, validation, and safer saving (backups, dry-run) if you want.
# haproxy-gui
