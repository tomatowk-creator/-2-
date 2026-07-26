/* ================================================================
   簿記2級 CBT模擬試験 - メインロジック (app.js)

   【永続化方針】
   本番のテストセンター試験を再現するため、localStorage等による
   保存は一切行わない。ページをリロードすると進行状況は失われ、
   新しい問題セットで最初からやり直しとなる。

   【状態管理】
   アプリケーション全体の状態は state オブジェクト1つで一元管理する。
   タブを切り替えても、入力済みの解答・見直しチェックの状態は保持される。

   【タイマー実装】
   setIntervalだけに頼らず、開始時刻(Date.now())を記録し、
   経過時間を都度計算して残り時間を算出する方式
   （タブが非アクティブでも誤差が出ない）。
   ================================================================ */

(function () {
  "use strict";

  // ============================================================
  // 定数
  // ============================================================
  const EXAM_DURATION_MS = 90 * 60 * 1000; // 90分
  const WARNING_THRESHOLD_MS = 10 * 60 * 1000; // 残り10分で警告
  const Q1_COUNT = 5; // 第1問の出題数
  const Q1_POINTS = 4; // 第1問の1問あたり配点

  // ============================================================
  // アプリケーション状態（一元管理オブジェクト）
  // ============================================================
  let state = null;
  let previousExamIds = null; // やり直し時の重複回避用

  let wrongQuestionsHistory = []; // 直近で間違えた問題のIDリスト

  /**
   * 初期状態オブジェクトを生成
   */
  function createInitialState() {
    return {
      mode: "exam", // "exam" | "training"
      currentTab: 1, // 現在表示中の大問番号 (1-5)
      currentSubQ: 0, // 現在表示中の小問インデックス (0-based)
      startTime: null, // 試験開始時刻 (Date.now())
      timerInterval: null, // setIntervalのID
      exam: {
        q1: [],
        q2: [],
        q3: [],
        q4: [],
        q5: [],
      },
      answers: {}, // ユーザーの回答（キー: フィールドID, 値: 入力値）
      reviewFlags: {}, // 見直しフラグ（キー: "q{大問}-{小問index}", 値: boolean）
      checkedQuestions: {}, // トレーニングモード用：解説チェック済みフラグ
      isFinished: false, // 試験終了フラグ
    };
  }

  // ============================================================
  // ユーティリティ
  // ============================================================

  /** 配列をシャッフル（Fisher-Yates） */
  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ============================================================
  // 第1問 プルダウン選択肢の動的生成
  //
  // 本番CBT同様、正解の勘定科目＋間違いやすいダミー科目を
  // 合計8〜12個程度に絞り込んで出題する。
  // confusableGroups（data.js）を参照し、正解科目と混同しやすい
  // 科目を自動的にピックアップする。
  // ============================================================
  const Q1_CHOICES_TARGET = 10; // 目標選択肢数

  /**
   * 指定した勘定科目に対して、混同しやすい科目の一覧を返す
   */
  function getConfusables(account) {
    var result = new Set();
    for (var g = 0; g < confusableGroups.length; g++) {
      var group = confusableGroups[g];
      if (group.indexOf(account) !== -1) {
        for (var i = 0; i < group.length; i++) {
          if (group[i] !== account) result.add(group[i]);
        }
      }
    }
    return result;
  }

  /**
   * 仕訳問題の正解科目から、本番CBT風のプルダウン選択肢を動的に生成する
   * - 正解科目はすべて含める
   * - 各正解科目の混同しやすい科目をダミーとして追加
   * - 不足分はaccountListからランダムに補充
   * - 最終的にシャッフルして返す
   */
  function generateQ1Choices(question) {
    // 正解に使われている勘定科目（重複除去）
    var correctSet = new Set();
    for (var a = 0; a < question.answers.length; a++) {
      correctSet.add(question.answers[a].account);
    }

    // 各正解科目の混同しやすい科目をプール
    var confusablePool = new Set();
    correctSet.forEach(function (acc) {
      var confs = getConfusables(acc);
      confs.forEach(function (c) {
        if (!correctSet.has(c)) confusablePool.add(c);
      });
    });

    // 必要なダミー数を計算
    var needed = Math.max(0, Q1_CHOICES_TARGET - correctSet.size);

    // 混同しやすい科目をシャッフルして必要数取得
    var confusableArr = shuffleArray(Array.from(confusablePool));
    var selected = confusableArr.slice(0, needed);

    // 混同科目だけでは足りない場合、accountListからランダム補充
    if (selected.length < needed) {
      var remaining = needed - selected.length;
      var usedSet = new Set(selected);
      correctSet.forEach(function (c) { usedSet.add(c); });
      confusablePool.forEach(function (c) { usedSet.add(c); });

      var extras = shuffleArray(
        accountList.filter(function (a) { return !usedSet.has(a); })
      );
      for (var e = 0; e < Math.min(remaining, extras.length); e++) {
        selected.push(extras[e]);
      }
    }

    // 正解 + ダミーを結合してシャッフル
    var choices = Array.from(correctSet).concat(selected);
    return shuffleArray(choices);
  }

  /** 金額文字列のカンマを除去してintにパース */
  function parseAmount(str) {
    if (str === "" || str === undefined || str === null) return NaN;
    const cleaned = String(str).replace(/,/g, "");
    if (cleaned === "" || cleaned === "-") return NaN;
    return parseInt(cleaned, 10);
  }

  /** 数値を3桁区切りカンマ付き文字列に変換 */
  function formatNumber(value) {
    const raw = String(value).replace(/,/g, "");
    if (raw === "" || raw === "-") return raw;
    const num = parseInt(raw, 10);
    if (isNaN(num)) return "";
    return num.toLocaleString();
  }

  // ============================================================
  // 問題抽出ロジック
  // ============================================================

  /**
   * questionBankから今回のテストセットを抽出する
   * @param {Object|null} prevIds - 前回の出題IDセット（重複回避用）
   */
  function selectQuestions(prevIds) {
    const exam = {};

    // 第1問: プールからランダムに5問、重複なし
    const q1Pool = shuffleArray(questionBank.q1_journal);
    exam.q1 = q1Pool.slice(0, Math.min(Q1_COUNT, q1Pool.length));

    // 第2問: ランダムに1問
    exam.q2 = [pickRandom(questionBank.q2_commercial, prevIds?.q2)];

    // 第3問: ランダムに1問
    exam.q3 = [pickRandom(questionBank.q3_commercial_closing, prevIds?.q3)];

    // 第4問: 合計20点になる組み合わせで1〜2問
    exam.q4 = selectQ4(questionBank.q4_industrial, prevIds?.q4);

    // 第5問: ランダムに1問
    exam.q5 = [pickRandom(questionBank.q5_industrial, prevIds?.q5)];

    return exam;
  }

  /**
   * トレーニングモード用の問題を抽出
   */
  function selectTrainingQuestions(type, category, countStr) {
    const exam = { q1: [], q2: [], q3: [], q4: [], q5: [] };

    // 全問題を1つのリストに集約
    let pool = [];
    if (type === "category") {
      if (category === "q1") pool = questionBank.q1_journal;
      else if (category === "q2") pool = questionBank.q2_commercial;
      else if (category === "q3") pool = questionBank.q3_commercial_closing;
      else if (category === "q4") pool = questionBank.q4_industrial;
      else if (category === "q5") pool = questionBank.q5_industrial;
    } else if (type === "random") {
      pool = [
        ...questionBank.q1_journal,
        ...questionBank.q2_commercial,
        ...questionBank.q3_commercial_closing,
        ...questionBank.q4_industrial,
        ...questionBank.q5_industrial
      ];
    } else if (type === "review") {
      const allQuestions = [
        ...questionBank.q1_journal,
        ...questionBank.q2_commercial,
        ...questionBank.q3_commercial_closing,
        ...questionBank.q4_industrial,
        ...questionBank.q5_industrial
      ];
      pool = allQuestions.filter(q => wrongQuestionsHistory.includes(q.id));
      if (pool.length === 0) {
        alert("復習対象の問題（過去に間違えた問題）がありません。全問題から出題します。");
        pool = allQuestions;
      }
    }

    let shuffled = shuffleArray(pool);
    if (countStr !== "all") {
      const cnt = parseInt(countStr, 10);
      shuffled = shuffled.slice(0, cnt);
    }

    // 大問ごとに振り分け
    shuffled.forEach(q => {
      if (questionBank.q1_journal.some(item => item.id === q.id)) exam.q1.push(q);
      else if (questionBank.q2_commercial.some(item => item.id === q.id)) exam.q2.push(q);
      else if (questionBank.q3_commercial_closing.some(item => item.id === q.id)) exam.q3.push(q);
      else if (questionBank.q4_industrial.some(item => item.id === q.id)) exam.q4.push(q);
      else if (questionBank.q5_industrial.some(item => item.id === q.id)) exam.q5.push(q);
    });

    return exam;
  }

  /**
   * プールからランダムに1問抽出（前回と異なるものを優先）
   */
  function pickRandom(pool, prevId) {
    if (!pool || pool.length === 0) return null;
    if (pool.length === 1) return pool[0];

    const filtered = prevId ? pool.filter((q) => q.id !== prevId) : pool;
    const source = filtered.length > 0 ? filtered : pool;
    return source[Math.floor(Math.random() * source.length)];
  }

  /**
   * 第4問: 合計20点になる問題の組み合わせを選択
   */
  function selectQ4(pool, prevQ4Ids) {
    if (!pool || pool.length === 0) return [];

    const combinations = [];

    // パターン1: 20点の単独問題
    pool.forEach((q) => {
      if (q.points === 20) combinations.push([q]);
    });

    // パターン2: 2問の組み合わせで合計20点
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (pool[i].points + pool[j].points === 20) {
          combinations.push([pool[i], pool[j]]);
        }
      }
    }

    if (combinations.length === 0) return [pool[0]]; // フォールバック

    // 前回と異なる組み合わせを優先
    if (prevQ4Ids && combinations.length > 1) {
      const prevSet = prevQ4Ids.sort().join(",");
      const diff = combinations.filter((combo) => {
        return combo.map((q) => q.id).sort().join(",") !== prevSet;
      });
      if (diff.length > 0) {
        return diff[Math.floor(Math.random() * diff.length)];
      }
    }

    return combinations[Math.floor(Math.random() * combinations.length)];
  }

  /**
   * 出題IDのセットを取得（やり直し時の重複回避用）
   */
  function getExamIds(exam) {
    return {
      q1: exam.q1.map((q) => q.id),
      q2: exam.q2[0]?.id,
      q3: exam.q3[0]?.id,
      q4: exam.q4.map((q) => q.id),
      q5: exam.q5[0]?.id,
    };
  }

  // ============================================================
  // タイマー
  // 開始時刻を記録し、経過時間から残りを算出する方式
  // （タブ非アクティブ時の setInterval 遅延に強い）
  // ============================================================

  function startTimer() {
    state.startTime = Date.now();
    updateTimerDisplay();
    state.timerInterval = setInterval(updateTimerDisplay, 250); // 250ms間隔で精度向上
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    const elapsed = Date.now() - state.startTime;
    const remaining = Math.max(0, EXAM_DURATION_MS - elapsed);

    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    const display =
      String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    const timerEl = document.getElementById("timer-display");
    timerEl.textContent = display;

    // 残り10分で赤文字
    if (remaining <= WARNING_THRESHOLD_MS) {
      timerEl.classList.add("warning");
    } else {
      timerEl.classList.remove("warning");
    }

    // 残り0で強制終了 → 未回答は不正解扱い
    if (remaining <= 0) {
      finishExam(true);
    }
  }

  // ============================================================
  // 画面切替
  // ============================================================

  function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");
  }

  // ============================================================
  // 金額入力フィールドの制御
  //  - 数字とハイフン（マイナス）以外は入力不可
  //  - blur時にカンマ付きフォーマット
  //  - focus時にカンマ除去（編集しやすく）
  // ============================================================

  function setupNumberInputs(container) {
    container.querySelectorAll('input[inputmode="numeric"]').forEach((input) => {
      input.addEventListener("input", function () {
        // 数字・ハイフン・カンマ以外を除去
        let val = this.value.replace(/[^\d\-,]/g, "");
        // ハイフンは先頭のみ許可
        const hasLeadingMinus = val.charAt(0) === "-";
        val = val.replace(/-/g, "");
        if (hasLeadingMinus) val = "-" + val;
        this.value = val;
      });

      input.addEventListener("focus", function () {
        // フォーカス時: カンマ除去して生の数値のみ表示
        this.value = this.value.replace(/,/g, "");
      });

      input.addEventListener("blur", function () {
        // フォーカスが外れた時: 3桁区切りカンマにフォーマット
        const raw = this.value.replace(/,/g, "");
        if (raw !== "" && raw !== "-") {
          this.value = formatNumber(raw);
        }
      });
    });
  }

  // ============================================================
  // 回答の保存・復元
  // タブや小問を切り替えても回答が保持されるようにする
  // ============================================================

  /** 現在表示中の問題の回答を state.answers に保存 */
  function saveCurrentAnswers() {
    if (!state || state.isFinished) return;
    const tab = state.currentTab;
    const subQ = state.currentSubQ;

    if (tab === 1) {
      saveQ1Answers(subQ);
    } else {
      const questions = state.exam["q" + tab];
      if (questions && questions[subQ]) {
        saveBigQAnswers(questions[subQ]);
      }
    }
  }

  /** 第1問: 仕訳の各行の入力値を保存 */
  function saveQ1Answers(subIndex) {
    const question = state.exam.q1[subIndex];
    if (!question) return;

    const debitCount = question.answers.filter((a) => a.side === "debit").length;
    const creditCount = question.answers.filter((a) => a.side === "credit").length;
    const rowCount = Math.max(debitCount, creditCount);

    for (let r = 0; r < rowCount; r++) {
      ["debit", "credit"].forEach((side) => {
        const accEl = document.getElementById(
          "q1-" + subIndex + "-" + side + "-" + r + "-account"
        );
        const amtEl = document.getElementById(
          "q1-" + subIndex + "-" + side + "-" + r + "-amount"
        );
        if (accEl) {
          state.answers["q1-" + subIndex + "-" + side + "-" + r + "-account"] =
            accEl.value;
        }
        if (amtEl) {
          state.answers["q1-" + subIndex + "-" + side + "-" + r + "-amount"] =
            amtEl.value.replace(/,/g, "");
        }
      });
    }
  }

  /** 第1問: 保存済み回答をフォームに復元 */
  function restoreQ1Answers(subIndex, rowCount) {
    for (let r = 0; r < rowCount; r++) {
      ["debit", "credit"].forEach((side) => {
        const accKey = "q1-" + subIndex + "-" + side + "-" + r + "-account";
        const amtKey = "q1-" + subIndex + "-" + side + "-" + r + "-amount";
        const accEl = document.getElementById(accKey);
        const amtEl = document.getElementById(amtKey);

        if (accEl && state.answers[accKey] !== undefined) {
          accEl.value = state.answers[accKey];
        }
        if (amtEl && state.answers[amtKey] !== undefined) {
          const val = state.answers[amtKey];
          amtEl.value = val !== "" ? formatNumber(val) : "";
        }
      });
    }
  }

  /** 第2〜5問: 各blankの入力値を保存 */
  function saveBigQAnswers(question) {
    if (!question || !question.answerForm) return;
    question.answerForm.forEach((field) => {
      const el = document.getElementById(field.id);
      if (el) {
        state.answers[field.id] =
          field.type === "number"
            ? el.value.replace(/,/g, "")
            : el.value;
      }
    });
  }

  /** 第2〜5問: 保存済み回答をフォームに復元 */
  function restoreBigQAnswers(question) {
    if (!question || !question.answerForm) return;
    question.answerForm.forEach((field) => {
      const el = document.getElementById(field.id);
      if (el && state.answers[field.id] !== undefined) {
        const val = state.answers[field.id];
        if (field.type === "number") {
          el.value = val !== "" ? formatNumber(val) : "";
        } else {
          el.value = val;
        }
      }
    });
  }

  // ============================================================
  // 回答状況チェック（未回答判定）
  // ============================================================

  /** 第1問の小問が回答済みか（1つでもフィールドに入力があればtrue） */
  function isQ1SubAnswered(subIndex) {
    const question = state.exam.q1[subIndex];
    if (!question) return false;

    const debitCount = question.answers.filter((a) => a.side === "debit").length;
    const creditCount = question.answers.filter((a) => a.side === "credit").length;
    const rowCount = Math.max(debitCount, creditCount);

    for (let r = 0; r < rowCount; r++) {
      for (const side of ["debit", "credit"]) {
        const accVal =
          state.answers["q1-" + subIndex + "-" + side + "-" + r + "-account"];
        const amtVal =
          state.answers["q1-" + subIndex + "-" + side + "-" + r + "-amount"];
        if (accVal && accVal !== "") return true;
        if (amtVal && amtVal !== "") return true;
      }
    }
    return false;
  }

  /** 第2〜5問の小問が回答済みか */
  function isBigQSubAnswered(tabNum, subIndex) {
    const questions = state.exam["q" + tabNum];
    const question = questions ? questions[subIndex] : null;
    if (!question || !question.answerForm) return false;

    for (const field of question.answerForm) {
      const val = state.answers[field.id];
      if (val && val !== "") return true;
    }
    return false;
  }

  /** タブ内に未回答の小問があるか */
  function hasUnansweredInTab(tabNum) {
    if (tabNum === 1) {
      for (let i = 0; i < state.exam.q1.length; i++) {
        if (!isQ1SubAnswered(i)) return true;
      }
      return false;
    }
    const questions = state.exam["q" + tabNum];
    if (!questions) return true;
    for (let i = 0; i < questions.length; i++) {
      if (!isBigQSubAnswered(tabNum, i)) return true;
    }
    return false;
  }

  // ============================================================
  // タブボタンの状態更新
  // ============================================================

  function updateTabButtons() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      const qNum = parseInt(btn.dataset.question);
      btn.classList.toggle("active", qNum === state.currentTab);

      // 未回答マーク（●）の表示/非表示
      const hasUnanswered = hasUnansweredInTab(qNum);
      let mark = btn.querySelector(".unanswered-mark");
      if (hasUnanswered) {
        if (!mark) {
          mark = document.createElement("span");
          mark.className = "unanswered-mark";
          btn.appendChild(mark);
        }
      } else {
        if (mark) mark.remove();
      }
    });
  }

  // ============================================================
  // 問題描画
  // ============================================================

  /** 現在のタブ・小問に応じて問題を描画 */
  function renderCurrentQuestion() {
    saveCurrentAnswers();

    const tab = state.currentTab;
    const subQ = state.currentSubQ;
    const questionArea = document.getElementById("question-area");
    const subNavEl = document.getElementById("sub-question-nav");
    const reviewCheckArea = document.getElementById("review-check-area");
    const subNavButtons = document.getElementById("sub-nav-buttons");

    if (tab === 1) {
      renderQ1(subQ, questionArea, subNavEl, reviewCheckArea, subNavButtons);
    } else {
      renderBigQuestion(
        tab, subQ, state.exam["q" + tab],
        questionArea, subNavEl, reviewCheckArea, subNavButtons
      );
    }

    // トレーニングモード時の解説エリア・ボタン制御
    const actionArea = document.getElementById("training-action-area");
    const explanationArea = document.getElementById("explanation-area");

    if (state.mode === "training") {
      actionArea.style.display = "block";
      const key = "q" + tab + "-" + subQ;
      if (state.checkedQuestions[key]) {
        showSingleExplanation(tab, subQ);
      } else {
        explanationArea.style.display = "none";
      }
    } else {
      actionArea.style.display = "none";
      explanationArea.style.display = "none";
    }

    updateTabButtons();

    // メインエリアをトップにスクロール
    document.getElementById("exam-main").scrollTop = 0;
    window.scrollTo(0, 0);
  }

  // ---- 第1問: 仕訳問題の描画 ----

  function renderQ1(subIndex, questionArea, subNavEl, reviewCheckArea, subNavButtons) {
    const question = state.exam.q1[subIndex];
    if (!question) return;

    const totalSub = state.exam.q1.length;

    // 小問インジケーター（ドット）
    let dotsHTML = "";
    for (let i = 0; i < totalSub; i++) {
      const key = "q1-" + i;
      let cls = "sub-q-dot";
      if (i === subIndex) cls += " active";
      if (isQ1SubAnswered(i)) cls += " answered";
      if (state.reviewFlags[key]) cls += " flagged";
      dotsHTML += '<span class="' + cls + '" data-sub="' + i + '"></span>';
    }

    subNavEl.innerHTML =
      '<span class="sub-q-label">第1問 (' + (subIndex + 1) + ') / 全' + totalSub + '問</span>' +
      '<span class="sub-q-indicator">' + dotsHTML + "</span>";

    // ドットクリックでジャンプ
    subNavEl.querySelectorAll(".sub-q-dot").forEach((dot) => {
      dot.addEventListener("click", function () {
        saveCurrentAnswers();
        state.currentSubQ = parseInt(this.dataset.sub);
        renderCurrentQuestion();
      });
    });

    // 借方・貸方の行数を算出
    const debitEntries = question.answers.filter((a) => a.side === "debit");
    const creditEntries = question.answers.filter((a) => a.side === "credit");
    const rowCount = Math.max(debitEntries.length, creditEntries.length);

    // 仕訳テーブル生成
    // 本番CBT同様、問題ごとに絞り込まれた勘定科目選択肢(choices)を使用
    // 選択肢を動的生成（キャッシュして同じ問題では同じ選択肢を維持）
    if (!state.q1Choices) state.q1Choices = {};
    if (!state.q1Choices[subIndex]) {
      state.q1Choices[subIndex] = generateQ1Choices(question);
    }
    var choiceList = state.q1Choices[subIndex];
    let rowsHTML = "";
    for (let r = 0; r < rowCount; r++) {
      var dAccId = "q1-" + subIndex + "-debit-" + r + "-account";
      var dAmtId = "q1-" + subIndex + "-debit-" + r + "-amount";
      var cAccId = "q1-" + subIndex + "-credit-" + r + "-account";
      var cAmtId = "q1-" + subIndex + "-credit-" + r + "-amount";

      rowsHTML += "<tr>";
      // 借方科目
      rowsHTML += "<td><select id=\"" + dAccId + "\"><option value=\"\">---</option>";
      for (var ai = 0; ai < choiceList.length; ai++) {
        rowsHTML += "<option value=\"" + choiceList[ai] + "\">" + choiceList[ai] + "</option>";
      }
      rowsHTML += "</select></td>";
      // 借方金額
      rowsHTML += "<td><input type=\"text\" id=\"" + dAmtId + "\" inputmode=\"numeric\" placeholder=\"金額\"></td>";
      // 貸方科目
      rowsHTML += "<td><select id=\"" + cAccId + "\"><option value=\"\">---</option>";
      for (var ai2 = 0; ai2 < choiceList.length; ai2++) {
        rowsHTML += "<option value=\"" + choiceList[ai2] + "\">" + choiceList[ai2] + "</option>";
      }
      rowsHTML += "</select></td>";
      // 貸方金額
      rowsHTML += "<td><input type=\"text\" id=\"" + cAmtId + "\" inputmode=\"numeric\" placeholder=\"金額\"></td>";
      rowsHTML += "</tr>";
    }

    questionArea.innerHTML =
      "<h2>第1問 - 仕訳問題 (" + (subIndex + 1) + ")</h2>" +
      '<div class="journal-question-text">' + question.text + "</div>" +
      '<table class="journal-entry-table">' +
      "<thead><tr><th>借方科目</th><th>金額</th><th>貸方科目</th><th>金額</th></tr></thead>" +
      "<tbody>" + rowsHTML + "</tbody></table>";

    // 保存済み回答の復元
    restoreQ1Answers(subIndex, rowCount);

    // 金額入力のフォーマット制御
    setupNumberInputs(questionArea);

    // 見直しチェックボックス
    var reviewKey = "q1-" + subIndex;
    reviewCheckArea.innerHTML =
      "<label><input type=\"checkbox\" id=\"review-" + reviewKey + "\"" +
      (state.reviewFlags[reviewKey] ? " checked" : "") +
      "> あとで見直す</label>";
    document.getElementById("review-" + reviewKey).addEventListener("change", function (e) {
      state.reviewFlags[reviewKey] = e.target.checked;
      updateTabButtons();
    });

    // 前の問題 / 次の問題 ボタン
    subNavButtons.innerHTML =
      '<button id="btn-prev-sub"' + (subIndex === 0 ? " disabled" : "") + ">前の問題</button>" +
      '<button id="btn-next-sub"' + (subIndex === totalSub - 1 ? " disabled" : "") + ">次の問題</button>";

    document.getElementById("btn-prev-sub").addEventListener("click", function () {
      if (state.currentSubQ > 0) {
        saveCurrentAnswers();
        state.currentSubQ--;
        renderCurrentQuestion();
      }
    });
    document.getElementById("btn-next-sub").addEventListener("click", function () {
      if (state.currentSubQ < totalSub - 1) {
        saveCurrentAnswers();
        state.currentSubQ++;
        renderCurrentQuestion();
      }
    });
  }

  // ---- 第2〜5問: contentHTMLベースの問題描画 ----

  function renderBigQuestion(tabNum, subIndex, questions, questionArea, subNavEl, reviewCheckArea, subNavButtons) {
    if (!questions || questions.length === 0) return;
    var totalSub = questions.length;
    var question = questions[subIndex];
    if (!question) return;

    // 小問ナビゲーション
    if (totalSub > 1) {
      var dotsHTML = "";
      for (var i = 0; i < totalSub; i++) {
        var key = "q" + tabNum + "-" + i;
        var cls = "sub-q-dot";
        if (i === subIndex) cls += " active";
        if (isBigQSubAnswered(tabNum, i)) cls += " answered";
        if (state.reviewFlags[key]) cls += " flagged";
        dotsHTML += '<span class="' + cls + '" data-sub="' + i + '"></span>';
      }
      subNavEl.innerHTML =
        '<span class="sub-q-label">第' + tabNum + '問 (' + (subIndex + 1) + ') / 全' + totalSub + '問</span>' +
        '<span class="sub-q-indicator">' + dotsHTML + "</span>";

      subNavEl.querySelectorAll(".sub-q-dot").forEach(function (dot) {
        dot.addEventListener("click", function () {
          saveCurrentAnswers();
          state.currentSubQ = parseInt(this.dataset.sub);
          renderCurrentQuestion();
        });
      });
    } else {
      subNavEl.innerHTML = '<span class="sub-q-label">第' + tabNum + "問</span>";
    }

    // contentHTML内の {{blank:xxx}} を実際の入力要素に置換
    var html = question.contentHTML;
    html = html.replace(/\{\{blank:([^}]+)\}\}/g, function (match, blankId) {
      var formItem = null;
      for (var fi = 0; fi < question.answerForm.length; fi++) {
        if (question.answerForm[fi].id === blankId) {
          formItem = question.answerForm[fi];
          break;
        }
      }
      if (!formItem) return match;

      if (formItem.type === "number") {
        return '<input type="text" id="' + blankId + '" inputmode="numeric" class="blank-input" placeholder="金額">';
      } else if (formItem.type === "select") {
        var opts = formItem.options || accountList;
        var selectHTML = '<select id="' + blankId + '" class="blank-select"><option value="">---</option>';
        for (var oi = 0; oi < opts.length; oi++) {
          selectHTML += '<option value="' + opts[oi] + '">' + opts[oi] + "</option>";
        }
        selectHTML += "</select>";
        return selectHTML;
      }
      return match;
    });

    questionArea.innerHTML =
      "<h2>第" + tabNum + "問</h2>" +
      '<p style="margin-bottom:12px; font-weight:600;">' + question.title + "</p>" +
      html;

    // 保存済み回答の復元
    restoreBigQAnswers(question);

    // 金額入力のフォーマット制御
    setupNumberInputs(questionArea);

    // 見直しチェックボックス
    var reviewKey = "q" + tabNum + "-" + subIndex;
    reviewCheckArea.innerHTML =
      "<label><input type=\"checkbox\" id=\"review-" + reviewKey + "\"" +
      (state.reviewFlags[reviewKey] ? " checked" : "") +
      "> あとで見直す</label>";
    document.getElementById("review-" + reviewKey).addEventListener("change", function (e) {
      state.reviewFlags[reviewKey] = e.target.checked;
      updateTabButtons();
    });

    // 前の問題 / 次の問題 ボタン（小問が2問以上の場合のみ）
    if (totalSub > 1) {
      subNavButtons.innerHTML =
        '<button id="btn-prev-sub"' + (subIndex === 0 ? " disabled" : "") + ">前の問題</button>" +
        '<button id="btn-next-sub"' + (subIndex === totalSub - 1 ? " disabled" : "") + ">次の問題</button>";

      document.getElementById("btn-prev-sub").addEventListener("click", function () {
        if (state.currentSubQ > 0) {
          saveCurrentAnswers();
          state.currentSubQ--;
          renderCurrentQuestion();
        }
      });
      document.getElementById("btn-next-sub").addEventListener("click", function () {
        if (state.currentSubQ < totalSub - 1) {
          saveCurrentAnswers();
          state.currentSubQ++;
          renderCurrentQuestion();
        }
      });
    } else {
      subNavButtons.innerHTML = "";
    }
  }
  // 単問採点・解説表示（トレーニングモード用）
  // ============================================================

  function showSingleExplanation(tabNum, subIndex) {
    saveCurrentAnswers();
    const key = "q" + tabNum + "-" + subIndex;
    state.checkedQuestions[key] = true;

    const explanationArea = document.getElementById("explanation-area");
    explanationArea.style.display = "block";

    let isCorrect = false;
    let question = null;
    let expText = "";

    if (tabNum === 1) {
      question = state.exam.q1[subIndex];
      if (question) {
        const correctDebits = question.answers.filter((a) => a.side === "debit");
        const correctCredits = question.answers.filter((a) => a.side === "credit");
        const rowCount = Math.max(correctDebits.length, correctCredits.length);

        const userDebits = [];
        const userCredits = [];
        for (let r = 0; r < rowCount; r++) {
          const dAcc = state.answers["q1-" + subIndex + "-debit-" + r + "-account"] || "";
          const dAmt = parseAmount(state.answers["q1-" + subIndex + "-debit-" + r + "-amount"]);
          if (dAcc !== "" && !isNaN(dAmt)) userDebits.push({ account: dAcc, amount: dAmt });

          const cAcc = state.answers["q1-" + subIndex + "-credit-" + r + "-account"] || "";
          const cAmt = parseAmount(state.answers["q1-" + subIndex + "-credit-" + r + "-amount"]);
          if (cAcc !== "" && !isNaN(cAmt)) userCredits.push({ account: cAcc, amount: cAmt });
        }

        isCorrect = matchEntries(userDebits, correctDebits) && matchEntries(userCredits, correctCredits);
        expText = question.explanation || "解説はありません。";
      }
    } else {
      const questions = state.exam["q" + tabNum];
      question = questions ? questions[subIndex] : null;
      if (question && question.answerForm) {
        let allCorrect = true;
        question.answerForm.forEach((field) => {
          const userAnswer = state.answers[field.id] || "";
          if (field.type === "number") {
            const userNum = parseAmount(userAnswer);
            if (isNaN(userNum) || userNum !== field.correctAnswer) allCorrect = false;
          } else {
            if (userAnswer !== field.correctAnswer) allCorrect = false;
          }
        });
        isCorrect = allCorrect;
        expText = question.explanation || "解説はありません。";
      }
    }

    if (question && !isCorrect) {
      if (!wrongQuestionsHistory.includes(question.id)) {
        wrongQuestionsHistory.push(question.id);
      }
    }

    explanationArea.innerHTML =
      '<div class="explanation-title ' + (isCorrect ? "correct" : "incorrect") + '">' +
      (isCorrect ? "【正解 ✓】" : "【不正解 ✗】") + "</div>" +
      '<div class="explanation-text">' + expText + "</div>";
  }

  // ============================================================
  // 見直し一覧モーダル
  // ============================================================

  function renderReviewList() {
    var listBody = document.getElementById("review-list-body");
    var html = "";

    var qLabels = {
      1: "仕訳問題",
      2: "商業簿記 個別",
      3: "商業簿記 決算",
      4: "工業簿記",
      5: "工業簿記 総合",
    };

    for (var q = 1; q <= 5; q++) {
      html += '<div class="review-list-section">';
      html += '<div class="review-list-section-title">第' + q + "問 - " + qLabels[q] + "</div>";

      var questions;
      if (q === 1) {
        questions = state.exam.q1;
        for (var i = 0; i < questions.length; i++) {
          html += buildReviewItem(q, i, "問" + (i + 1));
        }
      } else {
        questions = state.exam["q" + q];
        for (var j = 0; j < questions.length; j++) {
          var label = questions.length > 1 ? "問" + (j + 1) : "問題";
          html += buildReviewItem(q, j, label);
        }
      }
      html += "</div>";
    }

    listBody.innerHTML = html;

    // クリックで該当箇所にジャンプ
    listBody.querySelectorAll(".review-list-item").forEach(function (item) {
      item.addEventListener("click", function () {
        saveCurrentAnswers();
        state.currentTab = parseInt(this.dataset.tab);
        state.currentSubQ = parseInt(this.dataset.sub);
        closeModal("modal-review");
        renderCurrentQuestion();
      });
    });
  }

  function buildReviewItem(tabNum, subIndex, label) {
    var key = "q" + tabNum + "-" + subIndex;
    var answered =
      tabNum === 1
        ? isQ1SubAnswered(subIndex)
        : isBigQSubAnswered(tabNum, subIndex);
    var flagged = state.reviewFlags[key] || false;

    var statusClass, statusText;
    if (flagged) {
      statusClass = "status-flagged";
      statusText = "見直し";
    } else if (answered) {
      statusClass = "status-answered";
      statusText = "回答済";
    } else {
      statusClass = "status-unanswered";
      statusText = "未回答";
    }

    return (
      '<div class="review-list-item" data-tab="' + tabNum + '" data-sub="' + subIndex + '">' +
      '<span class="review-list-item-label">' + label + "</span>" +
      '<span class="review-list-item-status ' + statusClass + '">' + statusText + "</span>" +
      "</div>"
    );
  }

  // ============================================================
  // モーダル管理
  // ============================================================

  function openModal(id) {
    document.getElementById(id).classList.add("active");
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove("active");
  }

  // ============================================================
  // 採点処理
  // ============================================================

  /**
   * 試験を終了し採点を実行
   * @param {boolean} forced - true=タイマー切れによる強制終了
   */
  function finishExam(forced) {
    if (state.isFinished) return;
    state.isFinished = true;

    stopTimer();
    saveCurrentAnswers();
    closeModal("modal-confirm-finish");

    var results = gradeExam();
    renderResults(results);
    showScreen("screen-result");
  }

  /** 全体の採点を実行 */
  function gradeExam() {
    var results = {
      q1: gradeQ1(),
      q2: gradeBigQ(2),
      q3: gradeBigQ(3),
      q4: gradeBigQ(4),
      q5: gradeBigQ(5),
      total: 0,
      passed: false,
    };

    results.total =
      results.q1.score + results.q2.score + results.q3.score +
      results.q4.score + results.q5.score;
    results.passed = results.total >= 70;

    return results;
  }

  /**
   * 第1問 採点:
   * 借方・貸方それぞれの行を順不同でマッチングする。
   * 全行が過不足なく一致して初めて正解（部分点なし）。
   */
  function gradeQ1() {
    var result = {
      score: 0,
      maxScore: Q1_COUNT * Q1_POINTS,
      details: [],
    };

    for (var i = 0; i < state.exam.q1.length; i++) {
      var question = state.exam.q1[i];
      var correctDebits = question.answers.filter(function (a) { return a.side === "debit"; });
      var correctCredits = question.answers.filter(function (a) { return a.side === "credit"; });
      var rowCount = Math.max(correctDebits.length, correctCredits.length);

      // ユーザーの回答を収集（空行は除外）
      var userDebits = [];
      var userCredits = [];

      for (var r = 0; r < rowCount; r++) {
        // 借方
        var dAcc = state.answers["q1-" + i + "-debit-" + r + "-account"] || "";
        var dAmtRaw = state.answers["q1-" + i + "-debit-" + r + "-amount"] || "";
        var dAmt = parseAmount(dAmtRaw);
        if (dAcc !== "" && !isNaN(dAmt)) {
          userDebits.push({ account: dAcc, amount: dAmt });
        }

        // 貸方
        var cAcc = state.answers["q1-" + i + "-credit-" + r + "-account"] || "";
        var cAmtRaw = state.answers["q1-" + i + "-credit-" + r + "-amount"] || "";
        var cAmt = parseAmount(cAmtRaw);
        if (cAcc !== "" && !isNaN(cAmt)) {
          userCredits.push({ account: cAcc, amount: cAmt });
        }
      }

      // 順不同マッチング
      var debitOK = matchEntries(userDebits, correctDebits);
      var creditOK = matchEntries(userCredits, correctCredits);
      var isCorrect = debitOK && creditOK;
      var points = isCorrect ? Q1_POINTS : 0;
      result.score += points;

      if (!isCorrect && !wrongQuestionsHistory.includes(question.id)) {
        wrongQuestionsHistory.push(question.id);
      }

      result.details.push({
        question: question,
        userDebits: userDebits,
        userCredits: userCredits,
        isCorrect: isCorrect,
        points: points,
        maxPoints: Q1_POINTS,
      });
    }

    return result;
  }

  /**
   * 仕訳エントリの順不同マッチング
   * ユーザーの回答と正解の行数が同じ、かつ全行が1対1で一致すればtrue
   */
  function matchEntries(userEntries, correctEntries) {
    if (userEntries.length !== correctEntries.length) return false;

    var remaining = [];
    for (var c = 0; c < correctEntries.length; c++) {
      remaining.push({
        account: correctEntries[c].account,
        amount: correctEntries[c].amount,
      });
    }

    for (var u = 0; u < userEntries.length; u++) {
      var found = false;
      for (var r = 0; r < remaining.length; r++) {
        if (
          remaining[r].account === userEntries[u].account &&
          remaining[r].amount === userEntries[u].amount
        ) {
          remaining.splice(r, 1);
          found = true;
          break;
        }
      }
      if (!found) return false;
    }

    return remaining.length === 0;
  }

  /**
   * 第2〜5問 採点:
   * answerForm内の各blank単位で正誤判定し、
   * 正解したblankのpointsを積算する（部分点あり）。
   */
  function gradeBigQ(tabNum) {
    var questions = state.exam["q" + tabNum];
    var result = {
      score: 0,
      maxScore: 20,
      details: [],
    };

    if (!questions) return result;

    for (var qi = 0; qi < questions.length; qi++) {
      var question = questions[qi];
      if (!question || !question.answerForm) continue;

      var blanks = [];
      for (var fi = 0; fi < question.answerForm.length; fi++) {
        var field = question.answerForm[fi];
        var userAnswer = state.answers[field.id] || "";
        var isCorrect = false;

        if (field.type === "number") {
          // カンマ除去してintで比較
          var userNum = parseAmount(userAnswer);
          isCorrect = !isNaN(userNum) && userNum === field.correctAnswer;
        } else {
          // 文字列完全一致
          isCorrect = userAnswer === field.correctAnswer;
        }

        var earnedPoints = isCorrect ? field.points : 0;
        result.score += earnedPoints;

        blanks.push({
          id: field.id,
          type: field.type,
          userAnswer: userAnswer,
          correctAnswer: field.correctAnswer,
          isCorrect: isCorrect,
          points: field.points,
          earnedPoints: earnedPoints,
        });
      }

      var hasError = blanks.some(b => !b.isCorrect);
      if (hasError && !wrongQuestionsHistory.includes(question.id)) {
        wrongQuestionsHistory.push(question.id);
      }

      result.details.push({
        question: question,
        blanks: blanks,
      });
    }

    return result;
  }

  // ============================================================
  // 採点結果画面の描画
  // ============================================================

  function renderResults(results) {
    // ---- 合計得点 & 合否判定 ----
    var summaryEl = document.getElementById("result-summary");
    summaryEl.innerHTML =
      '<div class="result-total-score">' + results.total + ' <span>/ 100点</span></div>' +
      '<div class="result-pass ' + (results.passed ? "pass" : "fail") + '">' +
      (results.passed ? "合格" : "不合格") +
      "</div>";

    // ---- 大問ごとの得点 ----
    var breakdownEl = document.getElementById("result-breakdown");
    var qLabels = ["仕訳問題", "商業簿記 個別", "商業簿記 決算", "工業簿記", "工業簿記 総合"];
    var bRows = "";
    for (var q = 1; q <= 5; q++) {
      var r = results["q" + q];
      var pct = Math.round((r.score / r.maxScore) * 100);
      var barW = Math.max(pct * 0.8, 0);
      bRows +=
        "<tr>" +
        "<th>第" + q + "問 " + qLabels[q - 1] + "</th>" +
        '<td class="score-cell">' + r.score + "点</td>" +
        "<td>" + r.maxScore + "点</td>" +
        "<td>" +
        '<span class="result-breakdown-bar" style="width:' + barW + 'px"></span>' +
        pct + "%" +
        "</td></tr>";
    }
    breakdownEl.innerHTML =
      "<h2>大問別得点</h2>" +
      '<table class="result-breakdown-table">' +
      "<thead><tr><th>大問</th><th>得点</th><th>配点</th><th>達成率</th></tr></thead>" +
      "<tbody>" + bRows + "</tbody></table>";

    // ---- 詳細: 不正解箇所のハイライト ----
    var detailsEl = document.getElementById("result-details");
    var detailsHTML = "";

    // 第1問
    detailsHTML += renderQ1ResultDetails(results.q1);

    // 第2〜5問
    for (var dq = 2; dq <= 5; dq++) {
      detailsHTML += renderBigQResultDetails(dq, results["q" + dq]);
    }

    detailsEl.innerHTML = detailsHTML;
  }

  /** 第1問の詳細結果を描画 */
  function renderQ1ResultDetails(q1Result) {
    var html = '<div class="result-detail-section">';
    html += "<h3>第1問 - 仕訳問題（1問" + Q1_POINTS + "点 × " + Q1_COUNT + "問 = " + (Q1_COUNT * Q1_POINTS) + "点）</h3>";

    for (var i = 0; i < q1Result.details.length; i++) {
      var detail = q1Result.details[i];
      var statusColor = detail.isCorrect ? "#2e7d32" : "#c62828";
      var statusText = detail.isCorrect ? "正解 ✓" : "不正解 ✗";

      html += "<h4>問" + (i + 1) + ": " + escapeHtml(detail.question.text) +
        ' <span class="result-points-badge">' + detail.points + "/" + detail.maxPoints + "点</span>" +
        ' <span style="color:' + statusColor + '; font-weight:600; margin-left:8px;">' + statusText + "</span></h4>";

      if (!detail.isCorrect) {
        // ユーザーの解答
        html += '<p style="font-size:0.82rem; color:#666; margin-bottom:4px;"><strong>あなたの解答:</strong></p>';
        html += renderJournalResult(detail.userDebits, detail.userCredits, "result-incorrect");

        // 正解
        var corrD = detail.question.answers.filter(function (a) { return a.side === "debit"; });
        var corrC = detail.question.answers.filter(function (a) { return a.side === "credit"; });
        html += '<p style="font-size:0.82rem; color:#666; margin:8px 0 4px;"><strong>正解:</strong></p>';
        html += renderJournalResult(corrD, corrC, "result-correct");
      }

      if (detail.question.explanation) {
        html += '<div class="explanation-text" style="margin-top:8px;">' + escapeHtml(detail.question.explanation) + '</div>';
      }
    }

    html += "</div>";
    return html;
  }

  /** 仕訳結果テーブルを描画 */
  function renderJournalResult(debits, credits, bgClass) {
    var rowCount = Math.max(debits.length, credits.length);
    if (rowCount === 0) rowCount = 1;

    var html =
      '<table class="result-journal-table">' +
      "<thead><tr><th>借方科目</th><th>金額</th><th>貸方科目</th><th>金額</th></tr></thead><tbody>";

    for (var r = 0; r < rowCount; r++) {
      html += '<tr class="' + bgClass + '">';
      if (r < debits.length) {
        var dAcc = debits[r].account || "—";
        var dAmt = isNaN(debits[r].amount) ? "—" : debits[r].amount.toLocaleString();
        html += "<td>" + escapeHtml(dAcc) + "</td><td>" + dAmt + "</td>";
      } else {
        html += "<td>—</td><td>—</td>";
      }
      if (r < credits.length) {
        var cAcc = credits[r].account || "—";
        var cAmt = isNaN(credits[r].amount) ? "—" : credits[r].amount.toLocaleString();
        html += "<td>" + escapeHtml(cAcc) + "</td><td>" + cAmt + "</td>";
      } else {
        html += "<td>—</td><td>—</td>";
      }
      html += "</tr>";
    }

    html += "</tbody></table>";
    return html;
  }

  /** 第2〜5問の詳細結果を描画 */
  function renderBigQResultDetails(tabNum, result) {
    var qLabels = {
      2: "商業簿記 個別",
      3: "商業簿記 決算",
      4: "工業簿記",
      5: "工業簿記 総合",
    };

    var html = '<div class="result-detail-section">';
    html += "<h3>第" + tabNum + "問 - " + qLabels[tabNum] + "（" + result.maxScore + "点）</h3>";

    for (var qi = 0; qi < result.details.length; qi++) {
      var detail = result.details[qi];

      if (result.details.length > 1) {
        html += "<h4>" + escapeHtml(detail.question.title) + "</h4>";
      }

      html += '<table class="result-journal-table">';
      html += "<thead><tr><th>解答欄</th><th>あなたの解答</th><th>正解</th><th>配点</th><th>結果</th></tr></thead>";
      html += "<tbody>";

      for (var bi = 0; bi < detail.blanks.length; bi++) {
        var blank = detail.blanks[bi];

        // 0点のblank（採点対象外の補助欄）はスキップしない、表示はする
        var bgClass = blank.isCorrect ? "result-correct" : "result-incorrect";

        var userDisplay;
        if (blank.userAnswer === "") {
          userDisplay = "（未回答）";
        } else if (blank.type === "number") {
          userDisplay = formatNumber(blank.userAnswer);
        } else {
          userDisplay = escapeHtml(blank.userAnswer);
        }

        var correctDisplay;
        if (blank.type === "number") {
          correctDisplay = blank.correctAnswer.toLocaleString();
        } else {
          correctDisplay = escapeHtml(String(blank.correctAnswer));
        }

        var resultMark = blank.isCorrect ? "○" : "×";
        // 0点の欄は採点表示を変える
        if (blank.points === 0) {
          bgClass = blank.isCorrect ? "result-correct" : "result-incorrect";
          resultMark = blank.isCorrect ? "○" : "×";
        }

        html += '<tr class="' + bgClass + '">';
        html += "<td>" + blank.id + "</td>";
        html += '<td class="' + (blank.isCorrect ? "result-answer-correct" : "result-answer-yours") + '">' + userDisplay + "</td>";
        html += '<td class="result-answer-correct">' + correctDisplay + "</td>";
        html += "<td>" + blank.points + "点</td>";
        html += '<td style="font-weight:600">' + resultMark + "</td>";
        html += "</tr>";
      }

      html += "</tbody></table>";

      if (detail.question.explanation) {
        html += '<div class="explanation-text" style="margin-top:8px;">' + escapeHtml(detail.question.explanation) + '</div>';
      }
    }

    html += "</div>";
    return html;
  }

  /** HTMLエスケープ */
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ============================================================
  // 初期化・リセット
  // ============================================================

  /** 試験を開始（問題抽出 → 画面切替 → タイマー開始） */
  function initExam(prevIds) {
    state = createInitialState();
    state.exam = selectQuestions(prevIds);

    // やり直し時の重複回避用にIDを保持
    previousExamIds = getExamIds(state.exam);

    showScreen("screen-exam");
    state.currentTab = 1;
    state.currentSubQ = 0;
    renderCurrentQuestion();
    startTimer();
  }

  /** 新しい問題でテストをやり直す */
  /** トレーニングを開始 */
  function initTraining(type, category, countStr) {
    state = createInitialState();
    state.mode = "training";
    state.exam = selectTrainingQuestions(type, category, countStr);

    showScreen("screen-exam");
    // 最初に問題が存在する大問を探す
    for (let q = 1; q <= 5; q++) {
      if (state.exam["q" + q] && state.exam["q" + q].length > 0) {
        state.currentTab = q;
        break;
      }
    }
    state.currentSubQ = 0;
    renderCurrentQuestion();
    startTimer();
  }

  function resetExam() {
    var prevIds = previousExamIds;
    stopTimer();

    // タイマー表示リセット
    var timerEl = document.getElementById("timer-display");
    timerEl.textContent = "90:00";
    timerEl.classList.remove("warning");

    initExam(prevIds);
  }

  /** ホーム画面に戻る（テスト中断・破棄） */
  function returnToHome() {
    stopTimer();
    state = null;
    closeModal("modal-confirm-home");

    // タイマー表示リセット
    var timerEl = document.getElementById("timer-display");
    if (timerEl) {
      timerEl.textContent = "90:00";
      timerEl.classList.remove("warning");
    }

    showScreen("screen-start");
  }

  // ============================================================
  // イベントリスナーの設定
  // ============================================================

  function setupEventListeners() {
    // ---- ホームボタン（中断ダイアログ表示） ----
    const btnHome = document.getElementById("btn-home");
    if (btnHome) {
      btnHome.addEventListener("click", function () {
        if (state && !state.isFinished) {
          openModal("modal-confirm-home");
        } else {
          returnToHome();
        }
      });
    }

    // ---- ホーム確認ダイアログのボタン ----
    const btnHomeConfirm = document.getElementById("btn-home-confirm");
    const btnHomeCancel = document.getElementById("btn-home-cancel");
    if (btnHomeConfirm) {
      btnHomeConfirm.addEventListener("click", function () {
        returnToHome();
      });
    }
    if (btnHomeCancel) {
      btnHomeCancel.addEventListener("click", function () {
        closeModal("modal-confirm-home");
      });
    }

    // ---- 採点結果画面のホームボタン ----
    const btnResultHome = document.getElementById("btn-result-home");
    if (btnResultHome) {
      btnResultHome.addEventListener("click", function () {
        returnToHome();
      });
    }

    // ---- モード切り替えタブ ----
    const tabExam = document.getElementById("tab-mode-exam");
    const tabTraining = document.getElementById("tab-mode-training");
    const panelExam = document.getElementById("panel-mode-exam");
    const panelTraining = document.getElementById("panel-mode-training");

    if (tabExam && tabTraining) {
      tabExam.addEventListener("click", function () {
        tabExam.classList.add("active");
        tabTraining.classList.remove("active");
        panelExam.classList.add("active");
        panelTraining.classList.remove("active");
      });

      tabTraining.addEventListener("click", function () {
        tabTraining.classList.add("active");
        tabExam.classList.remove("active");
        panelTraining.classList.add("active");
        panelExam.classList.remove("active");
      });
    }

    // トレーニング条件プルダウンの動的表示切替
    const typeSelect = document.getElementById("training-type-select");
    const groupCategory = document.getElementById("group-category-select");
    if (typeSelect && groupCategory) {
      typeSelect.addEventListener("change", function () {
        groupCategory.style.display = this.value === "category" ? "block" : "none";
      });
    }

    // ---- スタート画面: 試験を開始する ----
    document.getElementById("btn-start-exam").addEventListener("click", function () {
      initExam(null);
    });

    // ---- スタート画面: トレーニングを開始する ----
    const btnStartTraining = document.getElementById("btn-start-training");
    if (btnStartTraining) {
      btnStartTraining.addEventListener("click", function () {
        const type = document.getElementById("training-type-select").value;
        const category = document.getElementById("training-category-select").value;
        const count = document.getElementById("training-count-select").value;
        initTraining(type, category, count);
      });
    }

    // ---- 単問：回答・解説ボタン ----
    const btnCheckAnswer = document.getElementById("btn-check-answer");
    if (btnCheckAnswer) {
      btnCheckAnswer.addEventListener("click", function () {
        showSingleExplanation(state.currentTab, state.currentSubQ);
      });
    }

    // ---- タブ切替ボタン（第1問〜第5問） ----
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (state && !state.isFinished) {
          saveCurrentAnswers();
          state.currentTab = parseInt(this.dataset.question);
          state.currentSubQ = 0;
          renderCurrentQuestion();
        }
      });
    });

    // ---- 試験終了ボタン → 確認ダイアログ ----
    document.getElementById("btn-finish-exam").addEventListener("click", function () {
      if (state && !state.isFinished) {
        openModal("modal-confirm-finish");
      }
    });

    // ---- 確認ダイアログ: 試験を終了する / 戻る ----
    document.getElementById("btn-confirm-finish").addEventListener("click", function () {
      finishExam(false);
    });
    document.getElementById("btn-confirm-cancel").addEventListener("click", function () {
      closeModal("modal-confirm-finish");
    });

    // ---- 見直し一覧ボタン ----
    document.getElementById("btn-review-list").addEventListener("click", function () {
      if (state && !state.isFinished) {
        saveCurrentAnswers();
        renderReviewList();
        openModal("modal-review");
      }
    });

    // ---- 見直し一覧モーダル: 閉じるボタン ----
    document.getElementById("btn-close-review").addEventListener("click", function () {
      closeModal("modal-review");
    });
    document.getElementById("btn-close-review-bottom").addEventListener("click", function () {
      closeModal("modal-review");
    });

    // ---- 採点結果画面: 新しい問題でテストをやり直す ----
    document.getElementById("btn-retry").addEventListener("click", function () {
      resetExam();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupEventListeners);
  } else {
    setupEventListeners();
  }
})();
