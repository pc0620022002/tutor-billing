/**
 * tutor-billing — Team 班表 Google Sheet 讀取 GAS Web App
 * --------------------------------------------------------------
 * 用途:讓 tutor-billing 網站(https://pc0620022002.github.io/tutor-billing/)
 *       直接讀「班表」Google Sheet 的「當月 + 上月」兩個分頁,
 *       取代每月手動匯出 .xlsx 再上傳的流程。
 *
 * 這支 GAS 是「獨立 script」(用 clasp 建+推+部署),用 SpreadsheetApp.openById()
 *   讀「班表」Google Sheet。executeAs=USER_DEPLOYING(以擁有者身分跑)+
 *   access=ANYONE_ANONYMOUS(前端免登入),設定在 appsscript.json。
 *
 * 部署:clasp deploy(本機),改 code 後 clasp push + clasp redeploy <id> 即可。
 *
 * CORS:前端用 JSONP(?callback=xxx)呼叫,瀏覽器用 <script> 載入完全繞過 CORS,
 *   不需設任何 CORS header(與 ap-question-bank 同一套做法)。
 *
 * 回傳:當月 + 上月兩個分頁的「原始二維陣列」,前端用既有 parseTeamStudents() 解析,
 *   解析邏輯一行都不用改。日期 cell 會先轉成 'yyyy-MM-dd' 字串(見 cleanValues_)。
 *
 * 分頁命名:年.月(例 2026.6),不補零。但補零(2026.06)也會被找到。
 */

// 公開防亂打字串:會出現在前端原始碼,不是真密碼,只用來擋亂打。
// 要跟 index.html 的 GAS_TEAM_TOKEN 完全一致。
var TEAM_TOKEN = 'TBTEAM_k7n2qx9w';
var TZ = 'Asia/Taipei';
// 「班表」Google Sheet 的 ID(網址 /d/ 與 /edit 之間那段)
var SHEET_ID = '1ryL1TJSlXgyn0xafQJ1MjXFWrCj12QFJ6_IthBofCKM';

// 一次性授權用:在 Apps Script 編輯器選這個函式 → 執行 ▶ → 跳出授權視窗按「允許」。
// 跑這個會實際碰到試算表,觸發 SpreadsheetApp 的授權同意,之後 web app 才能讀 Sheet。
function authorize() {
  var name = SpreadsheetApp.openById(SHEET_ID).getName();
  Logger.log('已授權,可讀取試算表:' + name);
  return name;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.token !== TEAM_TOKEN) return reply_(p, { ok: false, err: 'bad token' });

  // 寫回「已請款」:在指定分頁、C 欄「匯出帳號」的下一列、對應學生欄打 OK(或清空)
  //   sheet = 分頁名(如 2026.6);cols = 學生欄的 0-based index(逗號分隔,= 前端 srcCol);
  //   value = 'OK'(勾選)或 'clear'(取消勾選,清空那格)
  if (p.action === 'markBilled') {
    return reply_(p, markBilled_(p.sheet, p.cols, p.value));
  }

  // 用台北時區算「當月、上月」,不依賴 Apps Script 專案的時區設定
  var now = new Date();
  var y = Number(Utilities.formatDate(now, TZ, 'yyyy'));
  var m = Number(Utilities.formatDate(now, TZ, 'M'));
  var prevY = (m === 1) ? (y - 1) : y;
  var prevM = (m === 1) ? 12 : (m - 1);

  var months = [
    readMonth_(y, m),        // 當月
    readMonth_(prevY, prevM) // 上月
  ];
  return reply_(p, { ok: true, months: months });
}

// 找「年.月」分頁(不補零優先,補零 fallback),回 { name, found, values }
function readMonth_(y, m) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var candidates = [y + '.' + m, y + '.' + ('0' + m).slice(-2)];
  for (var i = 0; i < candidates.length; i++) {
    var sh = ss.getSheetByName(candidates[i]);
    if (sh) {
      return { name: candidates[i], found: true, values: cleanValues_(sh.getDataRange().getValues()) };
    }
  }
  return { name: candidates[0], found: false, values: [] };
}

// 寫回「已請款」OK 到 C 欄「匯出帳號」的下一列、指定學生欄
function markBilled_(sheetName, colsStr, value) {
  if (!sheetName) return { ok: false, err: 'missing sheet' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { ok: false, err: '找不到分頁 ' + sheetName };

  // C 欄(第 3 欄)找「匯出帳號」那一列(1-based)
  var lastRow = sh.getLastRow();
  var colC = sh.getRange(1, 3, lastRow, 1).getValues();
  var rowExport = -1;
  for (var i = 0; i < colC.length; i++) {
    if (String(colC[i][0]).trim() === '匯出帳號') { rowExport = i + 1; break; }
  }
  if (rowExport === -1) return { ok: false, err: '找不到「匯出帳號」列' };
  var targetRow = rowExport + 1;

  var cellVal = (value === 'clear') ? '' : 'OK';
  var cols = String(colsStr || '').split(',').filter(function (x) { return x !== ''; }).map(Number);
  cols.forEach(function (c0) {
    if (c0 >= 0) sh.getRange(targetRow, c0 + 1).setValue(cellVal); // c0 = 0-based,getRange 要 1-based
  });
  SpreadsheetApp.flush(); // 懶寫入保險:確保 client 之後讀得到(見全域教訓 GAS flush)
  return { ok: true, sheet: sheetName, row: targetRow, written: cols.length, value: cellVal };
}

// 日期 cell → 'yyyy-MM-dd' 字串(避免 JSON 序列化成 UTC 造成日期偏一天);
// 其餘原值保留(數字仍是數字、時間區間 '0930-1130' 仍是字串)。
function cleanValues_(rows) {
  return rows.map(function (row) {
    return row.map(function (cell) {
      if (cell instanceof Date) return Utilities.formatDate(cell, TZ, 'yyyy-MM-dd');
      return cell;
    });
  });
}

// JSONP 回應(有 callback 就包成 callback(json),沒有就回純 JSON)
function reply_(p, obj) {
  var json = JSON.stringify(obj);
  if (p && p.callback) {
    return ContentService.createTextOutput(p.callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
