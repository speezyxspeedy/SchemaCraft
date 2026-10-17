/**
 * SchemaCraft — Properties Panel Inspector
 * Handles inspecting and editing selected tables, columns, and relationships.
 */

(function (window) {
  'use strict';

  class PropertiesPanel {
    constructor(state, tableManager) {
      this.state = state;
      this.tableManager = tableManager;

      // DOM Elements
      this.panelEl = document.getElementById('rightPropertiesPanel');
      this.panelModeBadge = document.getElementById('panelModeBadge');
      this.panelTitle = document.getElementById('panelTitle');
      this.tableInspectorContent = document.getElementById('tableInspectorContent');
      this.relationshipInspectorContent = document.getElementById('relationshipInspectorContent');
      this.noSelectionContent = document.getElementById('noSelectionContent');

      // Table controls
      this.tableNameInput = document.getElementById('propTableName');
      this.tableNameError = document.getElementById('tableNameError');
      this.colorPickerContainer = document.getElementById('colorSwatchPicker');
      this.columnCountBadge = document.getElementById('propColumnCount');
      this.columnsEditorBody = document.getElementById('columnsEditorBody');
      this.addColumnBtn = document.getElementById('addColumnBtn');
      this.deleteTableBtn = document.getElementById('deleteTableBtn');
      this.addRelationBtn = document.getElementById('addRelationBtn');
      this.connectedRelationsList = document.getElementById('tableConnectedRelationsList');

      // Column details box
      this.activeColDetailsBox = document.getElementById('activeColumnDetailsBox');
      this.activeColTitle = document.getElementById('activeColTitle');
      this.activeColTypeBadge = document.getElementById('activeColTypeBadge');
      this.colDefaultInput = document.getElementById('colDefaultInput');
      this.colPkCheckbox = document.getElementById('colPkCheckbox');
      this.colNnCheckbox = document.getElementById('colNnCheckbox');
      this.colUqCheckbox = document.getElementById('colUqCheckbox');

      // Relationship controls
      this.relSourceInfo = document.getElementById('relSourceInfo');
      this.relTargetInfo = document.getElementById('relTargetInfo');
      this.relCardinalitySelect = document.getElementById('relCardinalitySelect');
      this.relOnDeleteSelect = document.getElementById('relOnDeleteSelect');
      this.relOnUpdateSelect = document.getElementById('relOnUpdateSelect');
      this.deleteRelationBtn = document.getElementById('deleteRelationBtn');

      this.initEventListeners();
      this.renderColorSwatches();
    }

    initEventListeners() {
      // Listen to selection changes
      this.state.bus.on('selection:changed', () => this.render());
      this.state.bus.on('table:updated', (table) => {
        if (this.state.selectedTableId === table.id) {
          this.render();
        }
      });
      this.state.bus.on('relationship:updated', (rel) => {
        if (this.state.selectedRelationshipId === rel.id) {
          this.render();
        }
      });

      // Table name editing
      this.tableNameInput.addEventListener('input', () => {
        this.tableNameError.textContent = '';
      });
      this.tableNameInput.addEventListener('change', () => {
        if (!this.state.selectedTableId) return;
        const res = this.tableManager.renameTable(this.state.selectedTableId, this.tableNameInput.value);
        if (!res.success) {
          this.tableNameError.textContent = res.error;
          const current = this.state.getTable(this.state.selectedTableId);
          if (current) this.tableNameInput.value = current.name;
        }
      });

      // Add column
      this.addColumnBtn.addEventListener('click', () => {
        if (!this.state.selectedTableId) return;
        const newCol = this.tableManager.addColumn(this.state.selectedTableId);
        if (newCol) {
          this.state.selectedColumnId = newCol.id;
          this.render();
        }
      });

      // Column sub-settings inputs
      this.colDefaultInput.addEventListener('change', () => {
        if (!this.state.selectedTableId || !this.state.selectedColumnId) return;
        this.tableManager.updateColumn(
          this.state.selectedTableId,
          this.state.selectedColumnId,
          { defaultValue: this.colDefaultInput.value }
        );
      });

      this.colPkCheckbox.addEventListener('change', () => {
        if (!this.state.selectedTableId || !this.state.selectedColumnId) return;
        this.tableManager.updateColumn(
          this.state.selectedTableId,
          this.state.selectedColumnId,
          { isPrimary: this.colPkCheckbox.checked }
        );
        this.render();
      });

      this.colNnCheckbox.addEventListener('change', () => {
        if (!this.state.selectedTableId || !this.state.selectedColumnId) return;
        this.tableManager.updateColumn(
          this.state.selectedTableId,
          this.state.selectedColumnId,
          { isNotNull: this.colNnCheckbox.checked }
        );
      });

      this.colUqCheckbox.addEventListener('change', () => {
        if (!this.state.selectedTableId || !this.state.selectedColumnId) return;
        this.tableManager.updateColumn(
          this.state.selectedTableId,
          this.state.selectedColumnId,
          { isUnique: this.colUqCheckbox.checked }
        );
      });

      // Delete table button with confirmation warning
      this.deleteTableBtn.addEventListener('click', () => {
        if (!this.state.selectedTableId) return;
        const tableId = this.state.selectedTableId;
        const table = this.state.getTable(tableId);
        if (!table) return;

        const warning = this.tableManager.getReferencesWarning(tableId);
        if (warning) {
          window.showConfirmModal({
            title: `Delete Table "${table.name}"?`,
            message: `This table is currently part of active relationships. Deleting it will also remove all connected foreign keys!`,
            warningText: warning.detailsText,
            confirmText: 'Delete Anyway',
            danger: true,
            onConfirm: () => {
              this.tableManager.deleteTable(tableId);
              window.showToast(`Table "${table.name}" deleted`, 'warning');
            }
          });
        } else {
          window.showConfirmModal({
            title: `Delete Table "${table.name}"?`,
            message: `Are you sure you want to delete this table and all its columns? This action can be undone with Ctrl+Z.`,
            confirmText: 'Delete Table',
            danger: true,
            onConfirm: () => {
              this.tableManager.deleteTable(tableId);
              window.showToast(`Table "${table.name}" deleted`, 'info');
            }
          });
        }
      });

      // Add relation button opens relation modal
      this.addRelationBtn.addEventListener('click', () => {
        if (!this.state.selectedTableId) return;
        window.openAddRelationModal(this.state.selectedTableId);
      });

      // Relationship options
      this.relCardinalitySelect.addEventListener('change', () => {
        if (!this.state.selectedRelationshipId) return;
        this.tableManager.updateRelationship(this.state.selectedRelationshipId, {
          cardinality: this.relCardinalitySelect.value
        });
      });

      this.relOnDeleteSelect.addEventListener('change', () => {
        if (!this.state.selectedRelationshipId) return;
        this.tableManager.updateRelationship(this.state.selectedRelationshipId, {
          onDelete: this.relOnDeleteSelect.value
        });
      });

      this.relOnUpdateSelect.addEventListener('change', () => {
        if (!this.state.selectedRelationshipId) return;
        this.tableManager.updateRelationship(this.state.selectedRelationshipId, {
          onUpdate: this.relOnUpdateSelect.value
        });
      });

      this.deleteRelationBtn.addEventListener('click', () => {
        if (!this.state.selectedRelationshipId) return;
        this.tableManager.deleteRelationship(this.state.selectedRelationshipId);
        window.showToast('Relationship deleted', 'info');
      });

      // Close panel button
      document.getElementById('closePropertiesBtn').addEventListener('click', () => {
        this.state.select(null);
      });
    }

    renderColorSwatches() {
      this.colorPickerContainer.innerHTML = '';
      window.SchemaConstants.TABLE_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        swatch.addEventListener('click', () => {
          if (!this.state.selectedTableId) return;
          this.tableManager.setTableColor(this.state.selectedTableId, color);
          this.updateActiveColorSwatch(color);
        });
        this.colorPickerContainer.appendChild(swatch);
      });
    }

    updateActiveColorSwatch(activeColor) {
      const swatches = this.colorPickerContainer.querySelectorAll('.color-swatch');
      swatches.forEach(s => {
        s.classList.toggle('active', s.dataset.color.toLowerCase() === (activeColor || '').toLowerCase());
      });
    }

    render() {
      // 1. If table is selected
      if (this.state.selectedTableId) {
        const table = this.state.getTable(this.state.selectedTableId);
        if (!table) {
          this.renderNoSelection();
          return;
        }

        this.panelModeBadge.textContent = 'TABLE';
        this.panelModeBadge.className = 'badge badge-primary';
        this.panelTitle.textContent = table.name;

        this.tableInspectorContent.classList.remove('hidden');
        this.relationshipInspectorContent.classList.add('hidden');
        this.noSelectionContent.classList.add('hidden');

        this.tableNameInput.value = table.name;
        this.tableNameError.textContent = '';
        this.columnCountBadge.textContent = table.columns.length;
        this.updateActiveColorSwatch(table.color);

        this.renderColumnsTable(table);
        this.renderConnectedRelations(table);
        return;
      }

      // 2. If relationship is selected
      if (this.state.selectedRelationshipId) {
        const rel = this.state.getRelationship(this.state.selectedRelationshipId);
        if (!rel) {
          this.renderNoSelection();
          return;
        }

        const srcTable = this.state.getTable(rel.sourceTableId);
        const tgtTable = this.state.getTable(rel.targetTableId);
        const srcCol = srcTable ? srcTable.columns.find(c => c.id === rel.sourceColumnId) : null;
        const tgtCol = tgtTable ? tgtTable.columns.find(c => c.id === rel.targetColumnId) : null;

        this.panelModeBadge.textContent = 'RELATION';
        this.panelModeBadge.className = 'badge badge-subtle';
        this.panelTitle.textContent = `${srcTable ? srcTable.name : '?'}.${srcCol ? srcCol.name : '?'} → ${tgtTable ? tgtTable.name : '?'}.${tgtCol ? tgtCol.name : '?'}`;

        this.tableInspectorContent.classList.add('hidden');
        this.relationshipInspectorContent.classList.remove('hidden');
        this.noSelectionContent.classList.add('hidden');

        this.relSourceInfo.textContent = `${srcTable ? srcTable.name : '?'}.${srcCol ? srcCol.name : '?'}`;
        this.relTargetInfo.textContent = `${tgtTable ? tgtTable.name : '?'}.${tgtCol ? tgtCol.name : '?'}`;
        this.relCardinalitySelect.value = rel.cardinality || '1:N';
        this.relOnDeleteSelect.value = rel.onDelete || 'CASCADE';
        this.relOnUpdateSelect.value = rel.onUpdate || 'CASCADE';
        return;
      }

      // 3. No selection
      this.renderNoSelection();
    }

    renderNoSelection() {
      this.panelModeBadge.textContent = 'INSPECTOR';
      this.panelModeBadge.className = 'badge badge-subtle';
      this.panelTitle.textContent = 'Inspector';
      this.tableInspectorContent.classList.add('hidden');
      this.relationshipInspectorContent.classList.add('hidden');
      this.noSelectionContent.classList.remove('hidden');
    }

    renderColumnsTable(table) {
      this.columnsEditorBody.innerHTML = '';

      table.columns.forEach(col => {
        const tr = document.createElement('tr');
        if (this.state.selectedColumnId === col.id) {
          tr.classList.add('active-row');
        }

        // PK Checkbox
        const tdPk = document.createElement('td');
        tdPk.className = 'col-checkbox-cell';
        const pkInput = document.createElement('input');
        pkInput.type = 'checkbox';
        pkInput.checked = col.isPrimary;
        pkInput.title = 'Primary Key';
        pkInput.addEventListener('change', () => {
          this.tableManager.updateColumn(table.id, col.id, { isPrimary: pkInput.checked });
          this.render();
        });
        tdPk.appendChild(pkInput);

        // Name input
        const tdName = document.createElement('td');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'col-table-input';
        nameInput.value = col.name;
        nameInput.spellcheck = false;
        nameInput.addEventListener('change', () => {
          const res = this.tableManager.updateColumn(table.id, col.id, { name: nameInput.value });
          if (!res.success) {
            nameInput.value = col.name;
            window.showToast(res.error, 'error');
          }
        });
        tdName.appendChild(nameInput);

        // Type select
        const tdType = document.createElement('td');
        const typeSelect = document.createElement('select');
        typeSelect.className = 'col-table-select';
        window.SchemaConstants.DATA_TYPES.forEach(dt => {
          const opt = document.createElement('option');
          opt.value = dt;
          opt.textContent = dt;
          if (dt === col.type) opt.selected = true;
          typeSelect.appendChild(opt);
        });
        typeSelect.addEventListener('change', () => {
          this.tableManager.updateColumn(table.id, col.id, { type: typeSelect.value });
          this.render();
        });
        tdType.appendChild(typeSelect);

        // Not Null Checkbox
        const tdNn = document.createElement('td');
        tdNn.className = 'col-checkbox-cell';
        const nnInput = document.createElement('input');
        nnInput.type = 'checkbox';
        nnInput.checked = col.isNotNull;
        nnInput.title = 'Not Null';
        nnInput.addEventListener('change', () => {
          this.tableManager.updateColumn(table.id, col.id, { isNotNull: nnInput.checked });
        });
        tdNn.appendChild(nnInput);

        // Unique Checkbox
        const tdUq = document.createElement('td');
        tdUq.className = 'col-checkbox-cell';
        const uqInput = document.createElement('input');
        uqInput.type = 'checkbox';
        uqInput.checked = col.isUnique;
        uqInput.title = 'Unique';
        uqInput.addEventListener('change', () => {
          this.tableManager.updateColumn(table.id, col.id, { isUnique: uqInput.checked });
        });
        tdUq.appendChild(uqInput);

        // Delete Column Button
        const tdActions = document.createElement('td');
        if (table.columns.length > 1) {
          const delBtn = document.createElement('button');
          delBtn.className = 'btn-icon-xs';
          delBtn.innerHTML = '&times;';
          delBtn.title = 'Delete Column';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.tableManager.deleteColumn(table.id, col.id);
            this.render();
          });
          tdActions.appendChild(delBtn);
        }

        // Row Click: select column for active details box
        tr.addEventListener('click', (e) => {
          if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
            this.state.selectedColumnId = col.id;
            this.render();
          }
        });

        tr.appendChild(tdPk);
        tr.appendChild(tdName);
        tr.appendChild(tdType);
        tr.appendChild(tdNn);
        tr.appendChild(tdUq);
        tr.appendChild(tdActions);

        this.columnsEditorBody.appendChild(tr);
      });

      // Update Column Details Box
      const activeCol = table.columns.find(c => c.id === this.state.selectedColumnId) || table.columns[0];
      if (activeCol) {
        this.activeColDetailsBox.classList.remove('hidden');
        this.activeColTitle.textContent = `${table.name}.${activeCol.name}`;
        this.activeColTypeBadge.textContent = activeCol.type;
        this.colDefaultInput.value = activeCol.defaultValue || '';
        this.colPkCheckbox.checked = !!activeCol.isPrimary;
        this.colNnCheckbox.checked = !!activeCol.isNotNull;
        this.colUqCheckbox.checked = !!activeCol.isUnique;
      } else {
        this.activeColDetailsBox.classList.add('hidden');
      }
    }

    renderConnectedRelations(table) {
      this.connectedRelationsList.innerHTML = '';
      const relations = this.state.getRelationshipsForTable(table.id);

      if (relations.length === 0) {
        this.connectedRelationsList.innerHTML = `<span class="empty-desc">No relations connected yet.</span>`;
        return;
      }

      relations.forEach(rel => {
        const isSource = rel.sourceTableId === table.id;
        const otherTableId = isSource ? rel.targetTableId : rel.sourceTableId;
        const otherTable = this.state.getTable(otherTableId);
        const myCol = table.columns.find(c => c.id === (isSource ? rel.sourceColumnId : rel.targetColumnId));
        const otherCol = otherTable ? otherTable.columns.find(c => c.id === (isSource ? rel.targetColumnId : rel.sourceColumnId)) : null;

        const item = document.createElement('div');
        item.className = 'table-rel-badge-item';
        item.innerHTML = `
          <span>
            <b>${myCol ? myCol.name : '?'}</b> 
            ${isSource ? '→ FK to' : '← Referenced by'} 
            <b>${otherTable ? otherTable.name : '?'}.${otherCol ? otherCol.name : '?'}</b>
            <span class="rel-cardinality-tag">${rel.cardinality || '1:N'}</span>
          </span>
          <button class="btn-icon-xs delete-rel-btn" title="Delete Relation">&times;</button>
        `;

        item.addEventListener('click', (e) => {
          if (!e.target.closest('.delete-rel-btn')) {
            this.state.select('relationship', rel.id);
          }
        });

        item.querySelector('.delete-rel-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this.tableManager.deleteRelationship(rel.id);
          this.render();
        });

        this.connectedRelationsList.appendChild(item);
      });
    }
  }

  // Expose on window
  window.PropertiesPanel = PropertiesPanel;

})(window);
