/**
 * SchemaCraft — SQL DDL Generator
 * Generates clean, robust SQL for PostgreSQL, MySQL, and SQLite dialects.
 */

(function (window) {
  'use strict';

  // Dialect specific type mappings
  const TYPE_MAPPINGS = {
    postgres: {
      INTEGER: 'INTEGER',
      VARCHAR: 'VARCHAR(255)',
      TEXT: 'TEXT',
      BOOLEAN: 'BOOLEAN',
      DATE: 'DATE',
      TIMESTAMP: 'TIMESTAMP WITH TIME ZONE',
      DECIMAL: 'NUMERIC(12, 2)',
      FLOAT: 'DOUBLE PRECISION',
      UUID: 'UUID'
    },
    mysql: {
      INTEGER: 'INT',
      VARCHAR: 'VARCHAR(255)',
      TEXT: 'TEXT',
      BOOLEAN: 'TINYINT(1)',
      DATE: 'DATE',
      TIMESTAMP: 'DATETIME',
      DECIMAL: 'DECIMAL(12, 2)',
      FLOAT: 'DOUBLE',
      UUID: 'CHAR(36)'
    },
    sqlite: {
      INTEGER: 'INTEGER',
      VARCHAR: 'TEXT',
      TEXT: 'TEXT',
      BOOLEAN: 'INTEGER',
      DATE: 'TEXT',
      TIMESTAMP: 'TEXT',
      DECIMAL: 'NUMERIC',
      FLOAT: 'REAL',
      UUID: 'TEXT'
    }
  };

  class SqlGenerator {
    /**
     * Generate complete DDL script
     * @param {Object} schema - { tables, relationships, projectName }
     * @param {Object} options - { dialect: 'postgres'|'mysql'|'sqlite', dropTables: boolean, foreignKeys: boolean }
     */
    static generate(schema, options = {}) {
      const dialect = options.dialect || 'postgres';
      const dropTables = options.dropTables !== false;
      const includeFk = options.foreignKeys !== false;

      const lines = [];
      const timestamp = new Date().toISOString();

      lines.push(`-- =================================================================`);
      lines.push(`-- SchemaCraft DDL Export`);
      lines.push(`-- Project: ${schema.projectName || 'Database Schema'}`);
      lines.push(`-- Dialect: ${dialect.toUpperCase()}`);
      lines.push(`-- Generated: ${timestamp}`);
      lines.push(`-- =================================================================\n`);

      if (dialect === 'postgres') {
        lines.push(`-- PostgreSQL Extensions (if UUID is used)`);
        const usesUuid = schema.tables.some(t => t.columns.some(c => c.type === 'UUID'));
        if (usesUuid) {
          lines.push(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n`);
        }
      }

      if (dialect === 'mysql') {
        lines.push(`SET FOREIGN_KEY_CHECKS = 0;\n`);
      }

      // Drop tables section (reverse topological order or cascade)
      if (dropTables && schema.tables.length > 0) {
        lines.push(`-- -----------------------------------------------------------------`);
        lines.push(`-- Drop Existing Tables`);
        lines.push(`-- -----------------------------------------------------------------`);
        
        // Reverse order of tables
        const revTables = [...schema.tables].reverse();
        revTables.forEach(t => {
          const tableName = SqlGenerator.escapeIdentifier(t.name, dialect);
          if (dialect === 'postgres') {
            lines.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
          } else {
            lines.push(`DROP TABLE IF EXISTS ${tableName};`);
          }
        });
        lines.push('');
      }

      // Create Tables Section
      lines.push(`-- -----------------------------------------------------------------`);
      lines.push(`-- Create Tables`);
      lines.push(`-- -----------------------------------------------------------------`);

      schema.tables.forEach(table => {
        const tableDDL = SqlGenerator.generateTableDDL(table, schema, dialect, includeFk);
        lines.push(tableDDL);
        lines.push('');
      });

      // For Postgres / MySQL: Add Foreign Key constraints at end via ALTER TABLE if not embedded inline
      if (includeFk && dialect !== 'sqlite') {
        const alterFkLines = SqlGenerator.generateAlterTableForeignKeys(schema, dialect);
        if (alterFkLines.length > 0) {
          lines.push(`-- -----------------------------------------------------------------`);
          lines.push(`-- Foreign Key Constraints`);
          lines.push(`-- -----------------------------------------------------------------`);
          lines.push(...alterFkLines);
          lines.push('');
        }
      }

      if (dialect === 'mysql') {
        lines.push(`SET FOREIGN_KEY_CHECKS = 1;`);
      }

      return lines.join('\n');
    }

    /**
     * Escape identifier based on SQL dialect
     */
    static escapeIdentifier(name, dialect) {
      const cleanName = (name || 'unnamed').trim().replace(/[^a-zA-Z0-9_]/g, '_');
      if (dialect === 'mysql') return `\`${cleanName}\``;
      if (dialect === 'postgres') return `"${cleanName}"`;
      return `"${cleanName}"`;
    }

    /**
     * Format a column definition
     */
    static formatColumn(col, dialect) {
      const colName = SqlGenerator.escapeIdentifier(col.name, dialect);
      let colType = TYPE_MAPPINGS[dialect][col.type] || col.type || 'VARCHAR(255)';

      // Auto-increment / default for primary key in PostgreSQL/MySQL/SQLite
      if (col.isPrimary) {
        if (col.type === 'INTEGER') {
          if (dialect === 'postgres') colType = 'SERIAL';
          if (dialect === 'sqlite') colType = 'INTEGER PRIMARY KEY AUTOINCREMENT';
        } else if (col.type === 'UUID' && dialect === 'postgres') {
          if (!col.defaultValue) {
            col.defaultValue = 'uuid_generate_v4()';
          }
        }
      }

      let def = `${colName} ${colType}`;

      // Not Null (except when primary key already implies it)
      if (col.isNotNull && !(col.isPrimary && dialect === 'sqlite')) {
        def += ' NOT NULL';
      }

      // Unique (if single column unique and not primary)
      if (col.isUnique && !col.isPrimary) {
        def += ' UNIQUE';
      }

      // Default value
      if (col.defaultValue && col.defaultValue.trim() !== '') {
        const defaultVal = col.defaultValue.trim();
        // Check if string literal, numeric, or SQL function
        if (/^current_timestamp|now\(\)|uuid_generate_v4\(\)|true|false|\d+(\.\d+)?$/i.test(defaultVal)) {
          def += ` DEFAULT ${defaultVal}`;
        } else if (!defaultVal.startsWith("'") && isNaN(Number(defaultVal))) {
          def += ` DEFAULT '${defaultVal}'`;
        } else {
          def += ` DEFAULT ${defaultVal}`;
        }
      }

      return def;
    }

    /**
     * Generate CREATE TABLE statement
     */
    static generateTableDDL(table, schema, dialect, includeFk) {
      const tableName = SqlGenerator.escapeIdentifier(table.name, dialect);
      const parts = [];

      // Primary keys list
      const pkColumns = table.columns.filter(c => c.isPrimary);

      table.columns.forEach(col => {
        // In SQLite, if single INTEGER PRIMARY KEY AUTOINCREMENT, PK is defined in column
        if (dialect === 'sqlite' && col.isPrimary && col.type === 'INTEGER' && pkColumns.length === 1) {
          parts.push(`  ${SqlGenerator.formatColumn(col, dialect)}`);
        } else {
          parts.push(`  ${SqlGenerator.formatColumn(col, dialect)}`);
        }
      });

      // Primary Key Constraint (if composite or not already handled in SQLite inline)
      if (pkColumns.length > 0) {
        const isSqliteAutoInc = dialect === 'sqlite' && pkColumns.length === 1 && pkColumns[0].type === 'INTEGER';
        if (!isSqliteAutoInc) {
          const pkColsList = pkColumns.map(c => SqlGenerator.escapeIdentifier(c.name, dialect)).join(', ');
          const pkConstraintName = SqlGenerator.escapeIdentifier(`pk_${table.name}`, dialect);
          if (dialect === 'postgres' || dialect === 'mysql') {
            parts.push(`  CONSTRAINT ${pkConstraintName} PRIMARY KEY (${pkColsList})`);
          } else {
            parts.push(`  PRIMARY KEY (${pkColsList})`);
          }
        }
      }

      // In SQLite, foreign keys MUST be defined inside CREATE TABLE
      if (dialect === 'sqlite' && includeFk) {
        const tableFks = schema.relationships.filter(r => r.sourceTableId === table.id);
        tableFks.forEach(rel => {
          const srcCol = table.columns.find(c => c.id === rel.sourceColumnId);
          const tgtTable = schema.tables.find(t => t.id === rel.targetTableId);
          if (srcCol && tgtTable) {
            const tgtCol = tgtTable.columns.find(c => c.id === rel.targetColumnId);
            if (tgtCol) {
              const srcColEsc = SqlGenerator.escapeIdentifier(srcCol.name, dialect);
              const tgtTableEsc = SqlGenerator.escapeIdentifier(tgtTable.name, dialect);
              const tgtColEsc = SqlGenerator.escapeIdentifier(tgtCol.name, dialect);
              const onDelete = rel.onDelete ? ` ON DELETE ${rel.onDelete}` : '';
              const onUpdate = rel.onUpdate ? ` ON UPDATE ${rel.onUpdate}` : '';
              parts.push(`  FOREIGN KEY (${srcColEsc}) REFERENCES ${tgtTableEsc} (${tgtColEsc})${onDelete}${onUpdate}`);
            }
          }
        });
      }

      let ddl = `CREATE TABLE ${tableName} (\n${parts.join(',\n')}\n)`;

      if (dialect === 'mysql') {
        ddl += ` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
      } else {
        ddl += `;`;
      }

      return ddl;
    }

    /**
     * Generate ALTER TABLE ADD CONSTRAINT for PostgreSQL and MySQL
     */
    static generateAlterTableForeignKeys(schema, dialect) {
      const lines = [];

      schema.relationships.forEach(rel => {
        const srcTable = schema.tables.find(t => t.id === rel.sourceTableId);
        const tgtTable = schema.tables.find(t => t.id === rel.targetTableId);
        if (!srcTable || !tgtTable) return;

        const srcCol = srcTable.columns.find(c => c.id === rel.sourceColumnId);
        const tgtCol = tgtTable.columns.find(c => c.id === rel.targetColumnId);
        if (!srcCol || !tgtCol) return;

        const srcTableEsc = SqlGenerator.escapeIdentifier(srcTable.name, dialect);
        const srcColEsc = SqlGenerator.escapeIdentifier(srcCol.name, dialect);
        const tgtTableEsc = SqlGenerator.escapeIdentifier(tgtTable.name, dialect);
        const tgtColEsc = SqlGenerator.escapeIdentifier(tgtCol.name, dialect);

        const constraintName = SqlGenerator.escapeIdentifier(
          `fk_${srcTable.name}_${srcCol.name}_${tgtTable.name}`,
          dialect
        );

        const onDelete = rel.onDelete ? ` ON DELETE ${rel.onDelete}` : ' ON DELETE CASCADE';
        const onUpdate = rel.onUpdate ? ` ON UPDATE ${rel.onUpdate}` : ' ON UPDATE CASCADE';

        lines.push(
          `ALTER TABLE ${srcTableEsc} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${srcColEsc}) REFERENCES ${tgtTableEsc} (${tgtColEsc})${onDelete}${onUpdate};`
        );
      });

      return lines;
    }
  }

  // Expose on window
  window.SqlGenerator = SqlGenerator;

})(window);
