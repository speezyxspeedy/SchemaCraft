/**
 * SchemaCraft — Storage Manager, File Importer/Exporter & Starter Templates
 */

(function (window) {
  'use strict';

  const STORAGE_KEY_CURRENT = 'schemacraft_current_state';
  const STORAGE_KEY_PROJECTS = 'schemacraft_project_index';

  // Starter Schema Templates
  const TEMPLATES = {
    ecommerce: {
      name: 'E-Commerce & Orders Schema',
      tables: [
        {
          id: 'tbl_users',
          name: 'users',
          x: 60,
          y: 70,
          color: '#3b82f6',
          columns: [
            { id: 'col_u1', name: 'id', type: 'UUID', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: 'uuid_generate_v4()' },
            { id: 'col_u2', name: 'email', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_u3', name: 'full_name', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_u4', name: 'is_active', type: 'BOOLEAN', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: 'true' },
            { id: 'col_u5', name: 'created_at', type: 'TIMESTAMP', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: 'CURRENT_TIMESTAMP' }
          ]
        },
        {
          id: 'tbl_products',
          name: 'products',
          x: 420,
          y: 70,
          color: '#10b981',
          columns: [
            { id: 'col_p1', name: 'id', type: 'UUID', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: 'uuid_generate_v4()' },
            { id: 'col_p2', name: 'title', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_p3', name: 'sku', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_p4', name: 'price', type: 'DECIMAL', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '0.00' },
            { id: 'col_p5', name: 'stock_quantity', type: 'INTEGER', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '0' },
            { id: 'col_p6', name: 'description', type: 'TEXT', isPrimary: false, isNotNull: false, isUnique: false, defaultValue: '' }
          ]
        },
        {
          id: 'tbl_orders',
          name: 'orders',
          x: 60,
          y: 350,
          color: '#8b5cf6',
          columns: [
            { id: 'col_o1', name: 'id', type: 'UUID', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: 'uuid_generate_v4()' },
            { id: 'col_o2', name: 'user_id', type: 'UUID', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_o3', name: 'status', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: "'pending'" },
            { id: 'col_o4', name: 'total_amount', type: 'DECIMAL', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '0.00' },
            { id: 'col_o5', name: 'order_date', type: 'TIMESTAMP', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: 'CURRENT_TIMESTAMP' }
          ]
        },
        {
          id: 'tbl_order_items',
          name: 'order_items',
          x: 420,
          y: 370,
          color: '#f59e0b',
          columns: [
            { id: 'col_oi1', name: 'id', type: 'INTEGER', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_oi2', name: 'order_id', type: 'UUID', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_oi3', name: 'product_id', type: 'UUID', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_oi4', name: 'quantity', type: 'INTEGER', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '1' },
            { id: 'col_oi5', name: 'unit_price', type: 'DECIMAL', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '0.00' }
          ]
        },
        {
          id: 'tbl_reviews',
          name: 'reviews',
          x: 770,
          y: 70,
          color: '#ec4899',
          columns: [
            { id: 'col_r1', name: 'id', type: 'INTEGER', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_r2', name: 'product_id', type: 'UUID', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_r3', name: 'rating', type: 'INTEGER', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '5' },
            { id: 'col_r4', name: 'comment', type: 'TEXT', isPrimary: false, isNotNull: false, isUnique: false, defaultValue: '' },
            { id: 'col_r5', name: 'created_at', type: 'TIMESTAMP', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: 'CURRENT_TIMESTAMP' }
          ]
        }
      ],
      relationships: [
        {
          id: 'rel_order_user',
          sourceTableId: 'tbl_orders',
          sourceColumnId: 'col_o2',
          targetTableId: 'tbl_users',
          targetColumnId: 'col_u1',
          cardinality: '1:N',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          id: 'rel_orderitem_order',
          sourceTableId: 'tbl_order_items',
          sourceColumnId: 'col_oi2',
          targetTableId: 'tbl_orders',
          targetColumnId: 'col_o1',
          cardinality: '1:N',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          id: 'rel_orderitem_product',
          sourceTableId: 'tbl_order_items',
          sourceColumnId: 'col_oi3',
          targetTableId: 'tbl_products',
          targetColumnId: 'col_p1',
          cardinality: '1:N',
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        {
          id: 'rel_review_product',
          sourceTableId: 'tbl_reviews',
          sourceColumnId: 'col_r2',
          targetTableId: 'tbl_products',
          targetColumnId: 'col_p1',
          cardinality: '1:N',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        }
      ]
    },

    saas: {
      name: 'SaaS Multi-tenant & Billing',
      tables: [
        {
          id: 'tbl_workspaces',
          name: 'workspaces',
          x: 60,
          y: 70,
          color: '#3b82f6',
          columns: [
            { id: 'col_w1', name: 'id', type: 'UUID', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: 'uuid_generate_v4()' },
            { id: 'col_w2', name: 'name', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_w3', name: 'slug', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_w4', name: 'created_at', type: 'TIMESTAMP', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: 'CURRENT_TIMESTAMP' }
          ]
        },
        {
          id: 'tbl_saas_users',
          name: 'users',
          x: 440,
          y: 70,
          color: '#10b981',
          columns: [
            { id: 'col_su1', name: 'id', type: 'UUID', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: 'uuid_generate_v4()' },
            { id: 'col_su2', name: 'email', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_su3', name: 'name', type: 'VARCHAR', isPrimary: false, isNotNull: false, isUnique: false, defaultValue: '' },
            { id: 'col_su4', name: 'avatar_url', type: 'VARCHAR', isPrimary: false, isNotNull: false, isUnique: false, defaultValue: '' }
          ]
        },
        {
          id: 'tbl_memberships',
          name: 'workspace_members',
          x: 250,
          y: 330,
          color: '#8b5cf6',
          columns: [
            { id: 'col_wm1', name: 'id', type: 'INTEGER', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_wm2', name: 'workspace_id', type: 'UUID', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_wm3', name: 'user_id', type: 'UUID', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_wm4', name: 'role', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: "'member'" }
          ]
        },
        {
          id: 'tbl_subscriptions',
          name: 'subscriptions',
          x: 60,
          y: 330,
          color: '#06b6d4',
          columns: [
            { id: 'col_sub1', name: 'id', type: 'UUID', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: 'uuid_generate_v4()' },
            { id: 'col_sub2', name: 'workspace_id', type: 'UUID', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_sub3', name: 'plan_tier', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: "'pro'" },
            { id: 'col_sub4', name: 'status', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: "'active'" },
            { id: 'col_sub5', name: 'renews_at', type: 'TIMESTAMP', isPrimary: false, isNotNull: false, isUnique: false, defaultValue: '' }
          ]
        }
      ],
      relationships: [
        {
          id: 'rel_mem_ws',
          sourceTableId: 'tbl_memberships',
          sourceColumnId: 'col_wm2',
          targetTableId: 'tbl_workspaces',
          targetColumnId: 'col_w1',
          cardinality: '1:N',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          id: 'rel_mem_user',
          sourceTableId: 'tbl_memberships',
          sourceColumnId: 'col_wm3',
          targetTableId: 'tbl_saas_users',
          targetColumnId: 'col_su1',
          cardinality: '1:N',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          id: 'rel_sub_ws',
          sourceTableId: 'tbl_subscriptions',
          sourceColumnId: 'col_sub2',
          targetTableId: 'tbl_workspaces',
          targetColumnId: 'col_w1',
          cardinality: '1:1',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        }
      ]
    },

    blog: {
      name: 'Blog & Content Publishing',
      tables: [
        {
          id: 'tbl_authors',
          name: 'authors',
          x: 60,
          y: 70,
          color: '#3b82f6',
          columns: [
            { id: 'col_a1', name: 'id', type: 'INTEGER', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_a2', name: 'username', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_a3', name: 'bio', type: 'TEXT', isPrimary: false, isNotNull: false, isUnique: false, defaultValue: '' }
          ]
        },
        {
          id: 'tbl_posts',
          name: 'posts',
          x: 400,
          y: 70,
          color: '#10b981',
          columns: [
            { id: 'col_po1', name: 'id', type: 'INTEGER', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_po2', name: 'author_id', type: 'INTEGER', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_po3', name: 'title', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_po4', name: 'slug', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_po5', name: 'content', type: 'TEXT', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_po6', name: 'published_at', type: 'TIMESTAMP', isPrimary: false, isNotNull: false, isUnique: false, defaultValue: '' }
          ]
        },
        {
          id: 'tbl_categories',
          name: 'categories',
          x: 740,
          y: 70,
          color: '#f59e0b',
          columns: [
            { id: 'col_cat1', name: 'id', type: 'INTEGER', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_cat2', name: 'name', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_cat3', name: 'slug', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: true, defaultValue: '' }
          ]
        },
        {
          id: 'tbl_comments',
          name: 'comments',
          x: 400,
          y: 350,
          color: '#8b5cf6',
          columns: [
            { id: 'col_c1', name: 'id', type: 'INTEGER', isPrimary: true, isNotNull: true, isUnique: true, defaultValue: '' },
            { id: 'col_c2', name: 'post_id', type: 'INTEGER', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_c3', name: 'author_name', type: 'VARCHAR', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_c4', name: 'body', type: 'TEXT', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: '' },
            { id: 'col_c5', name: 'created_at', type: 'TIMESTAMP', isPrimary: false, isNotNull: true, isUnique: false, defaultValue: 'CURRENT_TIMESTAMP' }
          ]
        }
      ],
      relationships: [
        {
          id: 'rel_post_author',
          sourceTableId: 'tbl_posts',
          sourceColumnId: 'col_po2',
          targetTableId: 'tbl_authors',
          targetColumnId: 'col_a1',
          cardinality: '1:N',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        {
          id: 'rel_comment_post',
          sourceTableId: 'tbl_comments',
          sourceColumnId: 'col_c2',
          targetTableId: 'tbl_posts',
          targetColumnId: 'col_po1',
          cardinality: '1:N',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        }
      ]
    }
  };

  class StorageManager {
    /**
     * Save current schema state to LocalStorage
     */
    static saveCurrent(state) {
      try {
        const payload = state.serialize();
        localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(payload));
        
        // Also update project in projects registry
        StorageManager.saveToProjectRegistry(payload);
        return true;
      } catch (err) {
        console.error('Failed to save to localStorage:', err);
        return false;
      }
    }

    /**
     * Load current schema state from LocalStorage
     */
    static loadCurrent() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CURRENT);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (err) {
        console.error('Failed to parse saved state:', err);
        return null;
      }
    }

    /**
     * Get list of saved projects
     */
    static getProjectsList() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
        return raw ? JSON.parse(raw) : [];
      } catch (err) {
        return [];
      }
    }

    /**
     * Update project index
     */
    static saveToProjectRegistry(project) {
      try {
        let list = StorageManager.getProjectsList();
        const existingIdx = list.findIndex(p => p.id === project.id);
        const meta = {
          id: project.id,
          name: project.name,
          updatedAt: new Date().toISOString(),
          tableCount: project.tables ? project.tables.length : 0
        };

        if (existingIdx >= 0) {
          list[existingIdx] = meta;
        } else {
          list.unshift(meta);
        }

        // Limit to 20 projects
        if (list.length > 20) list = list.slice(0, 20);
        localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(list));
      } catch (err) {
        console.error('Failed to update projects index:', err);
      }
    }

    /**
     * Delete project from registry
     */
    static deleteProject(projectId) {
      try {
        let list = StorageManager.getProjectsList();
        list = list.filter(p => p.id !== projectId);
        localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(list));
        return true;
      } catch (err) {
        return false;
      }
    }

    /**
     * Get starter template by key
     */
    static getTemplate(key) {
      const template = TEMPLATES[key];
      if (!template) return null;
      return JSON.parse(JSON.stringify(template));
    }

    /**
     * Export schema as JSON file download
     */
    static downloadJson(state) {
      const payload = state.serialize();
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const filename = `${(state.projectName || 'schema').replace(/\s+/g, '_').toLowerCase()}.schemacraft.json`;
      StorageManager.triggerDownload(blob, filename);
    }

    /**
     * Export SQL DDL file download
     */
    static downloadSql(sqlText, projectName, dialect) {
      const blob = new Blob([sqlText], { type: 'text/plain;charset=utf-8' });
      const filename = `${(projectName || 'schema').replace(/\s+/g, '_').toLowerCase()}_${dialect}.sql`;
      StorageManager.triggerDownload(blob, filename);
    }

    /**
     * Trigger browser file download
     */
    static triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  // Expose on window
  window.StorageManager = StorageManager;
  window.SchemaTemplates = TEMPLATES;

})(window);
