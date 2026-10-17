/**
 * SchemaCraft — Main Application Controller
 * Bootstraps the application, handles toolbar actions, modals, export/import, and UI events.
 */

(function (window) {
  'use strict';

  // Global Toast Notification Helper
  window.showToast = function (message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  };

  // Global Confirmation Modal Helper
  window.showConfirmModal = function (options = {}) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const warnBox = document.getElementById('confirmModalWarningBox');
    const actionBtn = document.getElementById('confirmActionBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    titleEl.textContent = options.title || 'Confirm Action';
    msgEl.textContent = options.message || 'Are you sure?';

    if (options.warningText) {
      warnBox.textContent = options.warningText;
      warnBox.classList.remove('hidden');
    } else {
      warnBox.classList.add('hidden');
    }

    actionBtn.textContent = options.confirmText || 'Confirm';
    actionBtn.className = options.danger ? 'btn btn-danger' : 'btn btn-primary';

    const cleanup = () => {
      modal.classList.add('hidden');
      actionBtn.onclick = null;
    };

    actionBtn.onclick = () => {
      cleanup();
      if (options.onConfirm) options.onConfirm();
    };

    cancelBtn.onclick = cleanup;
    modal.querySelectorAll('.modal-close-trigger').forEach(b => b.onclick = cleanup);

    modal.classList.remove('hidden');
  };

  class SchemaCraftApp {
    constructor() {
      // 1. Initialize State
      this.state = new window.SchemaState();
      this.tableManager = new window.TableManager(this.state);

      // 2. DOM Elements
      this.themeToggleBtn = document.getElementById('themeToggleBtn');
      this.toggleLeftSidebarBtn = document.getElementById('toggleLeftSidebarBtn');
      this.toggleRightPanelBtn = document.getElementById('toggleRightPanelBtn');
      this.leftSidebar = document.getElementById('leftSidebar');
      this.rightPanel = document.getElementById('rightPropertiesPanel');
      this.projectTitleInput = document.getElementById('projectTitleInput');
      this.saveStatusIndicator = document.getElementById('saveStatusIndicator');
      this.undoBtn = document.getElementById('undoBtn');
      this.redoBtn = document.getElementById('redoBtn');

      // Sidebar elements
      this.tableSearchInput = document.getElementById('tableSearchInput');
      this.clearSearchBtn = document.getElementById('clearSearchBtn');
      this.tablesListContainer = document.getElementById('tablesList');
      this.noTablesState = document.getElementById('noTablesState');
      this.tableCountBadge = document.getElementById('tableCountBadge');
      this.relCountBadge = document.getElementById('relCountBadge');
      this.relationshipsList = document.getElementById('relationshipsList');
      this.projectsList = document.getElementById('projectsList');

      // Modals & Export
      this.sqlExportModal = document.getElementById('sqlExportModal');
      this.sqlOutputCode = document.getElementById('sqlOutputCode');
      this.currentDialect = 'postgres';

      // Auto-save debounce timer
      this.autoSaveTimer = null;

      // 3. Initialize Subsystems
      this.propertiesPanel = new window.PropertiesPanel(this.state, this.tableManager);
      this.canvas = new window.SchemaCanvas(this.state, this.tableManager);

      // 4. Attach Event Handlers & Load Initial Project
      this.initTheme();
      this.initEventListeners();
      this.initSidebarTabs();
      this.initExportModal();
      this.initAddRelationModal();
      this.loadInitialProject();
    }

    // --- Theme Management ---
    initTheme() {
      const savedTheme = localStorage.getItem('schemacraft_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', savedTheme);

      this.themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('schemacraft_theme', nextTheme);
        window.showToast(`Switched to ${nextTheme} mode`, 'info', 1500);
      });
    }

    // --- Sidebar Tabs & Toggles ---
    initSidebarTabs() {
      const tabBtns = document.querySelectorAll('.sidebar-tabs .tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.left-sidebar .tab-content').forEach(c => c.classList.remove('active'));

          btn.classList.add('active');
          const target = document.getElementById(btn.dataset.tab);
          if (target) target.classList.add('active');

          if (btn.dataset.tab === 'projectsTab') {
            this.renderProjectsList();
          }
        });
      });

      // Toggle Sidebars
      this.toggleLeftSidebarBtn.addEventListener('click', () => {
        this.leftSidebar.classList.toggle('collapsed');
      });

      this.toggleRightPanelBtn.addEventListener('click', () => {
        this.rightPanel.classList.toggle('collapsed');
      });
    }

    // --- Main Event Listeners ---
    initEventListeners() {
      // History undo/redo updates
      this.state.bus.on('history:changed', ({ canUndo, canRedo }) => {
        this.undoBtn.disabled = !canUndo;
        this.redoBtn.disabled = !canRedo;
      });

      this.undoBtn.addEventListener('click', () => this.state.undo());
      this.redoBtn.addEventListener('click', () => this.state.redo());

      // Auto-save on state modification
      this.state.bus.on('state:modified', () => {
        this.triggerAutoSave();
        this.renderSidebarTablesList();
        this.renderSidebarRelationshipsList();
      });

      this.state.bus.on('schema:loaded', () => {
        this.projectTitleInput.value = this.state.projectName;
        this.renderSidebarTablesList();
        this.renderSidebarRelationshipsList();
      });

      // Project title edit
      this.projectTitleInput.addEventListener('change', () => {
        this.state.projectName = this.projectTitleInput.value.trim() || 'Untitled Schema';
        this.state.pushHistory();
        this.state.bus.emit('state:modified');
      });

      // Toolbar Add Table button
      document.getElementById('addTableToolbarBtn').addEventListener('click', () => {
        this.addNewTableCentered();
      });

      document.getElementById('quickAddTableBtn').addEventListener('click', () => {
        this.addNewTableCentered();
      });

      document.getElementById('emptyStateAddBtn').addEventListener('click', () => {
        this.addNewTableCentered();
      });

      // Toolbar Save Project Button
      document.getElementById('saveProjectBtn').addEventListener('click', () => {
        window.StorageManager.saveCurrent(this.state);
        window.showToast('Project saved successfully!', 'success');
      });

      // Search Tables
      this.tableSearchInput.addEventListener('input', () => {
        const query = this.tableSearchInput.value.trim();
        this.clearSearchBtn.classList.toggle('hidden', query === '');
        this.renderSidebarTablesList(query);
      });

      this.clearSearchBtn.addEventListener('click', () => {
        this.tableSearchInput.value = '';
        this.clearSearchBtn.classList.add('hidden');
        this.renderSidebarTablesList();
      });

      // New Blank Project Button
      document.getElementById('newProjectBtn').addEventListener('click', () => {
        window.showConfirmModal({
          title: 'Create Blank Project',
          message: 'Are you sure you want to start a new blank schema? Unsaved changes in the current project will be replaced.',
          confirmText: 'Create Blank',
          onConfirm: () => {
            this.state.reset('New Database Schema');
            window.showToast('Created new schema project', 'info');
          }
        });
      });

      // Starter Templates Preset Cards
      document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', () => {
          const templateKey = card.dataset.template;
          this.loadTemplate(templateKey);
        });
      });

      document.getElementById('templatesBtn').addEventListener('click', () => {
        // Switch to Projects/Templates tab in sidebar
        const projTabBtn = document.querySelector('.sidebar-tabs [data-tab="projectsTab"]');
        if (projTabBtn) projTabBtn.click();
        this.leftSidebar.classList.remove('collapsed');
      });

      // Dropdown menu toggle
      const exportMenuBtn = document.getElementById('exportMenuBtn');
      const exportDropdown = document.getElementById('exportDropdown');
      exportMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportDropdown.classList.toggle('open');
      });

      window.addEventListener('click', () => {
        exportDropdown.classList.remove('open');
      });

      // Export JSON
      document.getElementById('exportJsonBtn').addEventListener('click', () => {
        window.StorageManager.downloadJson(this.state);
        window.showToast('Exported schema as JSON', 'success');
      });

      // Import JSON
      const jsonFileInput = document.getElementById('jsonFileInput');
      document.getElementById('importJsonBtn').addEventListener('click', () => {
        jsonFileInput.click();
      });

      jsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            if (!data.tables || !Array.isArray(data.tables)) {
              throw new Error('Invalid SchemaCraft JSON format: missing tables array.');
            }
            this.state.loadState(data);
            window.StorageManager.saveCurrent(this.state);
            this.canvas.fitToScreen();
            window.showToast(`Imported "${this.state.projectName}" successfully!`, 'success');
          } catch (err) {
            window.showToast(`Import failed: ${err.message}`, 'error');
          }
          jsonFileInput.value = '';
        };
        reader.readAsText(file);
      });

      // Export SVG Diagram
      document.getElementById('exportSvgBtn').addEventListener('click', () => {
        this.exportDiagramSvg();
      });

      // Export PNG Diagram
      document.getElementById('exportPngBtn').addEventListener('click', () => {
        this.exportDiagramPng();
      });

      // Global Keyboard Shortcuts
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            this.state.redo();
          } else {
            this.state.undo();
          }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          this.state.redo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          window.StorageManager.saveCurrent(this.state);
          window.showToast('Project saved!', 'success');
        } else if (e.key.toLowerCase() === 'n' && !this.isEditingInput(e.target) && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.addNewTableCentered();
        } else if (e.key.toLowerCase() === 'f' && !this.isEditingInput(e.target)) {
          e.preventDefault();
          this.canvas.fitToScreen();
        }
      });
    }

    isEditingInput(target) {
      return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    }

    addNewTableCentered() {
      const rect = this.canvas.viewportEl.getBoundingClientRect();
      const worldCenter = this.canvas.screenToWorld(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      this.tableManager.createTable(null, worldCenter.x - 130, worldCenter.y - 100);
      window.showToast('New table created', 'info');
    }

    triggerAutoSave() {
      this.saveStatusIndicator.className = 'save-status saving';
      this.saveStatusIndicator.innerHTML = '<span class="dot"></span> Saving...';

      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        window.StorageManager.saveCurrent(this.state);
        this.saveStatusIndicator.className = 'save-status saved';
        this.saveStatusIndicator.innerHTML = '<span class="dot"></span> Saved';
      }, 1000);
    }

    loadInitialProject() {
      const saved = window.StorageManager.loadCurrent();
      if (saved && saved.tables && saved.tables.length > 0) {
        this.state.loadState(saved);
        setTimeout(() => this.canvas.fitToScreen(), 100);
      } else {
        // Load default E-Commerce starter schema
        this.loadTemplate('ecommerce', false);
      }
    }

    loadTemplate(templateKey, promptConfirm = true) {
      const template = window.StorageManager.getTemplate(templateKey);
      if (!template) return;

      const executeLoad = () => {
        this.state.loadState(template);
        window.StorageManager.saveCurrent(this.state);
        setTimeout(() => this.canvas.fitToScreen(), 100);
        window.showToast(`Loaded ${template.name}!`, 'success');
      };

      if (promptConfirm && this.state.tables.length > 0) {
        window.showConfirmModal({
          title: `Load ${template.name}?`,
          message: 'Loading this starter template will replace your current workspace schema. You can export your current schema as JSON first if you want to keep it.',
          confirmText: 'Load Template',
          onConfirm: executeLoad
        });
      } else {
        executeLoad();
      }
    }

    // --- Sidebar Tables List ---
    renderSidebarTablesList(searchQuery = '') {
      this.tablesListContainer.innerHTML = '';
      const filter = searchQuery.toLowerCase().trim();

      const matchingTables = this.state.tables.filter(t => {
        if (!filter) return true;
        if (t.name.toLowerCase().includes(filter)) return true;
        return t.columns.some(c => c.name.toLowerCase().includes(filter) || c.type.toLowerCase().includes(filter));
      });

      this.tableCountBadge.textContent = this.state.tables.length;

      if (this.state.tables.length === 0) {
        this.noTablesState.classList.remove('hidden');
        return;
      }
      this.noTablesState.classList.add('hidden');

      matchingTables.forEach(table => {
        const item = document.createElement('div');
        item.className = 'tree-table-item';
        if (this.state.selectedTableId === table.id) {
          item.classList.add('selected');
        }

        // Header
        const header = document.createElement('div');
        header.className = 'tree-table-header';
        header.innerHTML = `
          <div class="tree-table-title">
            <span class="table-color-dot" style="background-color: ${table.color || '#3b82f6'};"></span>
            <span>${table.name}</span>
          </div>
          <div class="tree-table-actions">
            <button class="btn-icon-xs quick-del-tbl" title="Delete Table">&times;</button>
          </div>
        `;

        header.addEventListener('click', (e) => {
          if (!e.target.closest('.quick-del-tbl')) {
            this.state.select('table', table.id);
            // Smoothly pan canvas to focus this table
            this.focusTableOnCanvas(table);
          }
        });

        header.querySelector('.quick-del-tbl').addEventListener('click', (e) => {
          e.stopPropagation();
          const warning = this.tableManager.getReferencesWarning(table.id);
          if (warning) {
            window.showConfirmModal({
              title: `Delete Table "${table.name}"?`,
              message: 'This table is referenced by relationships.',
              warningText: warning.detailsText,
              confirmText: 'Delete Anyway',
              danger: true,
              onConfirm: () => this.tableManager.deleteTable(table.id)
            });
          } else {
            this.tableManager.deleteTable(table.id);
          }
        });

        // Columns sub-list
        const colList = document.createElement('div');
        colList.className = 'tree-column-list';

        table.columns.forEach(col => {
          const colEl = document.createElement('div');
          colEl.className = 'tree-column-item';
          colEl.innerHTML = `
            <span class="col-name ${col.isPrimary ? 'is-pk' : ''}">
              ${col.isPrimary ? '★ ' : ''}${col.name}
            </span>
            <span class="col-type">${col.type}</span>
          `;
          colList.appendChild(colEl);
        });

        item.appendChild(header);
        item.appendChild(colList);
        this.tablesListContainer.appendChild(item);
      });
    }

    focusTableOnCanvas(table) {
      const rect = this.canvas.viewportEl.getBoundingClientRect();
      const targetWorldX = table.x + 130;
      const targetWorldY = table.y + 100;

      this.state.pan.x = rect.width / 2 - targetWorldX * this.state.zoom;
      this.state.pan.y = rect.height / 2 - targetWorldY * this.state.zoom;
      this.canvas.updateTransform();
    }

    // --- Sidebar Relationships List ---
    renderSidebarRelationshipsList() {
      this.relationshipsList.innerHTML = '';
      this.relCountBadge.textContent = this.state.relationships.length;

      if (this.state.relationships.length === 0) {
        this.relationshipsList.innerHTML = `<span class="empty-desc">No relationships created yet.</span>`;
        return;
      }

      this.state.relationships.forEach(rel => {
        const srcTable = this.state.getTable(rel.sourceTableId);
        const tgtTable = this.state.getTable(rel.targetTableId);
        const srcCol = srcTable ? srcTable.columns.find(c => c.id === rel.sourceColumnId) : null;
        const tgtCol = tgtTable ? tgtTable.columns.find(c => c.id === rel.targetColumnId) : null;

        const item = document.createElement('div');
        item.className = 'rel-list-item';
        if (this.state.selectedRelationshipId === rel.id) {
          item.classList.add('selected');
        }

        item.innerHTML = `
          <div class="rel-info-line">
            <span>${srcTable ? srcTable.name : '?'}.${srcCol ? srcCol.name : '?'}</span>
            <span>→</span>
            <span>${tgtTable ? tgtTable.name : '?'}.${tgtCol ? tgtCol.name : '?'}</span>
          </div>
          <span class="rel-cardinality-tag">${rel.cardinality || '1:N'}</span>
        `;

        item.addEventListener('click', () => {
          this.state.select('relationship', rel.id);
        });

        this.relationshipsList.appendChild(item);
      });
    }

    // --- Saved Projects List in Sidebar ---
    renderProjectsList() {
      this.projectsList.innerHTML = '';
      const list = window.StorageManager.getProjectsList();

      if (list.length === 0) {
        this.projectsList.innerHTML = `<span class="empty-desc">No saved projects yet.</span>`;
        return;
      }

      list.forEach(proj => {
        const card = document.createElement('div');
        card.className = 'project-card';
        if (proj.id === this.state.projectId) {
          card.classList.add('active');
        }

        const dateStr = new Date(proj.updatedAt).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        card.innerHTML = `
          <div>
            <div class="project-card-title">${proj.name}</div>
            <div class="project-card-date">${proj.tableCount} tables • ${dateStr}</div>
          </div>
          <button class="btn-icon-xs del-proj-btn" title="Delete Project">&times;</button>
        `;

        card.addEventListener('click', (e) => {
          if (!e.target.closest('.del-proj-btn')) {
            if (proj.id !== this.state.projectId) {
              const currentSaved = window.StorageManager.loadCurrent();
              if (currentSaved && currentSaved.id === proj.id) {
                this.state.loadState(currentSaved);
                this.canvas.fitToScreen();
                this.renderProjectsList();
              }
            }
          }
        });

        card.querySelector('.del-proj-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          window.StorageManager.deleteProject(proj.id);
          this.renderProjectsList();
          window.showToast(`Deleted "${proj.name}"`, 'info');
        });

        this.projectsList.appendChild(card);
      });
    }

    // --- SQL Export Modal ---
    initExportModal() {
      const openBtn = document.getElementById('exportSqlBtn');
      const closeBtns = this.sqlExportModal.querySelectorAll('.modal-close-trigger');
      const dialectTabs = document.querySelectorAll('.dialect-tab');
      const dropToggle = document.getElementById('sqlDropTablesToggle');
      const fkToggle = document.getElementById('sqlFkConstraintsToggle');
      const copyBtn = document.getElementById('copySqlBtn');
      const downloadBtn = document.getElementById('downloadSqlBtn');

      openBtn.addEventListener('click', () => {
        this.updateSqlPreview();
        this.sqlExportModal.classList.remove('hidden');
      });

      closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.sqlExportModal.classList.add('hidden');
        });
      });

      dialectTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          dialectTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.currentDialect = tab.dataset.dialect;
          this.updateSqlPreview();
        });
      });

      dropToggle.addEventListener('change', () => this.updateSqlPreview());
      fkToggle.addEventListener('change', () => this.updateSqlPreview());

      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(this.sqlOutputCode.textContent).then(() => {
          window.showToast('SQL copied to clipboard!', 'success');
        }).catch(() => {
          window.showToast('Failed to copy to clipboard', 'error');
        });
      });

      downloadBtn.addEventListener('click', () => {
        window.StorageManager.downloadSql(
          this.sqlOutputCode.textContent,
          this.state.projectName,
          this.currentDialect
        );
        window.showToast('Downloaded .sql file!', 'success');
      });
    }

    updateSqlPreview() {
      const dropTables = document.getElementById('sqlDropTablesToggle').checked;
      const foreignKeys = document.getElementById('sqlFkConstraintsToggle').checked;

      const sql = window.SqlGenerator.generate(
        {
          projectName: this.state.projectName,
          tables: this.state.tables,
          relationships: this.state.relationships
        },
        {
          dialect: this.currentDialect,
          dropTables,
          foreignKeys
        }
      );

      this.sqlOutputCode.textContent = sql;
    }

    // --- Add Relationship Modal ---
    initAddRelationModal() {
      const modal = document.getElementById('addRelationModal');
      const closeBtns = modal.querySelectorAll('.modal-close-trigger');
      const srcTableSel = document.getElementById('relModalSourceTable');
      const srcColSel = document.getElementById('relModalSourceColumn');
      const tgtTableSel = document.getElementById('relModalTargetTable');
      const tgtColSel = document.getElementById('relModalTargetColumn');
      const cardSel = document.getElementById('relModalCardinality');
      const onDeleteSel = document.getElementById('relModalOnDelete');
      const saveBtn = document.getElementById('saveRelationModalBtn');

      closeBtns.forEach(b => b.addEventListener('click', () => modal.classList.add('hidden')));

      const populateColumns = (tableSelect, colSelect) => {
        colSelect.innerHTML = '';
        const table = this.state.getTable(tableSelect.value);
        if (!table) return;
        table.columns.forEach(col => {
          const opt = document.createElement('option');
          opt.value = col.id;
          opt.textContent = `${col.name} (${col.type}${col.isPrimary ? ' - PK' : ''})`;
          colSelect.appendChild(opt);
        });
      };

      srcTableSel.addEventListener('change', () => populateColumns(srcTableSel, srcColSel));
      tgtTableSel.addEventListener('change', () => populateColumns(tgtTableSel, tgtColSel));

      window.openAddRelationModal = (defaultSourceTableId) => {
        if (this.state.tables.length < 2) {
          window.showToast('You need at least 2 tables to create a relationship.', 'warning');
          return;
        }

        srcTableSel.innerHTML = '';
        tgtTableSel.innerHTML = '';

        this.state.tables.forEach(t => {
          const opt1 = document.createElement('option');
          opt1.value = t.id;
          opt1.textContent = t.name;
          srcTableSel.appendChild(opt1);

          const opt2 = document.createElement('option');
          opt2.value = t.id;
          opt2.textContent = t.name;
          tgtTableSel.appendChild(opt2);
        });

        if (defaultSourceTableId) {
          srcTableSel.value = defaultSourceTableId;
          const otherTable = this.state.tables.find(t => t.id !== defaultSourceTableId);
          if (otherTable) tgtTableSel.value = otherTable.id;
        } else {
          if (this.state.tables.length > 1) {
            tgtTableSel.selectedIndex = 1;
          }
        }

        populateColumns(srcTableSel, srcColSel);
        populateColumns(tgtTableSel, tgtColSel);

        modal.classList.remove('hidden');
      };

      saveBtn.addEventListener('click', () => {
        const sourceTableId = srcTableSel.value;
        const sourceColumnId = srcColSel.value;
        const targetTableId = tgtTableSel.value;
        const targetColumnId = tgtColSel.value;

        if (sourceTableId === targetTableId && sourceColumnId === targetColumnId) {
          window.showToast('Cannot connect a column to itself.', 'warning');
          return;
        }

        const res = this.tableManager.addRelationship(
          sourceTableId,
          sourceColumnId,
          targetTableId,
          targetColumnId,
          {
            cardinality: cardSel.value,
            onDelete: onDeleteSel.value
          }
        );

        if (res.success) {
          modal.classList.add('hidden');
          window.showToast('Relationship connected!', 'success');
        } else {
          window.showToast(res.error, 'error');
        }
      });
    }

    // --- Diagram Visual Export: SVG ---
    exportDiagramSvg() {
      if (this.state.tables.length === 0) {
        window.showToast('Diagram is empty.', 'warning');
        return;
      }

      // Compute bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      this.state.tables.forEach(t => {
        const el = document.getElementById(`tableNode_${t.id}`);
        const w = el ? el.offsetWidth : 260;
        const h = el ? el.offsetHeight : 180;
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + w);
        maxY = Math.max(maxY, t.y + h);
      });

      const padding = 60;
      const width = maxX - minX + padding * 2;
      const height = maxY - minY + padding * 2;
      const offsetX = minX - padding;
      const offsetY = minY - padding;

      // Build standalone SVG
      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background: #0f1623; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;">\n`;
      svgContent += `<defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <polygon points="0 0, 8 4, 0 8" fill="#64748b" />
        </marker>
      </defs>\n`;

      // Render relationships
      this.state.relationships.forEach(rel => {
        const srcTable = this.state.getTable(rel.sourceTableId);
        const tgtTable = this.state.getTable(rel.targetTableId);
        if (!srcTable || !tgtTable) return;

        const srcNode = document.getElementById(`tableNode_${srcTable.id}`);
        const tgtNode = document.getElementById(`tableNode_${tgtTable.id}`);
        const srcRow = srcNode ? srcNode.querySelector(`[data-column-id="${rel.sourceColumnId}"]`) : null;
        const tgtRow = tgtNode ? tgtNode.querySelector(`[data-column-id="${rel.targetColumnId}"]`) : null;

        const srcW = srcNode ? srcNode.offsetWidth : 260;
        const tgtW = tgtNode ? tgtNode.offsetWidth : 260;

        let srcX = (srcTable.x + srcW < tgtTable.x ? srcTable.x + srcW : srcTable.x) - offsetX;
        let tgtX = (srcTable.x + srcW < tgtTable.x ? tgtTable.x : tgtTable.x + tgtW) - offsetX;
        let srcY = (srcTable.y + (srcRow ? srcRow.offsetTop + srcRow.offsetHeight / 2 : 40)) - offsetY;
        let tgtY = (tgtTable.y + (tgtRow ? tgtRow.offsetTop + tgtRow.offsetHeight / 2 : 40)) - offsetY;

        const dx = Math.max(40, Math.abs(tgtX - srcX) * 0.5);
        const c1x = srcX < tgtX ? srcX + dx : srcX - dx;
        const c2x = srcX < tgtX ? tgtX - dx : tgtX + dx;

        svgContent += `  <path d="M ${srcX} ${srcY} C ${c1x} ${srcY}, ${c2x} ${tgtY}, ${tgtX} ${tgtY}" fill="none" stroke="#64748b" stroke-width="2" marker-end="url(#arrowhead)" />\n`;
      });

      // Render tables
      this.state.tables.forEach(table => {
        const el = document.getElementById(`tableNode_${table.id}`);
        const w = el ? el.offsetWidth : 260;
        const h = el ? el.offsetHeight : (table.columns.length * 30 + 44);
        const tx = table.x - offsetX;
        const ty = table.y - offsetY;

        svgContent += `  <g transform="translate(${tx}, ${ty})">\n`;
        // Card bg & border
        svgContent += `    <rect width="${w}" height="${h}" rx="8" fill="#151d2f" stroke="#1e293b" stroke-width="1.5" />\n`;
        // Top accent line
        svgContent += `    <rect width="${w}" height="4" rx="2" fill="${table.color || '#3b82f6'}" />\n`;
        // Header bg
        svgContent += `    <rect y="4" width="${w}" height="32" fill="#1c273e" />\n`;
        // Table Name text
        svgContent += `    <text x="14" y="25" fill="#f1f5f9" font-size="13" font-weight="bold">${table.name}</text>\n`;

        // Columns
        table.columns.forEach((col, idx) => {
          const cy = 40 + idx * 28;
          svgContent += `    <line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="#1e293b" stroke-width="0.75" />\n`;
          const pkSymbol = col.isPrimary ? 'PK ' : '';
          svgContent += `    <text x="14" y="${cy + 18}" fill="${col.isPrimary ? '#3b82f6' : '#e2e8f0'}" font-size="11" font-weight="${col.isPrimary ? 'bold' : 'normal'}">${pkSymbol}${col.name}</text>\n`;
          svgContent += `    <text x="${w - 14}" y="${cy + 18}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">${col.type}</text>\n`;
        });

        svgContent += `  </g>\n`;
      });

      svgContent += `</svg>`;

      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const filename = `${(this.state.projectName || 'schema').replace(/\s+/g, '_').toLowerCase()}.svg`;
      window.StorageManager.triggerDownload(blob, filename);
      window.showToast('Exported diagram as SVG!', 'success');
    }

    // --- Diagram Visual Export: PNG ---
    exportDiagramPng() {
      if (this.state.tables.length === 0) {
        window.showToast('Diagram is empty.', 'warning');
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      this.state.tables.forEach(t => {
        const el = document.getElementById(`tableNode_${t.id}`);
        const w = el ? el.offsetWidth : 260;
        const h = el ? el.offsetHeight : 180;
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + w);
        maxY = Math.max(maxY, t.y + h);
      });

      const padding = 60;
      const width = maxX - minX + padding * 2;
      const height = maxY - minY + padding * 2;
      const offsetX = minX - padding;
      const offsetY = minY - padding;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = 2; // High-DPI export
      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = '#0f1623';
      ctx.fillRect(0, 0, width, height);

      // Subtle grid dots
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      for (let x = 20; x < width; x += 20) {
        for (let y = 20; y < height; y += 20) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Connectors
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#64748b';
      this.state.relationships.forEach(rel => {
        const srcTable = this.state.getTable(rel.sourceTableId);
        const tgtTable = this.state.getTable(rel.targetTableId);
        if (!srcTable || !tgtTable) return;

        const srcNode = document.getElementById(`tableNode_${srcTable.id}`);
        const tgtNode = document.getElementById(`tableNode_${tgtTable.id}`);
        const srcRow = srcNode ? srcNode.querySelector(`[data-column-id="${rel.sourceColumnId}"]`) : null;
        const tgtRow = tgtNode ? tgtNode.querySelector(`[data-column-id="${rel.targetColumnId}"]`) : null;

        const srcW = srcNode ? srcNode.offsetWidth : 260;
        const tgtW = tgtNode ? tgtNode.offsetWidth : 260;

        let srcX = (srcTable.x + srcW < tgtTable.x ? srcTable.x + srcW : srcTable.x) - offsetX;
        let tgtX = (srcTable.x + srcW < tgtTable.x ? tgtTable.x : tgtTable.x + tgtW) - offsetX;
        let srcY = (srcTable.y + (srcRow ? srcRow.offsetTop + srcRow.offsetHeight / 2 : 40)) - offsetY;
        let tgtY = (tgtTable.y + (tgtRow ? tgtRow.offsetTop + tgtRow.offsetHeight / 2 : 40)) - offsetY;

        const dx = Math.max(40, Math.abs(tgtX - srcX) * 0.5);
        const c1x = srcX < tgtX ? srcX + dx : srcX - dx;
        const c2x = srcX < tgtX ? tgtX - dx : tgtX + dx;

        ctx.beginPath();
        ctx.moveTo(srcX, srcY);
        ctx.bezierCurveTo(c1x, srcY, c2x, tgtY, tgtX, tgtY);
        ctx.stroke();

        // Arrow
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(tgtX, tgtY, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Tables
      this.state.tables.forEach(table => {
        const el = document.getElementById(`tableNode_${table.id}`);
        const w = el ? el.offsetWidth : 260;
        const h = el ? el.offsetHeight : (table.columns.length * 28 + 42);
        const tx = table.x - offsetX;
        const ty = table.y - offsetY;

        // Card bg
        ctx.fillStyle = '#151d2f';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
        this.roundRect(ctx, tx, ty, w, h, 8, true, true);

        // Header Top accent
        ctx.fillStyle = table.color || '#3b82f6';
        this.roundRect(ctx, tx, ty, w, 4, 2, true, false);

        // Header bg
        ctx.fillStyle = '#1c273e';
        ctx.fillRect(tx, ty + 4, w, 32);

        // Header text
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 13px -apple-system, sans-serif';
        ctx.fillText(table.name, tx + 14, ty + 24);

        // Columns
        table.columns.forEach((col, idx) => {
          const cy = ty + 38 + idx * 28;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.beginPath();
          ctx.moveTo(tx, cy);
          ctx.lineTo(tx + w, cy);
          ctx.stroke();

          // Col name
          ctx.fillStyle = col.isPrimary ? '#3b82f6' : '#e2e8f0';
          ctx.font = `${col.isPrimary ? 'bold' : 'normal'} 11px -apple-system, sans-serif`;
          ctx.fillText((col.isPrimary ? '★ ' : '') + col.name, tx + 14, cy + 18);

          // Col type
          ctx.fillStyle = '#94a3b8';
          ctx.font = '10px monospace';
          const typeW = ctx.measureText(col.type).width;
          ctx.fillText(col.type, tx + w - 14 - typeW, cy + 18);
        });
      });

      canvas.toBlob((blob) => {
        const filename = `${(this.state.projectName || 'schema').replace(/\s+/g, '_').toLowerCase()}.png`;
        window.StorageManager.triggerDownload(blob, filename);
        window.showToast('Exported diagram as PNG image!', 'success');
      });
    }

    roundRect(ctx, x, y, width, height, radius, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      if (fill) ctx.fill();
      if (stroke) ctx.stroke();
    }
  }

  // Bootstrap when DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    window.schemaCraftApp = new SchemaCraftApp();
  });

})(window);
