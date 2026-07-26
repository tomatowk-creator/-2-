/* ================================================================
   簿記2級 CBT模擬試験 - Google Apps Script (GAS) バックエンド API
   
   【最新設計定義書 互換バージョン】
   - 『学習履歴』(learning_logs) の id / question_id 列に両対応
   - 不正解時: is_starred = true (自動復習リスト登録)
   - 復習モード正解時: is_starred = false (自動復習クリア)
   ================================================================ */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var params = e ? e.parameter : {};
  var action = params.action;
  var targetId = params.id ? String(params.id) : null;

  // ── 1. リアルタイム書き込み・更新リクエスト ──
  
  // ★要復習フラグの手動トグル
  if (action === 'star' && targetId) {
    return handleStarToggle(ss, targetId, params.star);
  }

  // 採点結果の記録
  if (action === 'result' && targetId) {
    return handleResultRecord(ss, params);
  }

  // ── 2. データ全件参照リクエスト ──
  var result = {};
  var sheetNames = ['仕訳問題', '商業簿記_総合', '工業簿記_総合', '勘定科目マスタ', '学習履歴'];
  
  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (sheet) {
      result[sheetNames[i]] = getSheetData(sheet);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 指定したシートの全行をヘッダー付きオブジェクト配列として取得
 */
function getSheetData(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function (h) { return String(h).trim(); });
  var resultList = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var isEmpty = true;
    for (var k = 0; k < row.length; k++) {
      if (row[k] !== '' && row[k] !== null && row[k] !== undefined) {
        isEmpty = false;
        break;
      }
    }
    if (isEmpty) continue;

    var rowObj = {};
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) {
        var val = row[j];
        rowObj[headers[j]] = (val !== undefined && val !== null) ? val : '';
      }
    }
    resultList.push(rowObj);
  }
  return resultList;
}

/**
 * 復習フラグ（is_starred）の明示的トグル/指定更新
 */
function handleStarToggle(ss, questionId, starParam) {
  var sheet = ss.getSheetByName('学習履歴');
  if (!sheet) {
    sheet = ss.insertSheet('学習履歴');
    sheet.appendRow(['id', 'is_starred', 'attempt_count', 'correct_count', 'last_attempted_at', 'memo']);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  
  // 'id' または 'question_id' の列を柔軟検索
  var idCol = headers.indexOf('id');
  if (idCol === -1) idCol = headers.indexOf('question_id');
  var starCol = headers.indexOf('is_starred');

  if (idCol === -1 || starCol === -1) {
    return jsonResponse({ status: 'error', message: 'Required headers not found' });
  }

  // 既存行の更新
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === questionId) {
      var current = data[i][starCol];
      var newVal;
      if (starParam !== undefined && starParam !== null) {
        newVal = (starParam === 'true' || starParam === '1');
      } else {
        newVal = (current === true || String(current).toUpperCase() === 'TRUE') ? false : true;
      }
      sheet.getRange(i + 1, starCol + 1).setValue(newVal);
      return jsonResponse({ status: 'success', id: questionId, is_starred: newVal });
    }
  }

  // 新規行追加
  var newRow = new Array(headers.length).fill('');
  newRow[idCol] = questionId;
  var setStar = (starParam !== undefined && starParam !== null) ? (starParam === 'true' || starParam === '1') : true;
  newRow[starCol] = setStar;
  sheet.appendRow(newRow);
  return jsonResponse({ status: 'success', id: questionId, is_starred: setStar });
}

/**
 * 採点結果の記録
 * - 不正解(incorrect): 自動で is_starred = true (要復習に登録)
 * - 復習モード正解(correct & is_review=true): 自動で is_starred = false (復習完了)
 */
function handleResultRecord(ss, params) {
  var questionId = String(params.id);
  var resultStr = params.result || 'incorrect'; // 'correct' or 'incorrect'
  var isReviewMode = (params.mode === 'review' || params.is_review === 'true');

  var sheet = ss.getSheetByName('学習履歴');
  if (!sheet) {
    sheet = ss.insertSheet('学習履歴');
    sheet.appendRow(['id', 'is_starred', 'attempt_count', 'correct_count', 'last_attempted_at', 'memo']);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  
  var idCol = headers.indexOf('id');
  if (idCol === -1) idCol = headers.indexOf('question_id');
  
  var starCol = headers.indexOf('is_starred');
  var attemptCol = headers.indexOf('attempt_count');
  var correctCol = headers.indexOf('correct_count');
  var lastAttemptCol = headers.indexOf('last_attempted_at');

  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === questionId) {
      var attempts = (Number(data[i][attemptCol]) || 0) + 1;
      var corrects = Number(data[i][correctCol]) || 0;
      var currentStar = (data[i][starCol] === true || String(data[i][starCol]).toUpperCase() === 'TRUE');
      
      var nextStar = currentStar;
      if (resultStr === 'incorrect') {
        nextStar = true; // 間違えたら復習リストに自動追加
      } else if (resultStr === 'correct' && isReviewMode) {
        nextStar = false; // 復習モードで正解したら復習完了クリア
      }

      if (resultStr === 'correct') corrects++;

      if (starCol !== -1) sheet.getRange(i + 1, starCol + 1).setValue(nextStar);
      if (attemptCol !== -1) sheet.getRange(i + 1, attemptCol + 1).setValue(attempts);
      if (correctCol !== -1) sheet.getRange(i + 1, correctCol + 1).setValue(corrects);
      if (lastAttemptCol !== -1) sheet.getRange(i + 1, lastAttemptCol + 1).setValue(now);

      return jsonResponse({ status: 'success', id: questionId, is_starred: nextStar });
    }
  }

  // 新規行作成
  var newRow = new Array(headers.length).fill('');
  newRow[idCol] = questionId;
  
  var initialStar = false;
  if (resultStr === 'incorrect') initialStar = true;
  
  if (starCol !== -1) newRow[starCol] = initialStar;
  if (attemptCol !== -1) newRow[attemptCol] = 1;
  if (correctCol !== -1) newRow[correctCol] = (resultStr === 'correct') ? 1 : 0;
  if (lastAttemptCol !== -1) newRow[lastAttemptCol] = now;
  sheet.appendRow(newRow);

  return jsonResponse({ status: 'success', id: questionId, is_starred: initialStar });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
