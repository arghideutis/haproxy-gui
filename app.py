from flask import Flask, send_from_directory, jsonify, request, Response
import os
import base64
from parser import parse_haproxy_config
try:
    import simplepam
except Exception:
    simplepam = None

app = Flask(__name__, static_folder='static', static_url_path='')

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'haproxy.cfg')


@app.route('/')
def index():
    # protect UI with HTTP Basic + PAM
    auth = request.headers.get('Authorization')
    if not _check_auth_header(auth):
        return _unauthorized()
    return send_from_directory('static', 'index.html')


@app.route('/api/config', methods=['GET', 'POST'])
def config():
    if not _check_request_auth(request):
        return _unauthorized()
    if request.method == 'GET':
        # if not os.path.exists(CONFIG_PATH):
        #     # open(CONFIG_PATH, 'w').close()
        #     return jsonify()
        try:
            with open(CONFIG_PATH, 'r') as f:
                return jsonify({'config': f.read()})
        except Exception as e:
            print(f"Error reading config: {e}")
            return jsonify({'config': ''})
    else:
        data = request.get_json() or {}
        cfg = data.get('config', '')
        with open(CONFIG_PATH, 'w') as f:
            f.write(cfg)
        return jsonify({'status': 'ok'})


@app.route('/api/graph')
def graph():
    if not _check_request_auth(request):
        return _unauthorized()
    if not os.path.exists(CONFIG_PATH):
        open(CONFIG_PATH, 'w').close()
    with open(CONFIG_PATH, 'r') as f:
        cfg = f.read()
    graph = parse_haproxy_config(cfg)
    return jsonify(graph)


def _unauthorized():
    return Response('Unauthorized', 401, {'WWW-Authenticate': 'Basic realm="HAProxy GUI"'})


def _check_request_auth(req):
    auth = req.headers.get('Authorization')
    return _check_auth_header(auth)


def _check_auth_header(auth_header):
    # No PAM available: allow access (fail open) but log a warning
    if simplepam is None:
        return True
    if not auth_header:
        return False
    try:
        parts = auth_header.split()
        if parts[0].lower() != 'basic' or len(parts) != 2:
            return False
        decoded = base64.b64decode(parts[1]).decode('utf-8')
        username, password = decoded.split(':', 1)
        return simplepam.authenticate(username, password)
    except Exception:
        return False


if __name__ == '__main__':
    app.run(debug=True, port=5000)
