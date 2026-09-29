'use strict';
/* Offline proof for the ACTION_TABLES array support in
   Company_ValleyFoods_Actions.js. The REAL PAGE_ACCESS, ACTION_TABLES,
   PAGE_TABLES builder and tableForAction_ are sliced out of the source and
   evaluated together, so the assertions run against production behaviour. */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'Company_ValleyFoods_Actions.js'),'utf8');

function grabBlock(header){
  const start=source.indexOf(header);assert(start>=0,header);
  const end=source.indexOf('\n  };',start);assert(end>=0,header+' end');
  return source.slice(start,end+5);
}
function grabFunction(name){
  const start=source.indexOf('function '+name+'(');assert(start>=0,name);
  const end=source.indexOf('\n  }',start);
  return source.slice(start,end+4);
}
function grabPageTablesBuilder(){
  const header='const PAGE_TABLES = (function () {';
  const start=source.indexOf(header);assert(start>=0,header);
  const end=source.indexOf('})();',start);assert(end>=0,'PAGE_TABLES end');
  return source.slice(start,end+5);
}

/* One script scope: the builder is wrapped in a function so it can be rebuilt
   after an entry is added, exactly the way a future array entry would be. */
const script=[
  grabBlock('const PAGE_ACCESS = {'),
  grabBlock('const ACTION_TABLES = {'),
  'function __rebuildPageTables_() {',
  grabPageTablesBuilder(),
  '  return PAGE_TABLES;',
  '}',
  grabFunction('tableForAction_'),
  '__out = { PAGE_ACCESS: PAGE_ACCESS, ACTION_TABLES: ACTION_TABLES, PAGE_TABLES: __rebuildPageTables_(), rebuild: __rebuildPageTables_, tableForAction_: tableForAction_ };'
].join('\n');

const ctx={HR_EMPLOYEES_SHEET:'vf_hr_employees',console:console};
vm.createContext(ctx);vm.runInContext(script,ctx);
const O=ctx.__out;

let failed=0;
function check(ok,label){if(ok){console.log('  ok   '+label);}else{failed++;console.log('  FAIL '+label);}}

check((source.match(/const ACTION_TABLES = \{/g)||[]).length===1,'exactly one ACTION_TABLES definition in the source');
check((source.match(/const PAGE_TABLES = \(function \(\) \{/g)||[]).length===1,'exactly one PAGE_TABLES builder in the source');

/* (a) legacy string entry keeps working end to end. */
check(O.ACTION_TABLES['get_hr_employees']==='vf_hr_employees','legacy string entry keeps its sheet value');
check((O.PAGE_TABLES['vf_hr_employees']||[]).indexOf('vf_hr_employees')!==-1,'legacy action still maps into PAGE_TABLES');
check((O.PAGE_TABLES['vf_cash']||[]).indexOf('valley_cash_bank_movement')!==-1,'second legacy page still maps into PAGE_TABLES');
check(O.tableForAction_('get_hr_employees')==='vf_hr_employees','tableForAction_ returns the legacy string');

/* (b) an array entry flattens into every table it names and joins for display. */
O.ACTION_TABLES['__test_array_action']=['valley_quality_ncrs','valley_quality_capas'];
O.PAGE_ACCESS['__test_array_action']={page:'vf_quality_ncr',access:'read'};
const P2=O.rebuild();
const ncrTables=P2['vf_quality_ncr']||[];
check(ncrTables.indexOf('valley_quality_ncrs')!==-1&&ncrTables.indexOf('valley_quality_capas')!==-1,'array entry flattens into every named table');
check(O.tableForAction_('__test_array_action')==='valley_quality_ncrs،valley_quality_capas','tableForAction_ joins arrays with the Arabic comma');

/* (c) an action with no table contributes nothing and displays as empty. */
O.PAGE_ACCESS['__test_unknown_action']={page:'__test_unknown_page',access:'read'};
const P3=O.rebuild();
check(O.tableForAction_('__test_unknown_action')==='','unknown action returns an empty string');
check(!P3['__test_unknown_page'],'unknown action adds no PAGE_TABLES entry');

console.log(failed===0
  ? 'quality_action_tables: PASS (legacy strings, array flattening, Arabic-comma join, unknown action)'
  : 'quality_action_tables: FAIL ('+failed+' check(s))');
process.exit(failed===0?0:1);
