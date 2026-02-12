async function fetchConfig() {
  const res = await fetch('/api/config');
  return res.json();
}

async function fetchGraph() {
  const res = await fetch('/api/graph');
  return res.json();
}

let mainNetwork = null;
let miniNetwork = null;

function getNetworkBounds(network) {
  if (!network) return null;
  const ids = network.body.data.nodes.getIds();
  if (!ids || ids.length === 0) return null;
  const positions = network.getPositions(ids);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  ids.forEach(id => {
    const pos = positions[id];
    if (!pos) return;
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, maxX, minY, maxY };
}

function mapMiniToMainPosition(miniPos) {
  const miniBounds = getNetworkBounds(miniNetwork);
  const mainBounds = getNetworkBounds(mainNetwork);
  if (!miniBounds || !mainBounds) return miniPos;
  const miniWidth = miniBounds.maxX - miniBounds.minX || 1;
  const miniHeight = miniBounds.maxY - miniBounds.minY || 1;
  const mainWidth = mainBounds.maxX - mainBounds.minX || 1;
  const mainHeight = mainBounds.maxY - mainBounds.minY || 1;
  const xRatio = (miniPos.x - miniBounds.minX) / miniWidth;
  const yRatio = (miniPos.y - miniBounds.minY) / miniHeight;
  return {
    x: mainBounds.minX + xRatio * mainWidth,
    y: mainBounds.minY + yRatio * mainHeight
  };
}

function renderGraph(graph) {
  const container = document.getElementById('graph');
  container.innerHTML = '';
  // assign vertical levels per group to enforce ordering
  const groupLevel = { frontend: 1, acl: 2, backend: 3, server: 4 };
  const nodes = new vis.DataSet(graph.nodes.map(n => ({ id: n.id, label: n.label, title: n.title || '', group: n.type, level: groupLevel[n.type] || 99 })));
  const edges = new vis.DataSet(graph.edges.map(e => ({ from: e.from, to: e.to, label: e.label || '', dashes: e.dashes || false })));
  const data = { nodes, edges };
  const options = {
    layout: {
      hierarchical: {
        enabled: true,
        direction: 'UD',
        sortMethod: 'directed',
        levelSeparation: 75,
        nodeSpacing: 150,
        treeSpacing: 100,
      }
    },
    nodes: { shape: 'box' },
    edges: { arrows: { to: { enabled: true } }, smooth: false },
    groups: {
      frontend: { color: { background: '#ffd966' }, shape: 'ellipse' },
      backend: { color: { background: '#9fc5e8' }, shape: 'box' },
      acl: { color: { background: '#f4cccc' }, shape: 'diamond' },
      server: { color: { background: '#b6d7a8' }, shape: 'ellipse' }
    },
    physics: { stabilization: false }
  };

  // create main network
  if (mainNetwork) {
    mainNetwork.setData(data);
  } else {
    mainNetwork = new vis.Network(container, data, options);
  }

  // create minimap (small overview) and link clicks to focus main network
  const miniEl = document.getElementById('minimap');
  // prepare minimal nodes/edges for minimap (no labels to keep it compact)
  const miniNodes = new vis.DataSet(graph.nodes.map(n => ({ id: n.id, label: '', group: n.type, level: groupLevel[n.type] || 99 })));
  const miniEdges = new vis.DataSet(graph.edges.map(e => ({ from: e.from, to: e.to })));
  const miniData = { nodes: miniNodes, edges: miniEdges };
  const miniOptions = {
    layout: { hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed', levelSeparation: 40, nodeSpacing: 30, treeSpacing: 30 } },
    interaction: { dragNodes: false, zoomView: false, dragView: false, selectable: false },
    nodes: { shape: 'dot', size: 15, borderWidth: 1, color: { border: '#111827' } },
    edges: { width: 5, color: { color: '#0053f8' } },
    physics: { enabled: false },
    groups: {
      frontend: { color: { background: '#ffd966' }, shape: 'dot' },
      backend: { color: { background: '#9fc5e8' }, shape: 'dot' },
      server: { color: { background: '#b6d7a8' }, shape: 'dot' }
    },
  };

  if (miniNetwork) {
    miniNetwork.setData(miniData);
  } else {
    miniNetwork = new vis.Network(miniEl, miniData, miniOptions);
    miniNetwork.on('click', function (params) {
      if (!mainNetwork || !params.pointer || !params.pointer.DOM) return;
      if (params.nodes && params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        // focus main network on selected node
        mainNetwork.focus(nodeId, { scale: mainNetwork.getScale(), animation: { duration: 300 } });
        return;
      }
      const miniCanvasPos = miniNetwork.DOMtoCanvas(params.pointer.DOM);
      const targetPos = mapMiniToMainPosition(miniCanvasPos);
      mainNetwork.moveTo({ position: targetPos, scale: mainNetwork.getScale(), animation: { duration: 300 } });
    });
  }

  const firstFrontend = graph.nodes.find(n => n.type === 'frontend');
  if (firstFrontend) {
    setTimeout(() => {
      mainNetwork.focus(firstFrontend.id, { scale: 1.0, offset: { x: -250, y: -250 }, animation: { duration: 500 } });
    }, 250);
  }

}

async function loadAll() {
  const cfgResp = await fetchConfig();
  document.getElementById('cfg').value = cfgResp.config || '';
  const graph = await fetchGraph();
  renderGraph(graph);
}

document.getElementById('reload').addEventListener('click', () => window.location.reload());

document.getElementById('save').addEventListener('click', async () => {
  const confirmed = window.confirm('Save changes to haproxy.cfg?');
  if (!confirmed) return;
  const cfg = document.getElementById('cfg').value;
  const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg }) });
  if (res.ok) {
    await loadAll();
    //alert('Saved');
  } else {
    alert('Save failed');
  }
});

// toggle editor visibility via menu button
function setEditorVisible(visible) {
  const ed = document.getElementById('editor');
  if (!ed) return;
  ed.style.display = visible ? 'flex' : 'none';
  const btn = document.getElementById('toggle-config');
  if (btn) btn.textContent = visible ? 'Hide config' : 'Show config';
  try { localStorage.setItem('haproxy_gui_editor_visible', visible ? '1' : '0'); } catch (e) { }
}

document.getElementById('toggle-config').addEventListener('click', () => {
  const ed = document.getElementById('editor');
  const currentlyVisible = ed && window.getComputedStyle(ed).display !== 'none';
  setEditorVisible(!currentlyVisible);
});

// initialize editor visibility from localStorage then load
try {
  const v = localStorage.getItem('haproxy_gui_editor_visible');
  if (v === '0') setEditorVisible(false);
  else setEditorVisible(true);
} catch (e) { }
loadAll().catch(err => console.error(err));
