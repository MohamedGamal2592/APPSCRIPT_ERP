/** Canonical imported system collection mappings. */
var SYSTEM_TABLE_SCHEMAS_ = {
  ERP_Users: { collection: 'ERP_Users', keys: ['email'], unique: ['email'] },
  ERP_Companies: { collection: 'ERP_Companies', keys: ['company_unique_id'], unique: ['company_unique_id'] },
  ERP_Pages_Matrix: { collection: 'ERP_Pages_Matrix', keys: ['erp_pages_matrix_unique_id'], unique: ['role', 'page_id'] },
  ERP_System_Pages: { collection: 'ERP_System_Pages', keys: ['page_id'], unique: ['page_id'] },
  ERP_system_work: { collection: 'ERP_system_work', keys: [], unique: [] },
  ERP_Sessions: { collection: 'ERP_Sessions', keys: ['token_hash'], unique: ['token_hash'] },
  ERP_User_Devices: { collection: 'ERP_User_Devices', keys: ['email', 'device_id'], unique: ['email', 'device_id'] },
  ERP_User_Views: { collection: 'ERP_User_Views', keys: ['view_id'], unique: ['email', 'page_action', 'view_name'] },
  ERP_currency_exchange: { collection: 'ERP_currency_exchange', keys: ['id'], unique: ['currency'] },
  ERP_system_invoices: { collection: 'ERP_system_invoices', keys: ['unique_id'], unique: ['unique_id'] },
  ERP_Record_History: { collection: 'ERP_Record_History', keys: [], unique: [] },
  ERP_History_Queue: { collection: 'ERP_History_Queue', keys: ['event_id'], unique: ['event_id'] },
  SystemLog: { collection: 'SystemLog', keys: [], unique: [] },
  ERP_Client_Log: { collection: 'ERP_Client_Log', keys: [], unique: [] },
  ERP_Client_Perf: { collection: 'ERP_Client_Perf', keys: [], unique: [] },
  ERP_Perf_Log: { collection: 'ERP_Perf_Log', keys: [], unique: [] },
  ERP_Perf_Weekly: { collection: 'ERP_Perf_Weekly', keys: [], unique: [] }
  ,ERP_Record_History_Archive: { collection: 'ERP_Record_History_Archive', keys: [], unique: [] }
  ,SystemLog_Archive: { collection: 'SystemLog_Archive', keys: [], unique: [] }
};
function systemSchema_(tableKey) { var s = SYSTEM_TABLE_SCHEMAS_[String(tableKey || '')]; if (!s) throw new Error('STORAGE_SCHEMA_ERROR: unknown system table ' + tableKey); return s; }
function isSystemTable_(tableKey) { return !!SYSTEM_TABLE_SCHEMAS_[String(tableKey || '')]; }
function systemTableNames_() { return Object.keys(SYSTEM_TABLE_SCHEMAS_); }
