/**
 * SchemaCraft — Interactive Canvas Engine
 * Renders table cards, SVG connector curves, pan/zoom, drag-to-connect, and minimap.
 */

(function (window) {
  'use strict';

  class SchemaCanvas {
    constructor(state, tableManager) {
      this.state = state;
      this.tableManager = tableManager;

      // DOM Elements
      this.wrapperEl = document.getElementById('canvasWrapper');
      this.viewportEl = document.getElementById('canvasViewport');
      this.planeEl = document.getElementById('canvasPlane');
      this.tablesContainer = document.getElementById('tablesCardsContainer');
      this.connectionsSvg = document.getElementById('connectionsSvg');
      this.connectionsGroup = document.getElementById('connectionsGroup');
      this.tempPath = document.getElementById('tempConnectionPath');
      this.zoomDisplay = document.getElementById('zoomLevelDisplay');
      this.toastEl = document.getElementById('dragConnectionToast');

      // Minimap Elements
      this.minimapContainer = document.getElementById('minimapContainer');
      this.minimapTablesGroup = document.getElementById('minimapTablesGroup');
      this.minimapViewportRect = document.getElementById('minimapViewportRect');

      // Interaction States
      this.isPanning = false;
      this.panStart = { x: 0, y: 0 };
      this.isSpacePressed = false;

      // Dragging Table State
      this.draggedTableId = null;
      this.tableDragOffset = { x: 0, y: 0 };
      this.hasTableMoved = false;

      // Drag-to-Connect State
      this.isConnecting = false;
      this.connectSource = null; // { tableId, columnId, x, y }

      this.initEventListeners();
      this.updateTransform();
      this.render();
    }

    initEventListeners() {
      // 1. Pan & Zoom on Viewport
      this.viewportEl.addEventListener('mousedown', (e) => this.onMouseDown(e));
      window.addEventListener('mousemove', (e) => this.onMouseMove(e));
      window.addEventListener('mouseup', (e) => this.onMouseUp(e));
      this.viewportEl.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

      // Double-click empty canvas to create table
      this.viewportEl.addEventListener('dblclick', (e) => {
        if (e.target === this.viewportEl || e.target.classList.contains('canvas-grid-svg') || e.target.tagName === 'rect') {
          const world = this.screenToWorld(e.clientX, e.clientY);
          this.tableManager.createTable(null, world.x, world.y);
        }
      });

      // Keyboard shortcuts
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !this.isEditingInput(e.target)) {
          this.isSpacePressed = true;
          this.viewportEl.style.cursor = 'grab';
        }
        if (e.key === 'Escape' && this.isConnecting) {
          this.cancelConnecting();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (!this.isEditingInput(e.target)) {
            if (this.state.selectedRelationshipId) {
              this.tableManager.deleteRelationship(this.state.selectedRelationshipId);
            } else if (this.state.selectedTableId) {
              // Confirmation for table
              const table = this.state.getTable(this.state.selectedTableId);
              if (table) {
                this.tableManager.deleteTable(table.id);
                window.showToast(`Table "${table.name}" deleted`, 'info');
              }
            }
          }
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          this.isSpacePressed = false;
          if (!this.isPanning) this.viewportEl.style.cursor = '';
        }
      });

      // Canvas HUD buttons
      document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomBy(0.15));
      document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomBy(-0.15));
      document.getElementById('resetViewBtn').addEventListener('click', () => this.resetView());
      document.getElementById('fitScreenBtn').addEventListener('click', () => this.fitToScreen());

      const snapBtn = document.getElementById('snapGridBtn');
      snapBtn.addEventListener('click', () => {
        this.state.isSnapToGrid = !this.state.isSnapToGrid;
        snapBtn.classList.toggle('active', this.state.isSnapToGrid);
        window.showToast(`Snap to grid: ${this.state.isSnapToGrid ? 'ON' : 'OFF'}`, 'info');
      });

      // Minimap Toggle
      document.getElementById('toggleMinimapBtn').addEventListener('click', () => {
        this.minimapContainer.classList.toggle('hidden');
      });

      // Event bus listeners
      this.state.bus.on('schema:loaded', () => this.render());
      this.state.bus.on('table:created', () => this.render());
      this.state.bus.on('table:updated', () => this.render());
      this.state.bus.on('table:deleted', () => this.render());
      this.state.bus.on('table:moved', () => this.updateTablePositionAndConnectors());
      this.state.bus.on('relationship:created', () => this.render());
      this.state.bus.on('relationship:updated', () => this.renderConnectors());
      this.state.bus.on('relationship:deleted', () => this.renderConnectors());
      this.state.bus.on('selection:changed', () => this.updateSelectionVisuals());

      // Window resize
      window.addEventListener('resize', () => {
        this.renderMinimap();
      });
    }

    isEditingInput(target) {
      return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    }

    // Convert screen (client) coordinates to canvas world coordinates
    screenToWorld(clientX, clientY) {
      const rect = this.viewportEl.getBoundingClientRect();
      const x = (clientX - rect.left - this.state.pan.x) / this.state.zoom;
      const y = (clientY - rect.top - this.state.pan.y) / this.state.zoom;
      return { x, y };
    }

    // Convert world coordinates to screen coordinates
    worldToScreen(worldX, worldY) {
      const rect = this.viewportEl.getBoundingClientRect();
      const x = worldX * this.state.zoom + this.state.pan.x + rect.left;
      const y = worldY * this.state.zoom + this.state.pan.y + rect.top;
      return { x, y };
    }

    updateTransform() {
      this.planeEl.style.transform = `translate(${this.state.pan.x}px, ${this.state.pan.y}px) scale(${this.state.zoom})`;
      this.zoomDisplay.textContent = `${Math.round(this.state.zoom * 100)}%`;
      this.renderMinimap();
    }

    zoomBy(delta, cursorClientX = null, cursorClientY = null) {
      const oldZoom = this.state.zoom;
      let newZoom = Math.max(0.25, Math.min(2.5, oldZoom + delta));
      newZoom = Math.round(newZoom * 100) / 100;

      if (newZoom === oldZoom) return;

      const rect = this.viewportEl.getBoundingClientRect();
      const cx = cursorClientX !== null ? cursorClientX - rect.left : rect.width / 2;
      const cy = cursorClientY !== null ? cursorClientY - rect.top : rect.height / 2;

      // Keep world point under cursor stationary
      const worldX = (cx - this.state.pan.x) / oldZoom;
      const worldY = (cy - this.state.pan.y) / oldZoom;

      this.state.pan.x = cx - worldX * newZoom;
      this.state.pan.y = cy - worldY * newZoom;
      this.state.zoom = newZoom;

      this.updateTransform();
      this.state.bus.emit('state:modified');
    }

    resetView() {
      this.state.pan = { x: 80, y: 80 };
      this.state.zoom = 1.0;
      this.updateTransform();
      this.state.bus.emit('state:modified');
    }

    fitToScreen() {
      if (this.state.tables.length === 0) {
        this.resetView();
        return;
      }

      const rect = this.viewportEl.getBoundingClientRect();
      const padding = 80;

      // Find bounding box of all tables
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      this.state.tables.forEach(t => {
        const el = document.getElementById(`tableNode_${t.id}`);
        const width = el ? el.offsetWidth : 260;
        const height = el ? el.offsetHeight : 200;

        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + width);
        maxY = Math.max(maxY, t.y + height);
      });

      const bboxWidth = maxX - minX;
      const bboxHeight = maxY - minY;

      const availableWidth = rect.width - padding * 2;
      const availableHeight = rect.height - padding * 2;

      let zoom = Math.min(availableWidth / bboxWidth, availableHeight / bboxHeight);
      zoom = Math.max(0.3, Math.min(1.4, zoom));

      this.state.zoom = Math.round(zoom * 100) / 100;
      this.state.pan.x = (rect.width - bboxWidth * this.state.zoom) / 2 - minX * this.state.zoom;
      this.state.pan.y = (rect.height - bboxHeight * this.state.zoom) / 2 - minY * this.state.zoom;

      this.updateTransform();
      this.state.bus.emit('state:modified');
    }

    // --- Mouse Event Handlers ---
    onMouseDown(e) {
      if (e.button === 1 || this.isSpacePressed || e.target === this.viewportEl || e.target.classList.contains('canvas-grid-svg') || e.target.tagName === 'rect') {
        // Start Canvas Pan
        this.isPanning = true;
        this.panStart = { x: e.clientX - this.state.pan.x, y: e.clientY - this.state.pan.y };
        this.viewportEl.classList.add('panning');

        // Deselect if clicking pure background
        if (e.button === 0 && !this.isSpacePressed) {
          this.state.select(null);
        }
      }
    }

    onMouseMove(e) {
      // 1. Pan Canvas
      if (this.isPanning) {
        this.state.pan.x = e.clientX - this.panStart.x;
        this.state.pan.y = e.clientY - this.panStart.y;
        this.updateTransform();
        return;
      }

      // 2. Drag Table Card
      if (this.draggedTableId) {
        this.hasTableMoved = true;
        const world = this.screenToWorld(e.clientX, e.clientY);
        const newX = world.x - this.tableDragOffset.x;
        const newY = world.y - this.tableDragOffset.y;

        const table = this.state.getTable(this.draggedTableId);
        if (table) {
          table.x = Math.round(newX);
          table.y = Math.round(newY);

          // Update DOM node position directly for 60fps smoothness
          const cardEl = document.getElementById(`tableNode_${table.id}`);
          if (cardEl) {
            cardEl.style.left = `${table.x}px`;
            cardEl.style.top = `${table.y}px`;
          }

          // Update connectors
          this.renderConnectors();
        }
        return;
      }

      // 3. Drag-to-Connect Live Line
      if (this.isConnecting && this.connectSource) {
        const world = this.screenToWorld(e.clientX, e.clientY);
        this.drawTempConnectionLine(this.connectSource.x, this.connectSource.y, world.x, world.y);
      }
    }

    onMouseUp(e) {
      if (this.isPanning) {
        this.isPanning = false;
        this.viewportEl.classList.remove('panning');
      }

      if (this.draggedTableId) {
        const table = this.state.getTable(this.draggedTableId);
        const cardEl = document.getElementById(`tableNode_${this.draggedTableId}`);
        if (cardEl) cardEl.classList.remove('dragging');

        if (table && this.hasTableMoved) {
          this.tableManager.moveTable(table.id, table.x, table.y);
        }
        this.draggedTableId = null;
        this.hasTableMoved = false;
      }

      if (this.isConnecting) {
        // If dropped anywhere except an anchor port, cancel
        const portEl = e.target.closest('.column-port');
        if (!portEl) {
          this.cancelConnecting();
        }
      }
    }

    onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      this.zoomBy(delta, e.clientX, e.clientY);
    }

    // --- Drag-to-Connect Logic ---
    startConnecting(sourceTableId, sourceColumnId, portEl) {
      const portPos = this.getPortWorldPosition(portEl);
      this.isConnecting = true;
      this.connectSource = {
        tableId: sourceTableId,
        columnId: sourceColumnId,
        x: portPos.x,
        y: portPos.y
      };

      this.toastEl.classList.remove('hidden');
      document.body.style.cursor = 'crosshair';
    }

    finishConnecting(targetTableId, targetColumnId) {
      if (!this.isConnecting || !this.connectSource) return;

      const sourceTableId = this.connectSource.tableId;
      const sourceColumnId = this.connectSource.columnId;

      this.cancelConnecting();

      // Avoid connecting to same table or column
      if (sourceTableId === targetTableId && sourceColumnId === targetColumnId) {
        window.showToast('Cannot connect a column to itself.', 'warning');
        return;
      }

      const res = this.tableManager.addRelationship(
        sourceTableId,
        sourceColumnId,
        targetTableId,
        targetColumnId
      );

      if (res.success) {
        window.showToast('Relationship connected successfully!', 'success');
      } else {
        window.showToast(res.error, 'error');
      }
    }

    cancelConnecting() {
      this.isConnecting = false;
      this.connectSource = null;
      this.tempPath.setAttribute('d', '');
      this.toastEl.classList.add('hidden');
      document.body.style.cursor = '';
    }

    drawTempConnectionLine(x1, y1, x2, y2) {
      const dx = Math.abs(x2 - x1) * 0.5;
      const c1x = x1 + (x2 > x1 ? dx : -dx);
      const c2x = x2 + (x2 > x1 ? -dx : dx);
      const d = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
      this.tempPath.setAttribute('d', d);
    }

    getPortWorldPosition(portEl) {
      const cardEl = portEl.closest('.table-card-node');
      const tableId = cardEl.dataset.tableId;
      const table = this.state.getTable(tableId);

      const isRight = portEl.classList.contains('port-right');
      const rowEl = portEl.closest('.table-card-row');
      const yOffset = rowEl.offsetTop + rowEl.offsetHeight / 2;

      return {
        x: table.x + (isRight ? cardEl.offsetWidth : 0),
        y: table.y + yOffset
      };
    }

    // --- Complete Diagram Render ---
    render() {
      this.renderTableCards();
      this.renderConnectors();
      this.renderMinimap();
      this.updateSelectionVisuals();
    }

    updateTablePositionAndConnectors() {
      this.renderConnectors();
      this.renderMinimap();
    }

    updateSelectionVisuals() {
      // Tables
      const tableCards = this.tablesContainer.querySelectorAll('.table-card-node');
      tableCards.forEach(card => {
        card.classList.toggle('selected', card.dataset.tableId === this.state.selectedTableId);
      });

      // Connectors
      const relPaths = this.connectionsGroup.querySelectorAll('.relation-path');
      relPaths.forEach(path => {
        path.classList.toggle('selected', path.dataset.relationId === this.state.selectedRelationshipId);
      });
    }

    // --- Render Table DOM Cards ---
    renderTableCards() {
      this.tablesContainer.innerHTML = '';

      this.state.tables.forEach(table => {
        const card = document.createElement('div');
        card.className = 'table-card-node';
        card.id = `tableNode_${table.id}`;
        card.dataset.tableId = table.id;
        card.style.left = `${table.x}px`;
        card.style.top = `${table.y}px`;
        card.style.setProperty('--card-accent-color', table.color || '#3b82f6');

        if (this.state.selectedTableId === table.id) {
          card.classList.add('selected');
        }

        // Header
        const header = document.createElement('div');
        header.className = 'table-card-header';
        header.innerHTML = `
          <div class="table-card-title" title="${table.name}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg>
            <span>${table.name}</span>
          </div>
          <div class="table-header-actions">
            <button class="btn-icon-xs quick-add-col" title="Add Column">+</button>
          </div>
        `;

        // Card Dragging
        header.addEventListener('mousedown', (e) => {
          if (e.button !== 0 || e.target.closest('.quick-add-col')) return;
          e.stopPropagation();

          this.state.select('table', table.id);
          this.draggedTableId = table.id;
          this.hasTableMoved = false;

          const world = this.screenToWorld(e.clientX, e.clientY);
          this.tableDragOffset = {
            x: world.x - table.x,
            y: world.y - table.y
          };

          card.classList.add('dragging');
        });

        // Quick add column button in header
        header.querySelector('.quick-add-col').addEventListener('click', (e) => {
          e.stopPropagation();
          const col = this.tableManager.addColumn(table.id);
          this.state.select('table', table.id, col.id);
        });

        // Select on card click
        card.addEventListener('mousedown', (e) => {
          if (!this.isConnecting) {
            e.stopPropagation();
            this.state.select('table', table.id);
          }
        });

        // Columns List
        const columnsContainer = document.createElement('div');
        columnsContainer.className = 'table-card-columns';

        table.columns.forEach(col => {
          const row = document.createElement('div');
          row.className = 'table-card-row';
          row.dataset.columnId = col.id;

          if (this.state.selectedTableId === table.id && this.state.selectedColumnId === col.id) {
            row.classList.add('is-active-col');
          }

          // Check if this column is a foreign key
          const isFk = this.state.relationships.some(
            r => r.sourceTableId === table.id && r.sourceColumnId === col.id
          );

          // Left Port
          const portLeft = document.createElement('div');
          portLeft.className = 'column-port port-left';
          portLeft.title = 'Drag to connect relation';

          // Right Port
          const portRight = document.createElement('div');
          portRight.className = 'column-port port-right';
          portRight.title = 'Drag to connect relation';

          this.setupPortEvents(portLeft, table.id, col.id);
          this.setupPortEvents(portRight, table.id, col.id);

          // Column labels
          let pkIcon = '';
          if (col.isPrimary) {
            pkIcon = `
              <span class="col-icon-pk" title="Primary Key">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2l-2 2m-1.5 1.5L14 9l-3-3L3.5 13.5a5 5 0 1 0 7 7L18 13l3.5-3.5L21 2z"/></svg>
              </span>
            `;
          }

          let fkIcon = '';
          if (isFk && !col.isPrimary) {
            fkIcon = `
              <span class="col-icon-fk" title="Foreign Key">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </span>
            `;
          }

          const notNullTag = col.isNotNull && !col.isPrimary ? `<span class="tag-nn" title="Not Null">NN</span>` : '';

          row.innerHTML = `
            <div class="col-left-meta">
              ${pkIcon}
              ${fkIcon}
              <span class="col-name-label ${col.isPrimary ? 'bold-pk' : ''}">${col.name}</span>
            </div>
            <div class="col-right-meta">
              <span class="type-pill" data-type="${col.type}">${col.type}</span>
              ${notNullTag}
            </div>
          `;

          row.appendChild(portLeft);
          row.appendChild(portRight);

          row.addEventListener('click', (e) => {
            if (!e.target.classList.contains('column-port')) {
              e.stopPropagation();
              this.state.select('table', table.id, col.id);
            }
          });

          columnsContainer.appendChild(row);
        });

        card.appendChild(header);
        card.appendChild(columnsContainer);
        this.tablesContainer.appendChild(card);
      });
    }

    setupPortEvents(portEl, tableId, columnId) {
      portEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.startConnecting(tableId, columnId, portEl);
      });

      portEl.addEventListener('mouseup', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (this.isConnecting) {
          this.finishConnecting(tableId, columnId);
        }
      });
    }

    // --- Render SVG Connectors Between Tables ---
    renderConnectors() {
      this.connectionsGroup.innerHTML = '';

      this.state.relationships.forEach(rel => {
        const srcTable = this.state.getTable(rel.sourceTableId);
        const tgtTable = this.state.getTable(rel.targetTableId);
        if (!srcTable || !tgtTable) return;

        const srcNode = document.getElementById(`tableNode_${srcTable.id}`);
        const tgtNode = document.getElementById(`tableNode_${tgtTable.id}`);
        if (!srcNode || !tgtNode) return;

        const srcRow = srcNode.querySelector(`[data-column-id="${rel.sourceColumnId}"]`);
        const tgtRow = tgtNode.querySelector(`[data-column-id="${rel.targetColumnId}"]`);
        if (!srcRow || !tgtRow) return;

        // Choose connection ports (left or right) based on horizontal position
        const srcWidth = srcNode.offsetWidth;
        const tgtWidth = tgtNode.offsetWidth;

        let srcX, srcY, tgtX, tgtY;
        srcY = srcTable.y + srcRow.offsetTop + srcRow.offsetHeight / 2;
        tgtY = tgtTable.y + tgtRow.offsetTop + tgtRow.offsetHeight / 2;

        if (srcTable.x + srcWidth < tgtTable.x) {
          // Source is to the left of Target: source-right -> target-left
          srcX = srcTable.x + srcWidth;
          tgtX = tgtTable.x;
        } else if (tgtTable.x + tgtWidth < srcTable.x) {
          // Target is to the left of Source: source-left -> target-right
          srcX = srcTable.x;
          tgtX = tgtTable.x + tgtWidth;
        } else {
          // Overlapping horizontally: connect on whichever side has more room
          srcX = srcTable.x + srcWidth;
          tgtX = tgtTable.x + tgtWidth;
        }

        // Generate cubic bezier curve
        const dx = Math.max(40, Math.abs(tgtX - srcX) * 0.5);
        const c1x = srcX < tgtX ? srcX + dx : srcX - dx;
        const c2x = srcX < tgtX ? tgtX - dx : tgtX + dx;
        const d = `M ${srcX} ${srcY} C ${c1x} ${srcY}, ${c2x} ${tgtY}, ${tgtX} ${tgtY}`;

        // Create Path Element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'relation-path');
        path.dataset.relationId = rel.id;
        path.setAttribute('marker-end', 'url(#arrowhead)');

        if (this.state.selectedRelationshipId === rel.id) {
          path.classList.add('selected');
          path.setAttribute('marker-end', 'url(#arrowhead-active)');
        }

        path.addEventListener('click', (e) => {
          e.stopPropagation();
          this.state.select('relationship', rel.id);
        });

        // Cardinality Badge in the middle of curve
        const midX = (srcX + tgtX) / 2;
        const midY = (srcY + tgtY) / 2;
        const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badgeGroup.setAttribute('class', 'relation-cardinality-badge');
        badgeGroup.setAttribute('transform', `translate(${midX}, ${midY})`);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '-16');
        rect.setAttribute('y', '-9');
        rect.setAttribute('width', '32');
        rect.setAttribute('height', '18');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.textContent = rel.cardinality || '1:N';

        badgeGroup.appendChild(rect);
        badgeGroup.appendChild(text);

        badgeGroup.addEventListener('click', (e) => {
          e.stopPropagation();
          this.state.select('relationship', rel.id);
        });

        this.connectionsGroup.appendChild(path);
        this.connectionsGroup.appendChild(badgeGroup);
      });
    }

    // --- Minimap Render ---
    renderMinimap() {
      if (this.minimapContainer.classList.contains('hidden')) return;

      this.minimapTablesGroup.innerHTML = '';
      if (this.state.tables.length === 0) return;

      // Minimap viewport box is 200 x 130
      const mmWidth = 200;
      const mmHeight = 130;

      // Find bounding box encompassing canvas tables + current view
      let minX = -this.state.pan.x / this.state.zoom;
      let minY = -this.state.pan.y / this.state.zoom;
      let maxX = minX + this.viewportEl.offsetWidth / this.state.zoom;
      let maxY = minY + this.viewportEl.offsetHeight / this.state.zoom;

      this.state.tables.forEach(t => {
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + 260);
        maxY = Math.max(maxY, t.y + 180);
      });

      const spanX = Math.max(1200, (maxX - minX) * 1.1);
      const spanY = Math.max(800, (maxY - minY) * 1.1);

      const scaleX = mmWidth / spanX;
      const scaleY = mmHeight / spanY;
      const scale = Math.min(scaleX, scaleY);

      // Render miniature table rects
      this.state.tables.forEach(t => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const rx = (t.x - minX) * scale;
        const ry = (t.y - minY) * scale;
        const rw = 260 * scale;
        const rh = Math.max(40, (t.columns.length * 28 + 36)) * scale;

        rect.setAttribute('x', rx);
        rect.setAttribute('y', ry);
        rect.setAttribute('width', Math.max(12, rw));
        rect.setAttribute('height', Math.max(8, rh));
        rect.setAttribute('fill', t.color || '#3b82f6');
        rect.setAttribute('rx', '2');
        rect.setAttribute('opacity', '0.75');

        this.minimapTablesGroup.appendChild(rect);
      });

      // Viewport Rectangle
      const viewWorldX = -this.state.pan.x / this.state.zoom;
      const viewWorldY = -this.state.pan.y / this.state.zoom;
      const viewWorldW = this.viewportEl.offsetWidth / this.state.zoom;
      const viewWorldH = this.viewportEl.offsetHeight / this.state.zoom;

      const vx = (viewWorldX - minX) * scale;
      const vy = (viewWorldY - minY) * scale;
      const vw = viewWorldW * scale;
      const vh = viewWorldH * scale;

      this.minimapViewportRect.setAttribute('x', Math.max(0, vx));
      this.minimapViewportRect.setAttribute('y', Math.max(0, vy));
      this.minimapViewportRect.setAttribute('width', Math.min(mmWidth, vw));
      this.minimapViewportRect.setAttribute('height', Math.min(mmHeight, vh));
    }
  }

  // Expose on window
  window.SchemaCanvas = SchemaCanvas;

})(window);
