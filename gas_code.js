/* ================================================================
   簿記2級 CBT模擬試験 - Google Apps Script (GAS) バックエンド API
   
   【特徴】
   - 単一の doGet(e) エンドポイントで「全データ取得」と「リアルタイム書き込み」を処理
   - CORS制限を回避する ContentService.MimeType.JSON レスポンス
   
   【スプレッドシートのデプロイ設定】
   1. Googleスプレッドシートの「拡張機能」→「Apps Script」にこのコードを貼り付けて保存
   2. 「デプロイ」→「新しいデプロイ」を選択
   3. 種類: 「ウェブアプリ」
   4. 実行ユーザー: 「自分」
   5. アクセスできるユーザー: 「全員」
   6. デプロイ後に発行される「ウェブアプリURL」をコピーし、index.html の GAS_URL に設定
   ================================================================ */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var params = e ? e.parameter : {};
  var action = params.action; // 操作種別: 'star', 'result', など
  var targetId = params.id ? String(params.id) : null;

  // ── 1. リアルタイム書き込み・更新リクエスト (action と id が存在する場合) ──
  
  // ★要復習フラグの切り替え
  if (action === 'star' && targetId) {
    return handleStarToggle(ss, targetId);
  }

  // 採点結果の記録
  if (action === 'result' && targetId) {
    return handleResultRecord(ss, params);
  }

  // ── 2. データ全件参照リクエスト (パラメータなし または sheet 指定時) ──
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
 * 復習フラグ（is_starred）のトグル更新
 */
function handleStarToggle(ss, questionId) {
  var sheet = ss.getSheetByName('学習履歴');
  if (!sheet) {
    sheet = ss.insertSheet('学習履歴');
    sheet.appendRow(['question_id', 'is_starred', 'attempt_count', 'correct_count', 'last_attempted_at', 'last_result']);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var idCol = headers.indexOf('question_id');
  var starCol = headers.indexOf('is_starred');

  if (idCol === -1 || starCol === -1) {
    return jsonResponse({ status: 'error', message: 'Required headers not found' });
  }

  // 既存レコードのトグル更新
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === questionId) {
      var current = data[i][starCol];
      var newVal = (current === true || String(current).toUpperCase() === 'TRUE') ? false : true;
      sheet.getRange(i + 1, starCol + 1).setValue(newVal);
      return jsonResponse({ status: 'success', id: questionId, is_starred: newVal });
    }
  }

  // 新規行追加
  var newRow = new Array(headers.length).fill('');
  newRow[idCol] = questionId;
  newRow[starCol] = true;
  sheet.appendRow(newRow);
  return jsonResponse({ status: 'success', id: questionId, is_starred: true });
}

/**
 * 採点結果の記録
 */
function handleResultRecord(ss, params) {
  var questionId = String(params.id);
  var resultStr = params.result || 'incorrect'; // 'correct' or 'incorrect'

  var sheet = ss.getSheetByName('学習履歴');
  if (!sheet) {
    sheet = ss.insertSheet('学習履歴');
    sheet.appendRow(['question_id', 'is_starred', 'attempt_count', 'correct_count', 'last_attempted_at', 'last_result']);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var idCol = headers.indexOf('question_id');
  var attemptCol = headers.indexOf('attempt_count');
  var correctCol = headers.indexOf('correct_count');
  var lastAttemptCol = headers.indexOf('last_attempted_at');
  var lastResultCol = headers.indexOf('last_result');

  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === questionId) {
      var attempts = (Number(data[i][attemptCol]) || 0) + 1;
      var corrects = Number(data[i][correctCol]) || 0;
      if (resultStr === 'correct') corrects++;

      if (attemptCol !== -1) sheet.getRange(i + 1, attemptCol + 1).setValue(attempts);
      if (correctCol !== -1) sheet.getRange(i + 1, correctCol + 1).setValue(corrects);
      if (lastAttemptCol !== -1) sheet.getRange(i + 1, lastAttemptCol + 1).setValue(now);
      if (lastResultCol !== -1) sheet.getRange(i + 1, lastResultCol + 1).setValue(resultStr === 'correct' ? '正解' : '不正解');

      return jsonResponse({ status: 'success', id: questionId });
    }
  }

  var newRow = new Array(headers.length).fill('');
  newRow[idCol] = questionId;
  var starCol = headers.indexOf('is_starred');
  if (starCol !== -1) newRow[starCol] = false;
  if (attemptCol !== -1) newRow[attemptCol] = 1;
  if (correctCol !== -1) newRow[correctCol] = (resultStr === 'correct') ? 1 : 0;
  if (lastAttemptCol !== -1) newRow[lastAttemptCol] = now;
  if (lastResultCol !== -1) newRow[lastResultCol] = (resultStr === 'correct') ? '正解' : '不正解';
  sheet.appendRow(newRow);
  return jsonResponse({ status: 'success', id: questionId });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
