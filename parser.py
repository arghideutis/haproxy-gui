import re


def parse_haproxy_config(cfg):
    """Enhanced parser: extracts `frontend`, `backend`, `acl` and `server` entries.

    Returns a dict: { nodes: [{id,label,type,title}], edges: [{from,to}] }
    Types: frontend, backend, acl, server
    """
    # First, split into sections (frontend/backend) while also collecting global ACLs
    sections = []
    current = None
    acl_defs = {}  # name -> definition (text)

    for line in cfg.splitlines():
        m = re.match(r'^\s*(frontend|backend)\s+(\S+)', line)
        m_acl = re.match(r'^\s*acl\s+(\S+)\s+(.*)', line)
        if m_acl:
            name = m_acl.group(1)
            acl_defs[name] = m_acl.group(2).strip()
        if m:
            if current:
                sections.append(current)
            current = {'type': m.group(1), 'name': m.group(2), 'lines': []}
        elif current is not None:
            # collect lines inside current section
            current['lines'].append(line)
            # also collect acl definitions scoped inside sections
            m_acl2 = re.match(r'^\s*acl\s+(\S+)\s+(.*)', line)
            if m_acl2:
                acl_defs[m_acl2.group(1)] = m_acl2.group(2).strip()
    if current:
        sections.append(current)

    nodes = []
    edges = []

    backend_names = set()

    # collect backends and their servers
    server_re = re.compile(r'^\s*server\s+(\S+)\s+(\S+)', re.IGNORECASE)
    backend_map = {}  # backend -> list of servers (name, addr)

    for sec in sections:
        if sec['type'] == 'backend':
            bname = sec['name']
            backend_names.add(bname)
            backend_map[bname] = []
            for line in sec['lines']:
                m = server_re.match(line)
                if m:
                    sname = m.group(1)
                    addr = m.group(2)
                    backend_map[bname].append((sname, addr))

    # create backend nodes
    for b in backend_names:
        nodes.append({'id': f'backend::{b}', 'label': b, 'type': 'backend', 'title': b})
        # add server nodes and edges
        for sname, addr in backend_map.get(b, []):
            sid = f'server::{b}::{sname}'
            nodes.append({'id': sid, 'label': f"{sname}\n{addr}", 'type': 'server', 'title': addr})
            edges.append({'from': f'backend::{b}', 'to': sid})

    # add ACL nodes
    for aname, adef in acl_defs.items():
        nodes.append({'id': f'acl::{aname}', 'label': aname, 'type': 'acl', 'title': adef})

    # process frontends and edges (use_backend / default_backend with optional if clause)
    use_backend_re = re.compile(r'^\s*(?:use_backend|default_backend)\s+(\S+)(?:\s+if\s+(.+))?', re.IGNORECASE | re.MULTILINE)

    for sec in sections:
        if sec['type'] == 'frontend':
            fname = sec['name']
            nodes.append({'id': f'frontend::{fname}', 'label': fname, 'type': 'frontend', 'title': fname})
            text = '\n'.join(sec['lines'])
            for m in use_backend_re.finditer(text):
                b = m.group(1)
                cond = m.group(2)
                # ensure backend node exists
                if f'backend::{b}' not in [n['id'] for n in nodes]:
                    nodes.append({'id': f'backend::{b}', 'label': b, 'type': 'backend', 'title': b})

                # If there's a condition, try to link via ACLs as well
                if cond:
                    tokens = re.findall(r"[A-Za-z0-9_:-]+", cond)
                    added = False
                    for t in tokens:
                        if t in acl_defs:
                            added = True
                            edges.append({'from': f'frontend::{fname}', 'to': f'acl::{t}'})
                            edges.append({'from': f'acl::{t}', 'to': f'backend::{b}'})
                    # also add a direct dashed/labelled edge from frontend -> backend for visibility
                    # print(cond)
                    # edges.append({'from': f'frontend::{fname}', 'to': f'backend::{b}', 'label': cond, 'dashes': True})
                    if not added:
                        edges.append({'from': f'frontend::{fname}', 'to': f'backend::{b}', 'label': 'acl', 'dashes': True})
                else:
                    # unconditional direct edge
                    edges.append({'from': f'frontend::{fname}', 'to': f'backend::{b}'})

    return {'nodes': nodes, 'edges': edges}
