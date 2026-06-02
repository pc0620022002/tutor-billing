// LWW 合併純函式單元測試。從 index.html 抽出真實的 lwwDec / lwwMergeMaps 來測,
// 確保「舊值永不蓋掉新值、tombstone 刪除不被舊值復活、平手決定性收斂」。
// 跑法:node tools/test/lww_merge.test.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function grab(sig) {
  const i = html.indexOf(sig);
  if (i < 0) throw new Error('找不到 ' + sig);
  let depth = 0, started = false, out = [];
  for (const ch of html.slice(i)) {
    out.push(ch);
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) break; }
  }
  return out.join('');
}
eval(grab('function lwwDec'));
eval(grab('function lwwMergeMaps'));

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ❌', name); } };

t('1 兩端各改不同 leaf → 都保留',
  (r => eq(r.map, { A: 1, B: 2 }) && r.changed)(lwwMergeMaps({ A: 1 }, { A: 5 }, { B: { v: 2, t: 6 } })));
t('2a 同 leaf 新 t 覆蓋',
  (r => eq(r.map, { A: 9 }) && r.clock.A === 6)(lwwMergeMaps({ A: 1 }, { A: 5 }, { A: { v: 9, t: 6 } })));
t('2b 同 leaf 舊 t 不覆蓋(核心保證)',
  (r => eq(r.map, { A: 9 }) && r.clock.A === 6 && r.changed === false)(lwwMergeMaps({ A: 9 }, { A: 6 }, { A: { v: 1, t: 3 } })));
t('3 tombstone 刪除',
  (r => eq(r.map, {}) && r.clock.A === 8 && r.changed)(lwwMergeMaps({ A: 1 }, { A: 5 }, { A: { t: 8, d: 1 } })));
t('3b 舊 tombstone 不刪新值',
  (r => eq(r.map, { A: 9 }))(lwwMergeMaps({ A: 9 }, { A: 8 }, { A: { t: 3, d: 1 } })));
{
  const s1 = lwwMergeMaps({ A: 1 }, { A: 2 }, { A: { t: 5, d: 1 } });
  const s2 = lwwMergeMaps(s1.map, s1.clock, { A: { v: 7, t: 9 } });
  t('4 刪後再改 → 復活成新值', eq(s2.map, { A: 7 }) && s2.clock.A === 9);
}
t('tie-break 同 t 兩台收斂一致',
  eq(lwwMergeMaps({ A: 1 }, { A: 5 }, { A: { v: 2, t: 5 } }).map,
     lwwMergeMaps({ A: 2 }, { A: 5 }, { A: { v: 1, t: 5 } }).map));
t('遷移 t=0 不復活已刪',
  (r => eq(r.map, {}))(lwwMergeMaps({}, { A: 9 }, { A: { v: 1, t: 0 } })));

console.log(`\nLWW merge: 通過 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
