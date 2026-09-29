/**
 * Focused offline checks for the reusable quantity calculator and its two
 * stock-scan adapters. This is a component example as well as a regression
 * check: the same UIC.Calculator API is opened for unit_count and
 * loose_amount, with different boundary contracts.
 */
'use strict';

const vm = require('vm');
const S = require('../lib/sources');
const { makeSandbox } = require('./domstub');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label + (extra === undefined ? '' : ' — ' + extra)); }
}

function sandbox() {
  const sb = makeSandbox({ FMT: { escape: v => String(v).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c])) },
    CURRENT_ACTION: 'tc_stock_scan', COMPANY_PAGES: [], USER_PAGES: null, IS_SUPER_ADMIN: true,
    Event: function (type) { this.type = type; } });
  S.scriptBlocks(S.read('UI_Components.html')).forEach((b, i) => vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'UI_Components.html#' + i }));
  return sb;
}

const sb = sandbox();
const calc = sb.UIC.Calculator;
console.log('\n1 — safe expression parser and Google-style preview semantics\n');
check(calc.evaluate('12 + 8 * 3').valid && calc.evaluate('12 + 8 * 3').value === 36, 'multiplication precedence is conventional');
check(calc.evaluate('(12 + 8) * 3').value === 60, 'parentheses override precedence');
check(calc.evaluate('1.25 + 0.5').value === 1.75, 'decimals are not rounded per intermediate operation');
check(calc.evaluate('10%').value === 0.1, 'postfix percent means previous operand divided by 100');
check(calc.evaluate('-(2 + 3)').value === -5, 'unary minus and parentheses work');
check(!calc.evaluate('1 / 0').valid && /صفر/.test(calc.evaluate('1 / 0').error), 'division by zero is rejected');
check(!calc.evaluate('12 +').valid, 'incomplete expressions do not apply');
check(!calc.evaluate('2 3').valid, 'repeated/adjacent operands are rejected');
check(calc.evaluate('١٢ + ٨').value === 20, 'Arabic-Indic digits are normalized');

console.log('\n2 — reusable field adapters, apply boundary and reset\n');
const unit = sb.document.createElement('input'); unit.id = 'unit_count'; unit.value = '12 + 8 * 3';
const loose = sb.document.createElement('input'); loose.id = 'loose_amount'; loose.value = '0';
sb.document.body.appendChild(unit); sb.document.body.appendChild(loose);
let unitEvents = 0, looseEvents = 0;
unit.addEventListener('input', () => unitEvents++); loose.addEventListener('input', () => looseEvents++);
calc.open({ target: unit, title: 'عدد العبوات', precision: 0, integerOnly: true, min: 0 });
check(sb.document.getElementById('uic-calculator-expression-view').textContent.indexOf('12') !== -1,
  'opening exposes the complete expression and preview area');
calc.press('=');
check(sb.document.getElementById('uic-calculator-history').innerHTML.indexOf('36') !== -1 && unit.value === '12 + 8 * 3',
  '= evaluates and records without editing the underlying field');
calc.apply();
check(unit.value === '36' && unitEvents === 1 && !sb.document.getElementById('uic-calculator-modal'),
  'إدخال applies only to unit_count, emits input, and closes the modal');
calc.open({ target: unit, precision: 0, integerOnly: true });
check(sb.document.getElementById('uic-calculator-history').innerHTML.indexOf('12') === -1,
  'a new opening starts with empty session history');
calc.close();
calc.open({ target: loose, precision: 2, integerOnly: false, min: 0 });
calc.press('1'); calc.press('0'); calc.press('.'); calc.press('5');
calc.press('backspace'); calc.press('5');
calc.apply();
check(loose.value === '10.5' && looseEvents === 1, 'the same component applies decimal loose_amount independently');
calc.open({ target: loose, precision: 2 }); calc.press('1'); calc.press('2'); calc.press('clear');
check(sb.document.getElementById('uic-calculator-expression-view').textContent === '—', 'clear and backspace update the visible expression');
calc.close();
unit.value = '2.5';
calc.open({ target: unit, precision: 0, integerOnly: true });
calc.apply();
check(unit.value === '2.5', 'fractional package counts are rejected rather than truncated');
calc.close();

console.log('\n3 — one behaviour on every device\n');
/* The trigger once bypassed the dialog on a phone and simply focused the field,
   which is a bare number pad: number entry with no arithmetic, which is the one
   thing the button exists to provide. The page must not branch on the device. */
const PAGE = S.read('Company_TopChemical_StockScan.html');
const opener = PAGE.slice(PAGE.indexOf('function openScanCalculator'), PAGE.indexOf('function cancelCount'));
check(opener.indexOf('UIC.Calculator.open') !== -1, 'the trigger opens the shared calculator');
check(!/navigator[.]userAgent|pointer: coarse|innerWidth|target[.]focus[(][)]/.test(opener),
  'and reaches it without sniffing the device, exactly as in a desktop browser');
check(!/usesNativeMobileNumberKeyboard/.test(PAGE), 'the phone bypass is gone from the page entirely');

console.log('\n' + (failed ? failed + ' check(s) FAILED.' : 'Calculator checks pass.'));
process.exit(failed ? 1 : 0);
