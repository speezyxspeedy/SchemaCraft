/**
 * SchemaCraft — State Management & Event Bus
 * Manages project data, history (undo/redo), and active selections.
 */

(function (window) {
  'use strict';

  // Event bus for component communication
  class EventEmitter {
    constructor() {
      this.events = {};
    }
    on(event, listener) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(listener);
      return () => this.off(event, listener);
    }
    off(event, listener) {
      if (!this.events[event]) return;
      this.events[event] = this.events[event].filter(l => l !== listener);
    }
    emit(event, data) {
      if (!this.events[event]) return;
      this.events[event].forEach(listener => {
        try {
          listener(data);
        } catch (err) {
          console.error(`Error in event listener for ${event}:`, err);
        }
      });
    }
  }

  // Generate unique IDs
  function generateId(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  }

  // Predefined pleasant color palette for table headers
  const TABLE_COLORS = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#8b5cf6', // Violet
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#6366f1', // Indigo
    '#14b8a6', // Teal
  ];

  const DATA_TYPES = [
    'INTEGER',
    'VARCHAR',
    'TEXT',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
    'DECIMAL',
    'FLOAT',
    'UUID'
  ];

  class SchemaState {
    constructor() {
      this.bus = new EventEmitter();

      // Project Meta
      this.projectId = generateId('proj');
      this.projectName = 'Untitled Schema';
      this.lastSaved = null;

      // Core Schema Data
      this.tables = [];         // Array of Table Objects
      this.relationships = [];  // Array of Relationship Objects

      // Selection State
      this.selectedTableId = null;
      this.selectedColumnId = null;
      this.selectedRelationshipId = null;

      // Canvas Transform State
      this.pan = { x: 80, y: 80 };
      this.zoom = 1.0;
      this.isSnapToGrid = true;
      this.gridSize = 20;

      // History for Undo / Redo
      this.undoStack = [];
      this.redoStack = [];
      this.maxHistory = 40;
      this.isBatching = false;
    }

    // Capture state for undo
    pushHistory() {
      if (this.isBatching) return;

      const snapshot = JSON.stringify({
        projectName: this.projectName,
        tables: this.tables,
        relationships: this.relationships
      });

      // Avoid consecutive duplicate states
      if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snapshot) {
        return;
      }

      this.undoStack.push(snapshot);
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }

      // Clear redo stack on new action
      this.redoStack = [];
      this.bus.emit('history:changed', { canUndo: this.canUndo(), canRedo: this.canRedo() });
      this.bus.emit('state:modified');
    }

    undo() {
      if (!this.canUndo()) return;

      const currentState = JSON.stringify({
        projectName: this.projectName,
        tables: this.tables,
        relationships: this.relationships
      });
      this.redoStack.push(currentState);

      const previousStateJson = this.undoStack.pop();
      const previousState = JSON.parse(previousStateJson);

      this.projectName = previousState.projectName;
      this.tables = previousState.tables;
      this.relationships = previousState.relationships;

      // Clear non-existent selections
      this.validateSelections();

      this.bus.emit('history:changed', { canUndo: this.canUndo(), canRedo: this.canRedo() });
      this.bus.emit('schema:loaded');
      this.bus.emit('state:modified');
    }

    redo() {
      if (!this.canRedo()) return;

      const currentState = JSON.stringify({
        projectName: this.projectName,
        tables: this.tables,
        relationships: this.relationships
      });
      this.undoStack.push(currentState);

      const nextStateJson = this.redoStack.pop();
      const nextState = JSON.parse(nextStateJson);

      this.projectName = nextState.projectName;
      this.tables = nextState.tables;
      this.relationships = nextState.relationships;

      this.validateSelections();

      this.bus.emit('history:changed', { canUndo: this.canUndo(), canRedo: this.canRedo() });
      this.bus.emit('schema:loaded');
      this.bus.emit('state:modified');
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    validateSelections() {
      if (this.selectedTableId && !this.getTable(this.selectedTableId)) {
        this.selectedTableId = null;
        this.selectedColumnId = null;
      }
      if (this.selectedRelationshipId && !this.getRelationship(this.selectedRelationshipId)) {
        this.selectedRelationshipId = null;
      }
    }

    // Set selection
    select(type, id, subId = null) {
      if (type === 'table') {
        this.selectedTableId = id;
        this.selectedColumnId = subId;
        this.selectedRelationshipId = null;
      } else if (type === 'relationship') {
        this.selectedTableId = null;
        this.selectedColumnId = null;
        this.selectedRelationshipId = id;
      } else {
        this.selectedTableId = null;
        this.selectedColumnId = null;
        this.selectedRelationshipId = null;
      }
      this.bus.emit('selection:changed', {
        type,
        tableId: this.selectedTableId,
        columnId: this.selectedColumnId,
        relationshipId: this.selectedRelationshipId
      });
    }

    // Lookup Helpers
    getTable(tableId) {
      return this.tables.find(t => t.id === tableId);
    }

    getTableByName(name) {
      const lower = name.trim().toLowerCase();
      return this.tables.find(t => t.name.toLowerCase() === lower);
    }

    getColumn(tableId, columnId) {
      const table = this.getTable(tableId);
      if (!table) return null;
      return table.columns.find(c => c.id === columnId);
    }

    getRelationship(relationshipId) {
      return this.relationships.find(r => r.id === relationshipId);
    }

    getRelationshipsForTable(tableId) {
      return this.relationships.filter(
        r => r.sourceTableId === tableId || r.targetTableId === tableId
      );
    }

    getRelationshipsForColumn(tableId, columnId) {
      return this.relationships.filter(
        r => (r.sourceTableId === tableId && r.sourceColumnId === columnId) ||
             (r.targetTableId === tableId && r.targetColumnId === columnId)
      );
    }

    // Reset whole schema
    reset(projectName = 'Untitled Schema') {
      this.projectId = generateId('proj');
      this.projectName = projectName;
      this.tables = [];
      this.relationships = [];
      this.selectedTableId = null;
      this.selectedColumnId = null;
      this.selectedRelationshipId = null;
      this.undoStack = [];
      this.redoStack = [];
      this.pan = { x: 80, y: 80 };
      this.zoom = 1.0;
      this.bus.emit('history:changed', { canUndo: false, canRedo: false });
      this.bus.emit('schema:loaded');
      this.bus.emit('state:modified');
    }

    // Load full state (e.g. from JSON or template)
    loadState(data) {
      this.projectId = data.id || generateId('proj');
      this.projectName = data.name || 'Imported Schema';
      this.tables = Array.isArray(data.tables) ? data.tables : [];
      this.relationships = Array.isArray(data.relationships) ? data.relationships : [];
      this.selectedTableId = null;
      this.selectedColumnId = null;
      this.selectedRelationshipId = null;
      this.undoStack = [];
      this.redoStack = [];
      this.bus.emit('history:changed', { canUndo: false, canRedo: false });
      this.bus.emit('schema:loaded');
      this.bus.emit('state:modified');
    }

    // Serialized Project JSON
    serialize() {
      return {
        id: this.projectId,
        name: this.projectName,
        createdAt: this.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tables: JSON.parse(JSON.stringify(this.tables)),
        relationships: JSON.parse(JSON.stringify(this.relationships))
      };
    }
  }

  // Expose on window
  window.SchemaState = SchemaState;
  window.SchemaConstants = {
    TABLE_COLORS,
    DATA_TYPES,
    generateId
  };

})(window);
