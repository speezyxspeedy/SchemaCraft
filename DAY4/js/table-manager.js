/**
 * SchemaCraft — Table & Column Manager
 * Handles business logic, validation, relationship integrity and modifications.
 */

(function (window) {
  'use strict';

  class TableManager {
    constructor(state) {
      this.state = state;
    }

    /**
     * Validate SQL identifier name
     */
    isValidIdentifier(name) {
      if (!name || typeof name !== 'string') return false;
      const trimmed = name.trim();
      return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed);
    }

    /**
     * Create a new table
     */
    createTable(customName = null, x = null, y = null) {
      let name = customName;
      if (!name) {
        let counter = 1;
        while (this.state.getTableByName(`table_${counter}`)) {
          counter++;
        }
        name = `table_${counter}`;
      }

      // Check duplicates
      if (this.state.getTableByName(name)) {
        return { success: false, error: `Table "${name}" already exists.` };
      }

      // Determine position if not provided
      if (x === null || y === null) {
        const offset = (this.state.tables.length % 5) * 50;
        x = 100 + offset;
        y = 100 + offset;
      }

      const colors = window.SchemaConstants.TABLE_COLORS;
      const color = colors[this.state.tables.length % colors.length];

      const newTable = {
        id: window.SchemaConstants.generateId('tbl'),
        name: name.trim().toLowerCase(),
        x: Math.round(x),
        y: Math.round(y),
        color: color,
        columns: [
          {
            id: window.SchemaConstants.generateId('col'),
            name: 'id',
            type: 'INTEGER',
            isPrimary: true,
            isNotNull: true,
            isUnique: true,
            defaultValue: ''
          }
        ]
      };

      this.state.pushHistory();
      this.state.tables.push(newTable);
      this.state.select('table', newTable.id);
      this.state.bus.emit('table:created', newTable);
      this.state.bus.emit('state:modified');

      return { success: true, table: newTable };
    }

    /**
     * Rename table
     */
    renameTable(tableId, newName) {
      const table = this.state.getTable(tableId);
      if (!table) return { success: false, error: 'Table not found' };

      const cleanName = (newName || '').trim().toLowerCase();
      if (!this.isValidIdentifier(cleanName)) {
        return {
          success: false,
          error: 'Invalid table name. Use letters, numbers, and underscores only.'
        };
      }

      const existing = this.state.getTableByName(cleanName);
      if (existing && existing.id !== tableId) {
        return { success: false, error: `A table named "${cleanName}" already exists.` };
      }

      if (table.name === cleanName) {
        return { success: true, table };
      }

      this.state.pushHistory();
      table.name = cleanName;
      this.state.bus.emit('table:updated', table);
      this.state.bus.emit('state:modified');
      return { success: true, table };
    }

    /**
     * Change table accent color
     */
    setTableColor(tableId, color) {
      const table = this.state.getTable(tableId);
      if (!table) return;
      this.state.pushHistory();
      table.color = color;
      this.state.bus.emit('table:updated', table);
      this.state.bus.emit('state:modified');
    }

    /**
     * Move table coordinates
     */
    moveTable(tableId, x, y) {
      const table = this.state.getTable(tableId);
      if (!table) return;

      if (this.state.isSnapToGrid) {
        const grid = this.state.gridSize;
        x = Math.round(x / grid) * grid;
        y = Math.round(y / grid) * grid;
      }

      table.x = x;
      table.y = y;
      this.state.bus.emit('table:moved', table);
      this.state.bus.emit('state:modified');
    }

    /**
     * Check cascade references before deleting table
     */
    getReferencesWarning(tableId) {
      const table = this.state.getTable(tableId);
      if (!table) return null;

      const incoming = this.state.relationships.filter(r => r.targetTableId === tableId);
      const outgoing = this.state.relationships.filter(r => r.sourceTableId === tableId);

      if (incoming.length === 0 && outgoing.length === 0) return null;

      const details = [];
      if (incoming.length > 0) {
        const fromTables = incoming.map(r => {
          const t = this.state.getTable(r.sourceTableId);
          return t ? t.name : 'unknown';
        });
        details.push(`Referenced as primary key by: ${[...new Set(fromTables)].join(', ')}`);
      }
      if (outgoing.length > 0) {
        const toTables = outgoing.map(r => {
          const t = this.state.getTable(r.targetTableId);
          return t ? t.name : 'unknown';
        });
        details.push(`Has foreign keys pointing to: ${[...new Set(toTables)].join(', ')}`);
      }

      return {
        table,
        incomingCount: incoming.length,
        outgoingCount: outgoing.length,
        totalRelations: incoming.length + outgoing.length,
        detailsText: details.join('\n')
      };
    }

    /**
     * Delete table and cascade remove related relationships
     */
    deleteTable(tableId) {
      const index = this.state.tables.findIndex(t => t.id === tableId);
      if (index === -1) return false;

      this.state.pushHistory();

      // Remove any relationships connecting this table
      this.state.relationships = this.state.relationships.filter(
        r => r.sourceTableId !== tableId && r.targetTableId !== tableId
      );

      const [deleted] = this.state.tables.splice(index, 1);

      if (this.state.selectedTableId === tableId) {
        this.state.select(null);
      }

      this.state.bus.emit('table:deleted', deleted);
      this.state.bus.emit('state:modified');
      return true;
    }

    /**
     * Add column to table
     */
    addColumn(tableId, colData = {}) {
      const table = this.state.getTable(tableId);
      if (!table) return null;

      let baseName = colData.name || 'column';
      let name = baseName;
      let counter = 1;
      while (table.columns.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        name = `${baseName}_${counter++}`;
      }

      const newColumn = {
        id: window.SchemaConstants.generateId('col'),
        name: name,
        type: colData.type || 'VARCHAR',
        isPrimary: !!colData.isPrimary,
        isNotNull: colData.isNotNull !== undefined ? colData.isNotNull : false,
        isUnique: !!colData.isUnique,
        defaultValue: colData.defaultValue || ''
      };

      this.state.pushHistory();
      table.columns.push(newColumn);
      this.state.bus.emit('table:updated', table);
      this.state.bus.emit('state:modified');

      return newColumn;
    }

    /**
     * Update column attributes
     */
    updateColumn(tableId, columnId, updates) {
      const table = this.state.getTable(tableId);
      if (!table) return { success: false, error: 'Table not found' };

      const col = table.columns.find(c => c.id === columnId);
      if (!col) return { success: false, error: 'Column not found' };

      if (updates.name !== undefined) {
        const clean = updates.name.trim().toLowerCase();
        if (!this.isValidIdentifier(clean)) {
          return { success: false, error: 'Invalid column identifier' };
        }
        const duplicate = table.columns.find(c => c.name.toLowerCase() === clean && c.id !== columnId);
        if (duplicate) {
          return { success: false, error: `Column "${clean}" already exists in table.` };
        }
        col.name = clean;
      }

      if (updates.type !== undefined) col.type = updates.type;
      if (updates.isPrimary !== undefined) {
        col.isPrimary = updates.isPrimary;
        if (col.isPrimary) {
          col.isNotNull = true;
        }
      }
      if (updates.isNotNull !== undefined) col.isNotNull = updates.isNotNull;
      if (updates.isUnique !== undefined) col.isUnique = updates.isUnique;
      if (updates.defaultValue !== undefined) col.defaultValue = updates.defaultValue;

      this.state.pushHistory();
      this.state.bus.emit('table:updated', table);
      this.state.bus.emit('state:modified');
      return { success: true, column: col };
    }

    /**
     * Delete column
     */
    deleteColumn(tableId, columnId) {
      const table = this.state.getTable(tableId);
      if (!table) return false;

      // Don't delete last column
      if (table.columns.length <= 1) {
        return false;
      }

      this.state.pushHistory();

      // Remove any relationships connecting this column
      this.state.relationships = this.state.relationships.filter(
        r => !(
          (r.sourceTableId === tableId && r.sourceColumnId === columnId) ||
          (r.targetTableId === tableId && r.targetColumnId === columnId)
        )
      );

      table.columns = table.columns.filter(c => c.id !== columnId);

      if (this.state.selectedColumnId === columnId) {
        this.state.selectedColumnId = null;
      }

      this.state.bus.emit('table:updated', table);
      this.state.bus.emit('state:modified');
      return true;
    }

    /**
     * Add relationship between two columns
     */
    addRelationship(sourceTableId, sourceColumnId, targetTableId, targetColumnId, options = {}) {
      // Validate tables
      const srcTable = this.state.getTable(sourceTableId);
      const tgtTable = this.state.getTable(targetTableId);
      if (!srcTable || !tgtTable) return { success: false, error: 'Invalid tables' };

      const srcCol = srcTable.columns.find(c => c.id === sourceColumnId);
      const tgtCol = tgtTable.columns.find(c => c.id === targetColumnId);
      if (!srcCol || !tgtCol) return { success: false, error: 'Invalid columns' };

      // Check if relationship already exists
      const existing = this.state.relationships.find(
        r => (r.sourceTableId === sourceTableId && r.sourceColumnId === sourceColumnId &&
              r.targetTableId === targetTableId && r.targetColumnId === targetColumnId) ||
             (r.sourceTableId === targetTableId && r.sourceColumnId === targetColumnId &&
              r.targetTableId === sourceTableId && r.targetColumnId === sourceColumnId)
      );
      if (existing) {
        return { success: false, error: 'Relationship already exists between these columns.' };
      }

      const newRel = {
        id: window.SchemaConstants.generateId('rel'),
        sourceTableId,
        sourceColumnId,
        targetTableId,
        targetColumnId,
        cardinality: options.cardinality || '1:N',
        onDelete: options.onDelete || 'CASCADE',
        onUpdate: options.onUpdate || 'CASCADE'
      };

      this.state.pushHistory();
      this.state.relationships.push(newRel);
      this.state.select('relationship', newRel.id);
      this.state.bus.emit('relationship:created', newRel);
      this.state.bus.emit('state:modified');

      return { success: true, relationship: newRel };
    }

    /**
     * Update relationship properties
     */
    updateRelationship(relId, updates) {
      const rel = this.state.getRelationship(relId);
      if (!rel) return false;

      this.state.pushHistory();
      if (updates.cardinality) rel.cardinality = updates.cardinality;
      if (updates.onDelete) rel.onDelete = updates.onDelete;
      if (updates.onUpdate) rel.onUpdate = updates.onUpdate;

      this.state.bus.emit('relationship:updated', rel);
      this.state.bus.emit('state:modified');
      return true;
    }

    /**
     * Delete relationship
     */
    deleteRelationship(relId) {
      const index = this.state.relationships.findIndex(r => r.id === relId);
      if (index === -1) return false;

      this.state.pushHistory();
      const [deleted] = this.state.relationships.splice(index, 1);

      if (this.state.selectedRelationshipId === relId) {
        this.state.select(null);
      }

      this.state.bus.emit('relationship:deleted', deleted);
      this.state.bus.emit('state:modified');
      return true;
    }
  }

  // Expose on window
  window.TableManager = TableManager;

})(window);
