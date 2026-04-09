/**
 * workspace.js — Interactive mind-map workspace
 * Runs behind the Zero Gravity auth gate.
 */
(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let workspace = null;
  let nodes = [];
  let client = null;
  let activeEditorNode = null;
  let cmInstance = null;
  let saveTimeout = null;
  let zoom = 1;
  let panX = 0, panY = 0;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let selectedType = "code";
  const CENTER_X = 0;
  const CENTER_Y = 0;

  const $ = (id) => document.getElementById(id);

  let containerEl, svgEl, nodesLayerEl, projectNameEl, saveStatusEl;

  // ── Init ───────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", async () => {
    containerEl = $("ws-canvas-container");
    svgEl = $("ws-connections");
    nodesLayerEl = $("ws-nodes-layer");
    projectNameEl = $("ws-project-name");
    saveStatusEl = $("ws-save-status");

    if (window.ZeroGravityAuth?.waitForReady) {
      await window.ZeroGravityAuth.waitForReady();
    }

    // Get Supabase client after auth settles
    client = getClient();

    if (!client) {
      projectNameEl.textContent = "Error: Cannot connect to backend";
      return;
    }

    const problemId = new URLSearchParams(window.location.search).get("problem_id");
    if (!problemId) {
      projectNameEl.textContent = "No problem specified";
      return;
    }

    await loadOrCreateWorkspace(parseInt(problemId, 10));
    setupEventListeners();
    renderAll();
  });

  function getClient() {
    return window.ZeroGravityAuth?.getClient?.() || null;
  }

  // ── Guest ID (persisted in localStorage) ───────────────────
  function getGuestId() {
    let id = localStorage.getItem("zg_guest_id");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : "guest-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem("zg_guest_id", id);
    }
    return id;
  }

  // ── Workspace CRUD ─────────────────────────────────────────
  async function loadOrCreateWorkspace(problemId) {
    const guestId = getGuestId();

    // Try to find existing workspace for this problem + guest
    const { data: existing } = await client
      .from("zg_workspaces")
      .select("*")
      .eq("problem_id", problemId)
      .eq("owner_id", guestId)
      .limit(1);

    if (existing && existing.length > 0) {
      workspace = existing[0];
    } else {
      // Fetch problem info for the name
      const { data: prob } = await client
        .from("zg_client_problem_statements")
        .select("project_description, project_type")
        .eq("id", problemId)
        .single();

      const name = prob?.project_description
        ? prob.project_description.substring(0, 60)
        : `Problem #${problemId}`;

      const { data: created, error } = await client
        .from("zg_workspaces")
        .insert({
          problem_id: problemId,
          owner_id: guestId,
          name: name,
        })
        .select()
        .single();

      if (error) {
        console.error("Workspace create error:", error);
        projectNameEl.textContent = "Error: " + error.message;
        return;
      }
      workspace = created;
    }

    projectNameEl.textContent = workspace.name;
    document.title = `${workspace.name} | Workspace`;

    // Load child nodes
    const { data: nodeData } = await client
      .from("zg_workspace_nodes")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("sort_order", { ascending: true });

    nodes = nodeData || [];
  }

  // ── Rendering ──────────────────────────────────────────────
  function renderAll() {
    renderNodes();
    renderConnections();
  }

  function getTransform() {
    return `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function renderNodes() {
    nodesLayerEl.innerHTML = "";
    nodesLayerEl.style.transform = getTransform();

    // ── Central node ──
    const centerNode = document.createElement("div");
    centerNode.className = "ws-node ws-node-center";
    centerNode.style.left = `${CENTER_X - 110}px`;
    centerNode.style.top = `${CENTER_Y - 45}px`;
    centerNode.innerHTML = `
      <div class="ws-center-glow"></div>
      <div class="ws-node-icon">🎯</div>
      <div class="ws-node-label">${esc(workspace.name)}</div>
    `;
    nodesLayerEl.appendChild(centerNode);

    // Auto-layout if all at (0,0)
    if (nodes.length > 0 && nodes.every(n => n.position_x === 0 && n.position_y === 0)) {
      autoLayoutNodes();
    }

    // ── Child nodes ──
    nodes.forEach((node) => {
      const el = document.createElement("div");
      el.className = `ws-node ws-node-child ws-node-type-${node.node_type}`;
      el.dataset.nodeId = node.id;
      el.style.left = `${node.position_x - 85}px`;
      el.style.top = `${node.position_y - 32}px`;

      const icon = typeIcon(node.node_type);
      const langBadge = node.node_type === "code" ? `<span class="ws-lang-badge">${node.language || "js"}</span>` : "";

      el.innerHTML = `
        <div class="ws-node-header-row">
          <span class="ws-node-icon">${icon}</span>
          <span class="ws-node-label">${esc(node.label)}</span>
        </div>
        <div class="ws-node-meta">
          <span class="ws-node-type-badge">${node.node_type}</span>
          ${langBadge}
        </div>
      `;

      // Click → open editor
      el.addEventListener("click", (e) => {
        if (el.classList.contains("is-dragging")) return;
        e.stopPropagation();
        openEditor(node);
      });

      // Drag
      setupDrag(el, node);
      nodesLayerEl.appendChild(el);
    });
  }

  function renderConnections() {
    svgEl.innerHTML = "";
    svgEl.style.transform = getTransform();

    const w = window.innerWidth * 4;
    const h = window.innerHeight * 4;
    svgEl.setAttribute("viewBox", `${-w / 2} ${-h / 2} ${w} ${h}`);

    // Arrow marker
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="rgba(0,245,212,0.5)" />
      </marker>
      <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:rgba(0,245,212,0.4)"/>
        <stop offset="100%" style="stop-color:rgba(57,255,20,0.3)"/>
      </linearGradient>
    `;
    svgEl.appendChild(defs);

    nodes.forEach((node) => {
      const toX = node.position_x;
      const toY = node.position_y;

      // Curved bezier from center to node
      const dx = toX - CENTER_X;
      const dy = toY - CENTER_Y;
      const ctrlX = CENTER_X + dx * 0.5 + dy * 0.12;
      const ctrlY = CENTER_Y + dy * 0.5 - dx * 0.12;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${CENTER_X} ${CENTER_Y} Q ${ctrlX} ${ctrlY} ${toX} ${toY}`);
      path.setAttribute("class", "ws-connection-line");
      path.setAttribute("marker-end", "url(#arrowhead)");
      svgEl.appendChild(path);
    });
  }

  function autoLayoutNodes() {
    const count = nodes.length;
    const radius = Math.max(220, 120 + count * 30);
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      node.position_x = CENTER_X + Math.cos(angle) * radius;
      node.position_y = CENTER_Y + Math.sin(angle) * radius;
    });
    nodes.forEach((n) => saveNodePosition(n));
  }

  // ── Drag Engine ────────────────────────────────────────────
  function setupDrag(el, node) {
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, origX, origY;

    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      origX = node.position_x;
      origY = node.position_y;
      el.classList.add("is-dragging");
      document.body.style.cursor = "grabbing";
    });

    const onMove = (e) => {
      if (!isDragging) return;
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      node.position_x = origX + dx;
      node.position_y = origY + dy;
      el.style.left = `${node.position_x - 85}px`;
      el.style.top = `${node.position_y - 32}px`;
      renderConnections();
    };

    const onUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = "";
      if (hasMoved) {
        saveNodePosition(node);
        // Prevent click from firing
        setTimeout(() => el.classList.remove("is-dragging"), 50);
      } else {
        el.classList.remove("is-dragging");
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Pan + Zoom ─────────────────────────────────────────────
  function setupEventListeners() {
    // Pan canvas
    containerEl.addEventListener("mousedown", (e) => {
      if (e.target === containerEl || e.target === svgEl) {
        isPanning = true;
        panStart = { x: e.clientX - panX, y: e.clientY - panY };
        containerEl.style.cursor = "grabbing";
      }
    });
    document.addEventListener("mousemove", (e) => {
      if (!isPanning) return;
      panX = e.clientX - panStart.x;
      panY = e.clientY - panStart.y;
      nodesLayerEl.style.transform = getTransform();
      svgEl.style.transform = getTransform();
    });
    document.addEventListener("mouseup", () => {
      isPanning = false;
      containerEl.style.cursor = "";
    });

    // Scroll zoom
    containerEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      zoom = Math.max(0.25, Math.min(3, zoom + delta));
      nodesLayerEl.style.transform = getTransform();
      svgEl.style.transform = getTransform();
    }, { passive: false });

    // Zoom buttons
    $("ws-zoom-in")?.addEventListener("click", () => {
      zoom = Math.min(3, zoom + 0.2);
      nodesLayerEl.style.transform = getTransform();
      svgEl.style.transform = getTransform();
    });
    $("ws-zoom-out")?.addEventListener("click", () => {
      zoom = Math.max(0.25, zoom - 0.2);
      nodesLayerEl.style.transform = getTransform();
      svgEl.style.transform = getTransform();
    });

    // Add node modal
    $("ws-add-node-btn")?.addEventListener("click", openAddModal);
    $("ws-add-modal-close")?.addEventListener("click", closeAddModal);
    $("ws-add-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "ws-add-modal") closeAddModal();
    });

    // Type selector in add modal
    document.querySelectorAll(".ws-type-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".ws-type-btn").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        selectedType = btn.dataset.type;
        const langGroup = $("ws-lang-group");
        if (langGroup) langGroup.style.display = selectedType === "code" ? "" : "none";
      });
    });

    // Add node form submit
    $("ws-add-node-form")?.addEventListener("submit", handleAddNode);

    // Editor panel
    $("ws-close-editor")?.addEventListener("click", closeEditor);
    $("ws-delete-node-btn")?.addEventListener("click", handleDeleteNode);

    // Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAddModal();
        closeEditor();
      }
    });
  }

  // ── Add Node ───────────────────────────────────────────────
  function openAddModal() {
    $("ws-add-modal").classList.add("is-visible");
    setTimeout(() => $("ws-node-label")?.focus(), 100);
  }
  function closeAddModal() {
    $("ws-add-modal")?.classList.remove("is-visible");
    $("ws-add-node-form")?.reset();
    // Reset type to code
    document.querySelectorAll(".ws-type-btn").forEach(b => b.classList.remove("is-active"));
    document.querySelector('.ws-type-btn[data-type="code"]')?.classList.add("is-active");
    selectedType = "code";
    const langGroup = $("ws-lang-group");
    if (langGroup) langGroup.style.display = "";
  }

  async function handleAddNode(e) {
    e.preventDefault();
    const label = $("ws-node-label").value.trim();
    if (!label || !workspace) return;

    const lang = $("ws-node-lang")?.value || "javascript";

    // Position in expanding spiral
    const count = nodes.length;
    const angle = (2 * Math.PI * count) / Math.max(count + 1, 6) - Math.PI / 2;
    const radius = 240 + Math.floor(count / 6) * 100;
    const posX = CENTER_X + Math.cos(angle) * radius;
    const posY = CENTER_Y + Math.sin(angle) * radius;

    setSaveStatus("saving");

    const { data: created, error } = await client
      .from("zg_workspace_nodes")
      .insert({
        workspace_id: workspace.id,
        label: label,
        node_type: selectedType,
        language: lang,
        position_x: posX,
        position_y: posY,
        sort_order: count,
        content: selectedType === "code" ? `// ${label}\n` : "",
      })
      .select()
      .single();

    if (error) {
      alert("Error creating node: " + error.message);
      setSaveStatus("error");
      return;
    }

    nodes.push(created);
    closeAddModal();
    renderAll();
    setSaveStatus("saved");

    // Auto-open editor for code/text nodes
    if (selectedType === "code" || selectedType === "text") {
      setTimeout(() => openEditor(created), 100);
    }
  }

  // ── Editor Panel ───────────────────────────────────────────
  function openEditor(node) {
    // Clean up previous editor
    if (cmInstance) {
      try { cmInstance.toTextArea(); } catch (e) {}
      cmInstance = null;
    }

    activeEditorNode = node;
    const panel = $("ws-editor-panel");
    const body = $("ws-editor-body");

    $("ws-editor-icon").textContent = typeIcon(node.node_type);
    $("ws-editor-title").textContent = node.label;
    body.innerHTML = "";

    // Highlight active
    document.querySelectorAll(".ws-node-child").forEach(n => n.classList.remove("is-active"));
    const activeEl = document.querySelector(`[data-node-id="${node.id}"]`);
    if (activeEl) activeEl.classList.add("is-active");

    switch (node.node_type) {
      case "code":  renderCodeEditor(body, node); break;
      case "text":  renderTextEditor(body, node); break;
      case "image": renderImageViewer(body, node); break;
      case "pdf":   renderPdfViewer(body, node); break;
      case "link":  renderLinkEditor(body, node); break;
    }

    panel.classList.add("is-open");
  }

  function closeEditor() {
    $("ws-editor-panel")?.classList.remove("is-open");
    document.querySelectorAll(".ws-node-child").forEach(n => n.classList.remove("is-active"));
    if (cmInstance) {
      try { cmInstance.toTextArea(); } catch (e) {}
      cmInstance = null;
    }
    activeEditorNode = null;
  }

  function renderCodeEditor(container, node) {
    const textarea = document.createElement("textarea");
    textarea.value = node.content || "";
    textarea.id = "ws-code-area";
    container.appendChild(textarea);

    setTimeout(() => {
      if (typeof CodeMirror !== "undefined") {
        cmInstance = CodeMirror.fromTextArea(textarea, {
          mode: node.language || "javascript",
          theme: "material-darker",
          lineNumbers: true,
          tabSize: 2,
          indentWithTabs: false,
          lineWrapping: true,
          autofocus: true,
          matchBrackets: true,
          autoCloseBrackets: true,
        });
        cmInstance.setSize("100%", "100%");
        cmInstance.setValue(node.content || "");
        cmInstance.on("change", () => {
          debounceSaveContent(node, cmInstance.getValue());
        });
      } else {
        // Fallback: plain textarea IDE
        textarea.style.cssText = `
          width:100%;height:100%;background:#0a0a0a;color:#e0e0e0;
          border:none;padding:1rem;font-family:'JetBrains Mono',monospace;
          font-size:0.88rem;resize:none;outline:none;line-height:1.6;
          tab-size:2;
        `;
        textarea.addEventListener("input", () => debounceSaveContent(node, textarea.value));
        // Support Tab key
        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const start = textarea.selectionStart;
            textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(textarea.selectionEnd);
            textarea.selectionStart = textarea.selectionEnd = start + 2;
            debounceSaveContent(node, textarea.value);
          }
        });
      }
    }, 80);
  }

  function renderTextEditor(container, node) {
    const textarea = document.createElement("textarea");
    textarea.className = "ws-text-editor";
    textarea.value = node.content || "";
    textarea.placeholder = "Write your notes, ideas, documentation…";
    container.appendChild(textarea);
    textarea.addEventListener("input", () => debounceSaveContent(node, textarea.value));
    setTimeout(() => textarea.focus(), 80);
  }

  function renderImageViewer(container, node) {
    let html = "";
    if (node.file_url) {
      html += `<img src="${esc(node.file_url)}" alt="${esc(node.label)}" class="ws-preview-img" />`;
    } else if (node.content && node.content.startsWith("data:image")) {
      html += `<img src="${node.content}" alt="${esc(node.label)}" class="ws-preview-img" />`;
    }
    html += `
      <div class="ws-upload-zone" id="ws-upload-zone">
        <span style="font-size:2.5rem;display:block;margin-bottom:0.5rem;">📁</span>
        <p>${node.file_url || node.content ? "Click to replace image" : "Click or drag to upload an image"}</p>
        <p style="font-size:0.75rem;opacity:0.5;margin-top:0.25rem;">JPG, PNG, GIF, SVG, WebP</p>
        <input type="file" accept="image/*" id="ws-file-input" />
      </div>
    `;
    container.innerHTML = html;
    $("ws-file-input")?.addEventListener("change", (e) => handleFileUpload(e, node));
    setupDropZone($("ws-upload-zone"), node);
  }

  function renderPdfViewer(container, node) {
    let html = "";
    if (node.file_url) {
      html += `<iframe src="${esc(node.file_url)}" class="ws-pdf-embed" title="${esc(node.label)}"></iframe>`;
    }
    html += `
      <div class="ws-upload-zone" id="ws-upload-zone">
        <span style="font-size:2.5rem;display:block;margin-bottom:0.5rem;">📄</span>
        <p>${node.file_url ? "Click to replace PDF" : "Click or drag to upload a PDF"}</p>
        <input type="file" accept=".pdf,application/pdf" id="ws-file-input" />
      </div>
    `;
    container.innerHTML = html;
    $("ws-file-input")?.addEventListener("change", (e) => handleFileUpload(e, node));
    setupDropZone($("ws-upload-zone"), node);
  }

  function renderLinkEditor(container, node) {
    container.innerHTML = `
      <div style="padding:1.25rem;">
        <div class="zg-form-group">
          <label for="ws-link-input" style="color:var(--text);font-weight:600;font-size:0.85rem;">URL</label>
          <input type="url" id="ws-link-input" value="${esc(node.content || "")}" placeholder="https://example.com" />
        </div>
        ${node.content ? `
          <a href="${esc(node.content)}" target="_blank" rel="noopener" class="button button-ghost" style="width:100%;margin-top:0.75rem;">
            Open Link ↗
          </a>
        ` : ""}
      </div>
    `;
    $("ws-link-input")?.addEventListener("input", (e) => debounceSaveContent(node, e.target.value));
  }

  // ── File Upload ────────────────────────────────────────────
  function setupDropZone(zone, node) {
    if (!zone) return;
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-dragover"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("is-dragover");
      const file = e.dataTransfer?.files[0];
      if (file) uploadFile(file, node);
    });
    zone.addEventListener("click", (e) => {
      if (e.target.tagName !== "INPUT") $("ws-file-input")?.click();
    });
  }

  async function handleFileUpload(e, node) {
    const file = e.target?.files?.[0];
    if (!file) return;
    await uploadFile(file, node);
  }

  async function uploadFile(file, node) {
    setSaveStatus("uploading");

    // Store as base64 data URL (works without Storage bucket)
    const reader = new FileReader();
    reader.onload = async () => {
      node.content = reader.result;
      await saveNodeField(node, "content", node.content);
      openEditor(node);
      setSaveStatus("saved");
    };
    reader.onerror = () => {
      setSaveStatus("error");
      alert("Failed to read file");
    };
    reader.readAsDataURL(file);
  }

  // ── Delete Node ────────────────────────────────────────────
  async function handleDeleteNode() {
    if (!activeEditorNode) return;
    if (!confirm(`Delete "${activeEditorNode.label}"? This cannot be undone.`)) return;

    setSaveStatus("saving");
    const { error } = await client
      .from("zg_workspace_nodes")
      .delete()
      .eq("id", activeEditorNode.id);

    if (error) {
      alert("Error deleting: " + error.message);
      setSaveStatus("error");
      return;
    }

    nodes = nodes.filter(n => n.id !== activeEditorNode.id);
    closeEditor();
    renderAll();
    setSaveStatus("saved");
  }

  // ── Save Helpers ───────────────────────────────────────────
  function debounceSaveContent(node, content) {
    node.content = content;
    setSaveStatus("saving");
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      await saveNodeField(node, "content", content);
      setSaveStatus("saved");
    }, 600);
  }

  async function saveNodeField(node, field, value) {
    const { error } = await client
      .from("zg_workspace_nodes")
      .update({ [field]: value })
      .eq("id", node.id);
    if (error) {
      console.error("Save error:", error);
      setSaveStatus("error");
    }
  }

  async function saveNodePosition(node) {
    const { error } = await client
      .from("zg_workspace_nodes")
      .update({ position_x: node.position_x, position_y: node.position_y })
      .eq("id", node.id);
    if (error) console.error("Position save error:", error);
  }

  function setSaveStatus(state) {
    if (!saveStatusEl) return;
    const map = {
      saved:     ["Saved ✓",       "ws-save-status ws-status-saved"],
      saving:    ["Saving…",       "ws-save-status ws-status-saving"],
      uploading: ["Uploading…",    "ws-save-status ws-status-saving"],
      error:     ["Error ✗",       "ws-save-status ws-status-error"],
    };
    const [text, cls] = map[state] || map.saved;
    saveStatusEl.textContent = text;
    saveStatusEl.className = cls;
  }

  function typeIcon(type) {
    return { code: "💻", text: "📝", image: "🖼️", pdf: "📄", link: "🔗" }[type] || "📦";
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }
})();
