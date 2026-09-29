'use strict';
/* Offline proof for Code.js uidV7_(): RFC 9562 shape, uniqueness and
   chronological sortability. No Google services, no network — the function is
   sliced out of the real source and run in a vm with a controllable clock. */
const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'Code.js'),'utf8');
const start=source.indexOf('function uidV7_()');
if(start<0){console.error('quality_uidv7: uidV7_ not found in Code.js');process.exit(1);}
const end=source.indexOf('\nfunction ',start+10);
const body=source.slice(start,end<0?source.length:end);

let nowMs=1758000000000;
const ctx={Utilities:{getUuid:()=>crypto.randomUUID().replace(/-/g,'')},Date:{now:()=>nowMs}};
vm.createContext(ctx);vm.runInContext(body,ctx);

let failed=0;
function check(ok,label){if(ok){console.log('  ok   '+label);}else{failed++;console.log('  FAIL '+label);}}

const V7=/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/* (a)+(b) 5000 ids, five blocks of 50 sharing one millisecond so both the
   canonical shape and the random entropy are exercised. */
const ids=[];
for(let i=0;i<5000;i++){
  if(i%50===0) nowMs+=1;
  ids.push(ctx.uidV7_());
}
check(ids.every(id=>V7.test(id)),'every id matches the canonical UUIDv7 pattern');
check(ids.every(id=>id.length===36),'every id is 36 characters');
check(new Set(ids).size===ids.length,'5000 ids across 100 milliseconds are all unique');

/* (c) timestamp round-trip: the first 12 hex chars are the frozen Date.now(). */
const T=1758000000000;
nowMs=T;
const frozen=ctx.uidV7_();
const tsHex=frozen.slice(0,8)+frozen.slice(9,13);
check(tsHex===T.toString(16).padStart(12,'0'),'first 12 hex chars equal the frozen timestamp');
check(parseInt(tsHex,16)===T,'timestamp hex parses back to the exact Date.now() value');

/* (d) a later millisecond always sorts after an earlier one. */
nowMs=T;
const early=[];for(let i=0;i<100;i++) early.push(ctx.uidV7_());
nowMs=T+1;
const late=[];for(let i=0;i<100;i++) late.push(ctx.uidV7_());
early.sort();late.sort();
check(early[early.length-1]<late[0],'max(ids at T) sorts before min(ids at T+1)');
check(early.every(id=>late.every(l=>id<l)),'every T id sorts before every T+1 id');

console.log(failed===0
  ? 'quality_uidv7: PASS (shape, 5000-id uniqueness, timestamp round-trip, chronological order)'
  : 'quality_uidv7: FAIL ('+failed+' check(s))');
process.exit(failed===0?0:1);
