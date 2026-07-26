/* ================================================================
   簿記2級 CBT模擬試験 - マスターデータ (data.js)
   
   【永続化方針】
   このファイルは問題プールと勘定科目マスタを定義するのみ。
   localStorage等への保存は一切行わない。
   
   【問題の追加方法】
   各プール配列（q1_journal, q2_commercial, ...）に同じ構造の
   オブジェクトを追加するだけで出題候補に含まれます。
   - 第1問: answers配列にdebit/creditの行を定義
   - 第2〜5問: contentHTML内に {{blank:id}} プレースホルダを埋め込み、
     answerFormで各blankの正解・配点を定義（合計20点になるように）
   ================================================================ */

// ================================================================
// 勘定科目マスタ（共通プルダウン用）
// ================================================================
const accountList = [
  // 資産
  "現金", "当座預金", "普通預金", "定期預金",
  "受取手形", "売掛金", "クレジット売掛金", "電子記録債権",
  "有価証券", "売買目的有価証券", "満期保有目的債券",
  "その他有価証券", "子会社株式", "関連会社株式",
  "商品", "製品", "仕掛品", "原材料",
  "前払金", "前払費用", "未収入金", "未収収益",
  "貸倒引当金", "建物", "備品", "車両運搬具",
  "機械装置", "土地", "建設仮勘定",
  "のれん", "特許権", "ソフトウェア",
  "建物減価償却累計額", "備品減価償却累計額",
  "車両運搬具減価償却累計額", "機械装置減価償却累計額",
  "仮払金", "仮払法人税等", "仮払消費税",
  // 負債
  "支払手形", "買掛金", "電子記録債務",
  "短期借入金", "長期借入金", "未払金", "未払費用",
  "未払法人税等", "未払消費税", "未払配当金", "前受金", "前受収益",
  "預り金", "当座借越", "繰越商品",
  "仮受金", "仮受消費税",
  "賞与引当金", "修繕引当金", "退職給付引当金",
  "商品保証引当金", "返品調整引当金",
  "社債",
  // 純資産
  "資本金", "資本準備金", "その他資本剰余金",
  "利益準備金", "別途積立金", "繰越利益剰余金",
  "自己株式",
  // 収益
  "売上", "商品売買益", "受取利息", "受取配当金",
  "有価証券利息", "有価証券売却益", "有価証券評価益",
  "固定資産売却益",
  "為替差益", "雑益", "雑収入",
  "貸倒引当金戻入", "償却債権取立益",
  "負ののれん発生益",
  // 費用
  "仕入", "発送費", "給料", "法定福利費",
  "広告宣伝費", "旅費交通費", "通信費", "消耗品費",
  "水道光熱費", "支払家賃", "保険料", "修繕費",
  "租税公課", "支払利息", "手形売却損",
  "貸倒引当金繰入", "貸倒損失",
  "減価償却費", "のれん償却",
  "有価証券売却損", "有価証券評価損",
  "固定資産売却損", "固定資産圧縮損",
  "為替差損", "雑損", "雑損失",
  "棚卸減耗損", "商品評価損",
  "法人税等", "法人税、住民税及び事業税",
  // 工業簿記特有
  "材料", "賃金", "賃金・給料",
  "製造間接費", "仕掛品", "製品",
  "月次損益",
  "賃率差異", "材料消費価格差異",
  "製造間接費配賦差異", "予算差異", "操業度差異",
  // その他
  "損益", "繰越利益剰余金", "受取手形割引義務見返", "受取手形割引義務",
  "差入保証金", "長期前払費用",
  "研究開発費", "ソフトウェア仮勘定",
  "株式交付費", "社債発行費",
  "支払手数料"
];


// ================================================================
// 混同しやすい勘定科目グループ（ダミー選択肢の動的生成用）
//
// 同じグループ内の科目は、受験生が間違えやすい組み合わせ。
// app.js が正解科目の属するグループからダミーを自動抽出する。
// 1つの科目が複数グループに属してもよい（多角的な混同パターン）。
// ================================================================
const confusableGroups = [
  // 現金・預金系
  ["現金", "当座預金", "普通預金", "定期預金", "当座借越"],
  // 売上債権系
  ["売掛金", "受取手形", "電子記録債権", "クレジット売掛金", "未収入金"],
  // 仕入債務系
  ["買掛金", "支払手形", "電子記録債務", "未払金", "未払費用"],
  // 売掛金 ⇔ 買掛金（借方貸方の混同）
  ["売掛金", "買掛金"],
  // 受取手形 ⇔ 支払手形
  ["受取手形", "支払手形"],
  // 電子記録債権 ⇔ 電子記録債務
  ["電子記録債権", "電子記録債務"],
  // 売上・仕入の混同
  ["売上", "仕入", "売掛金", "買掛金", "前受金", "前払金"],
  // 前払・前受・未払・未収の経過勘定
  ["前払金", "前払費用", "前受金", "前受収益", "未払金", "未払費用", "未収入金", "未収収益"],
  // 保険料・家賃と経過勘定
  ["保険料", "支払家賃", "前払費用", "未払費用", "長期前払費用"],
  // 貸倒関連
  ["貸倒引当金", "貸倒引当金繰入", "貸倒引当金戻入", "貸倒損失", "償却債権取立益"],
  // 固定資産
  ["建物", "備品", "車両運搬具", "機械装置", "土地", "建設仮勘定"],
  // 減価償却
  ["減価償却費", "建物減価償却累計額", "備品減価償却累計額", "車両運搬具減価償却累計額", "機械装置減価償却累計額"],
  // 固定資産売却損益
  ["固定資産売却益", "固定資産売却損", "固定資産圧縮損"],
  // 有価証券の種類
  ["売買目的有価証券", "満期保有目的債券", "その他有価証券", "子会社株式", "関連会社株式"],
  // 有価証券損益
  ["有価証券売却益", "有価証券売却損", "有価証券評価益", "有価証券評価損", "有価証券利息"],
  // 社債関連
  ["社債", "社債発行費", "長期借入金", "短期借入金", "支払利息"],
  // 発行費系
  ["社債発行費", "株式交付費", "支払手数料"],
  // 純資産（株主資本）
  ["資本金", "資本準備金", "その他資本剰余金", "利益準備金", "別途積立金", "繰越利益剰余金", "自己株式"],
  // 配当関連
  ["未払配当金", "未払金", "未払費用", "繰越利益剰余金"],
  // 利息
  ["受取利息", "支払利息", "受取配当金", "有価証券利息"],
  // 未収入金 ⇔ 未払金
  ["未収入金", "未払金", "未収収益", "未払費用"],
  // 仮勘定
  ["仮払金", "仮受金", "仮払法人税等", "仮払消費税", "仮受消費税"],
  // 発送費・運賃系
  ["発送費", "通信費", "旅費交通費", "消耗品費", "広告宣伝費"],
  // 引当金系
  ["賞与引当金", "修繕引当金", "退職給付引当金", "商品保証引当金", "貸倒引当金"],
  // 工業簿記
  ["材料", "賃金", "賃金・給料", "仕掛品", "製品", "製造間接費"],
  // のれん
  ["のれん", "のれん償却", "負ののれん発生益"],
  // 法人税等
  ["法人税等", "法人税、住民税及び事業税", "仮払法人税等", "未払法人税等"],
  // 棚卸関連
  ["商品", "繰越商品", "棚卸減耗損", "商品評価損"],
];


// ================================================================
// 問題プール
// ================================================================
const questionBank = {

  // ============================================================
  // 第1問: 仕訳問題（1問4点 × 5問 = 20点）
  // answers配列: side="debit"(借方) / "credit"(貸方)
  // 採点は順不同マッチング（部分点なし、全一致で4点）
  // ============================================================
  q1_journal: [
    {
      id: "q1-001",
      text: "商品￥200,000を掛けで売り上げた。",
      explanation: "【解説】商品を売り上げ代金を掛けとした場合、売上の増加（収益の発生）として貸方に「売上」、売掛金の増加（資産の増加）として借方に「売掛金」を計上します。",
      answers: [
        { side: "debit", account: "売掛金", amount: 200000 },
        { side: "credit", account: "売上", amount: 200000 }
      ]
    },
    {
      id: "q1-002",
      text: "商品￥150,000を掛けで仕入れた。",
      explanation: "【解説】商品を仕入れ代金を掛けとした場合、仕入の増加（費用の発生）として借方に「仕入」、買掛金の増加（負債の増加）として貸方に「買掛金」を計上します。",
      answers: [
        { side: "debit", account: "仕入", amount: 150000 },
        { side: "credit", account: "買掛金", amount: 150000 }
      ]
    },
    {
      id: "q1-003",
      text: "買掛金￥100,000を当座預金から支払った。",
      explanation: "【解説】買掛金を当座預金から支払った場合、買掛金の減少（負債の減少）として借方に「買掛金」、当座預金の減少（資産の減少）として貸方に「当座預金」を計上します。",
      answers: [
        { side: "debit", account: "買掛金", amount: 100000 },
        { side: "credit", account: "当座預金", amount: 100000 }
      ]
    },
    {
      id: "q1-004",
      text: "売掛金￥300,000が普通預金口座に振り込まれた。",
      explanation: "【解説】売掛金の回収により普通預金の増加（資産の増加）として借方に「普通預金」、売掛金の減少（資産の減少）として貸方に「売掛金」を計上します。",
      answers: [
        { side: "debit", account: "普通預金", amount: 300000 },
        { side: "credit", account: "売掛金", amount: 300000 }
      ]
    },
    {
      id: "q1-005",
      text: "備品￥500,000を購入し、代金は月末に支払うこととした。",
      explanation: "【解説】商品以外の資産（備品）を購入した後払い代金は、買掛金ではなく「未払金」（負債の増加）で処理します。",
      answers: [
        { side: "debit", account: "備品", amount: 500000 },
        { side: "credit", account: "未払金", amount: 500000 }
      ]
    },
    {
      id: "q1-006",
      text: "売買目的で保有していたA社株式（帳簿価額￥180,000）を￥200,000で売却し、代金は当座預金に振り込まれた。",
      explanation: "【解説】売買目的有価証券の売却額￥200,000と帳簿価額￥180,000の差額￥20,000は「有価証券売却益」（収益の発生）として計上します。",
      answers: [
        { side: "debit", account: "当座預金", amount: 200000 },
        { side: "credit", account: "売買目的有価証券", amount: 180000 },
        { side: "credit", account: "有価証券売却益", amount: 20000 }
      ]
    },
    {
      id: "q1-007",
      text: "建物（取得原価￥2,000,000、減価償却累計額￥800,000）を￥1,100,000で売却し、代金は月末に受け取ることとした。",
      explanation: "【解説】建物の帳簿価額は 2,000,000 - 800,000 = 1,200,000円。これを 1,100,000円で売却したため、差額 100,000円は「固定資産売却損」（費用の発生）となります。また後払い代金は「未収入金」です。",
      answers: [
        { side: "debit", account: "未収入金", amount: 1100000 },
        { side: "debit", account: "建物減価償却累計額", amount: 800000 },
        { side: "credit", account: "建物", amount: 2000000 },
        { side: "debit", account: "固定資産売却損", amount: 100000 }
      ]
    },
    {
      id: "q1-008",
      text: "決算にあたり、売掛金の期末残高￥600,000に対して2%の貸倒引当金を差額補充法により設定する。なお、貸倒引当金の残高は￥5,000である。",
      explanation: "【解説】設定必要額は 600,000 × 2% = 12,000円。既存残高が 5,000円あるため、差額の 7,000円を「貸倒引当金繰入」として補充計上します。",
      answers: [
        { side: "debit", account: "貸倒引当金繰入", amount: 7000 },
        { side: "credit", account: "貸倒引当金", amount: 7000 }
      ]
    },
    {
      id: "q1-009",
      text: "得意先が倒産し、前期に発生した売掛金￥250,000が回収不能となった。なお、貸倒引当金の残高は￥200,000である。",
      explanation: "【解説】前期発生の売掛金の貸倒れは、まず貸倒引当金を取り崩し（200,000円）、不足する 50,000円を「貸倒損失」として計上します。",
      answers: [
        { side: "debit", account: "貸倒引当金", amount: 200000 },
        { side: "debit", account: "貸倒損失", amount: 50000 },
        { side: "credit", account: "売掛金", amount: 250000 }
      ]
    },
    {
      id: "q1-010",
      text: "社債（額面総額￥1,000,000、年利率3%、利払日は3月末と9月末）を額面￥100につき￥98で発行し、払込金は当座預金とした。なお、社債発行費は発行時に全額費用処理する方法を採用しており、社債発行費￥20,000は現金で支払った。",
      explanation: "【解説】社債の発行金額は 1,000,000 × (98/100) = 980,000円。社債発行費 20,000円は新株発行等と同様に全額費用として「社債発行費」勘定で処理します。",
      answers: [
        { side: "debit", account: "当座預金", amount: 980000 },
        { side: "debit", account: "社債発行費", amount: 20000 },
        { side: "credit", account: "社債", amount: 1000000 }
      ]
    },
    {
      id: "q1-011",
      text: "株主総会において、繰越利益剰余金を次のとおり処分することが決議された。利益準備金の積立額￥30,000、別途積立金の積立額￥200,000、配当金￥300,000。",
      explanation: "【解説】繰越利益剰余金の減少を借方に計上し、それぞれ「利益準備金」「別途積立金」、未払いの配当金は「未払配当金」（負債）に計上します。",
      answers: [
        { side: "debit", account: "繰越利益剰余金", amount: 530000 },
        { side: "credit", account: "利益準備金", amount: 30000 },
        { side: "credit", account: "別途積立金", amount: 200000 },
        { side: "credit", account: "未払配当金", amount: 300000 }
      ]
    },
    {
      id: "q1-012",
      text: "商品￥400,000を売り上げ、代金のうち￥100,000は現金で受け取り、残額は掛けとした。なお、発送費￥8,000を現金で支払った。",
      explanation: "【解説】当社負担の発送費は「発送費」（費用）として計上します。売上 400,000円と発送費 8,000円をそれぞれ適切に仕訳します。",
      answers: [
        { side: "debit", account: "現金", amount: 100000 },
        { side: "debit", account: "売掛金", amount: 300000 },
        { side: "debit", account: "発送費", amount: 8000 },
        { side: "credit", account: "売上", amount: 400000 },
        { side: "credit", account: "現金", amount: 8000 }
      ]
    },
    {
      id: "q1-013",
      text: "電子記録債権￥350,000が決済され、当座預金口座に振り込まれた。",
      explanation: "【解説】電子記録債権の決済により、資産の減少として貸方に「電子記録債権」、当座預金の増加として借方に「当座預金」を計上します。",
      answers: [
        { side: "debit", account: "当座預金", amount: 350000 },
        { side: "credit", account: "電子記録債権", amount: 350000 }
      ]
    },
    {
      id: "q1-014",
      text: "仕入先に対する買掛金￥500,000について、電子記録債務を発生させた。",
      explanation: "【解説】買買金の代わりに電子記録債務を発生させたため、買掛金の減少（負債の減少）を借方に、電子記録債務の増加（負債の増加）を貸方に計上します。",
      answers: [
        { side: "debit", account: "買掛金", amount: 500000 },
        { side: "credit", account: "電子記録債務", amount: 500000 }
      ]
    },
    {
      id: "q1-015",
      text: "決算にあたり、保険料の前払分￥24,000を計上する。",
      explanation: "【解説】当期に支払った保険料のうち翌期以降の分は「前払費用」（資産の増加）に振替え、支払保険料（費用の発生）を減額させます。",
      answers: [
        { side: "debit", account: "前払費用", amount: 24000 },
        { side: "credit", account: "保険料", amount: 24000 }
      ]
    }
  ],

  // ============================================================
  // 第2問: 商業簿記 個別問題（20点）
  // contentHTML内の {{blank:id}} → <input> or <select> に置換
  // answerForm各blankのpoints合計 = 20
  // ============================================================
  q2_commercial: [
    {
      id: "q2-001",
      title: "次の資料に基づき、株主資本等変動計算書の空欄を埋めなさい。",
      explanation: "【解説】新株発行時は払込金の1/2を超えない額を資本準備金に計上できます。剰余金の配当・処分では利益準備金と別途積立金の計上および繰越利益剰余金の減少を正しく反映させます。",
      contentHTML: `
        <p>当期（×2年4月1日〜×3年3月31日）における以下の取引に基づき、株主資本等変動計算書の空欄を埋めなさい。</p>
        <p><strong>【資料】当期中の取引</strong></p>
        <ul style="margin: 10px 0 10px 20px; font-size: 0.88rem;">
          <li>増資を行い、新株200株を1株あたり￥3,000で発行し、全額の払込みを受け、払込金は当座預金とした。なお、資本金には会社法が定める最低額を組み入れた。</li>
          <li>株主総会において、繰越利益剰余金を次のとおり配当・処分した。配当金￥100,000、利益準備金の積立て￥10,000、別途積立金の積立て￥50,000。</li>
          <li>当期純利益は￥280,000であった。</li>
        </ul>
        <p><strong>株主資本等変動計算書（一部）</strong></p>
        <table>
          <thead>
            <tr>
              <th class="text-left" style="text-align:left">項目</th>
              <th>資本金</th>
              <th>資本準備金</th>
              <th>利益準備金</th>
              <th>別途積立金</th>
              <th>繰越利益剰余金</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-left" style="text-align:left">当期首残高</td>
              <td>1,000,000</td>
              <td>200,000</td>
              <td>80,000</td>
              <td>300,000</td>
              <td>250,000</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">新株の発行</td>
              <td>{{blank:ans-q2-1-1}}</td>
              <td>{{blank:ans-q2-1-2}}</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">剰余金の配当</td>
              <td>—</td>
              <td>—</td>
              <td>{{blank:ans-q2-1-3}}</td>
              <td>—</td>
              <td>{{blank:ans-q2-1-4}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">別途積立金の積立て</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>{{blank:ans-q2-1-5}}</td>
              <td>{{blank:ans-q2-1-6}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">当期純利益</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>{{blank:ans-q2-1-7}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left"><strong>当期末残高</strong></td>
              <td><strong>{{blank:ans-q2-1-8}}</strong></td>
              <td><strong>{{blank:ans-q2-1-9}}</strong></td>
              <td><strong>{{blank:ans-q2-1-10}}</strong></td>
              <td><strong>{{blank:ans-q2-1-11}}</strong></td>
              <td><strong>{{blank:ans-q2-1-12}}</strong></td>
            </tr>
          </tbody>
        </table>
      `,
      answerForm: [
        { id: "ans-q2-1-1", type: "number", correctAnswer: 300000, points: 2 },
        { id: "ans-q2-1-2", type: "number", correctAnswer: 300000, points: 2 },
        { id: "ans-q2-1-3", type: "number", correctAnswer: 10000, points: 2 },
        { id: "ans-q2-1-4", type: "number", correctAnswer: -100000, points: 2 },
        { id: "ans-q2-1-5", type: "number", correctAnswer: 50000, points: 1 },
        { id: "ans-q2-1-6", type: "number", correctAnswer: -50000, points: 1 },
        { id: "ans-q2-1-7", type: "number", correctAnswer: 280000, points: 2 },
        { id: "ans-q2-1-8", type: "number", correctAnswer: 1300000, points: 2 },
        { id: "ans-q2-1-9", type: "number", correctAnswer: 500000, points: 2 },
        { id: "ans-q2-1-10", type: "number", correctAnswer: 90000, points: 1 },
        { id: "ans-q2-1-11", type: "number", correctAnswer: 350000, points: 1 },
        { id: "ans-q2-1-12", type: "number", correctAnswer: 380000, points: 2 }
      ]
    },
    {
      id: "q2-002",
      title: "次の資料に基づき、固定資産台帳の空欄を埋めなさい。",
      contentHTML: `
        <p>以下の資料に基づき、備品Aに関する固定資産台帳の空欄を埋めなさい。</p>
        <p><strong>【資料】</strong></p>
        <ul style="margin: 10px 0 10px 20px; font-size: 0.88rem;">
          <li>備品A: 取得日 ×1年4月1日、取得原価 ￥600,000</li>
          <li>耐用年数: 5年、残存価額: ゼロ、償却方法: 定額法</li>
          <li>決算日: 3月31日（年1回）</li>
          <li>×3年9月30日に￥320,000で売却し、代金は月末に受け取る。</li>
        </ul>
        <p><strong>固定資産台帳（備品A）</strong></p>
        <table>
          <thead>
            <tr>
              <th class="text-left" style="text-align:left">項目</th>
              <th>金額（円）</th>
            </tr>
          </thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">取得原価</td><td>600,000</td></tr>
            <tr><td class="text-left" style="text-align:left">×2年3月期 減価償却費</td><td>{{blank:ans-q2-2-1}}</td></tr>
            <tr><td class="text-left" style="text-align:left">×2年3月期末 減価償却累計額</td><td>{{blank:ans-q2-2-2}}</td></tr>
            <tr><td class="text-left" style="text-align:left">×3年3月期 減価償却費</td><td>{{blank:ans-q2-2-3}}</td></tr>
            <tr><td class="text-left" style="text-align:left">×3年3月期末 減価償却累計額</td><td>{{blank:ans-q2-2-4}}</td></tr>
            <tr><td class="text-left" style="text-align:left">×3年9月売却時 減価償却費（月割）</td><td>{{blank:ans-q2-2-5}}</td></tr>
            <tr><td class="text-left" style="text-align:left">売却時 減価償却累計額合計</td><td>{{blank:ans-q2-2-6}}</td></tr>
            <tr><td class="text-left" style="text-align:left">売却時 帳簿価額</td><td>{{blank:ans-q2-2-7}}</td></tr>
            <tr><td class="text-left" style="text-align:left">売却価額</td><td>320,000</td></tr>
            <tr><td class="text-left" style="text-align:left">固定資産売却損益（＋益/−損）</td><td>{{blank:ans-q2-2-8}}</td></tr>
          </tbody>
        </table>
      `,
      answerForm: [
        { id: "ans-q2-2-1", type: "number", correctAnswer: 120000, points: 2 },
        { id: "ans-q2-2-2", type: "number", correctAnswer: 120000, points: 2 },
        { id: "ans-q2-2-3", type: "number", correctAnswer: 120000, points: 2 },
        { id: "ans-q2-2-4", type: "number", correctAnswer: 240000, points: 3 },
        { id: "ans-q2-2-5", type: "number", correctAnswer: 60000, points: 3 },
        { id: "ans-q2-2-6", type: "number", correctAnswer: 300000, points: 3 },
        { id: "ans-q2-2-7", type: "number", correctAnswer: 300000, points: 3 },
        { id: "ans-q2-2-8", type: "number", correctAnswer: 20000, points: 2 }
      ]
    }
  ],

  // ============================================================
  // 第3問: 商業簿記 決算問題（20点）
  // ============================================================
  q3_commercial_closing: [
    {
      id: "q3-001",
      title: "次の決算整理事項に基づき、精算表の修正記入欄および損益計算書欄・貸借対照表欄の空欄を埋めなさい。",
      contentHTML: `
        <p>×2年3月31日の決算において、以下の決算整理事項を処理し、精算表の空欄を埋めなさい。</p>
        <p><strong>【残高試算表（一部）】</strong></p>
        <table>
          <thead>
            <tr><th class="text-left" style="text-align:left">勘定科目</th><th>借方</th><th>貸方</th></tr>
          </thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">売掛金</td><td>500,000</td><td></td></tr>
            <tr><td class="text-left" style="text-align:left">貸倒引当金</td><td></td><td>3,000</td></tr>
            <tr><td class="text-left" style="text-align:left">備品</td><td>800,000</td><td></td></tr>
            <tr><td class="text-left" style="text-align:left">備品減価償却累計額</td><td></td><td>160,000</td></tr>
            <tr><td class="text-left" style="text-align:left">前払保険料</td><td>36,000</td><td></td></tr>
            <tr><td class="text-left" style="text-align:left">売上</td><td></td><td>2,000,000</td></tr>
            <tr><td class="text-left" style="text-align:left">仕入</td><td>1,200,000</td><td></td></tr>
            <tr><td class="text-left" style="text-align:left">保険料</td><td>48,000</td><td></td></tr>
          </tbody>
        </table>
        <p><strong>【決算整理事項】</strong></p>
        <ol style="margin: 10px 0 10px 20px; font-size: 0.88rem;">
          <li>売掛金の期末残高に対して2%の貸倒引当金を差額補充法で設定する。</li>
          <li>備品について定額法で減価償却を行う（耐用年数5年、残存価額ゼロ）。</li>
          <li>保険料のうち翌期分￥24,000を前払計上する（前払保険料の期首残高￥36,000は期中に適切に処理済み）。</li>
        </ol>
        <p><strong>【精算表（空欄を埋めなさい）】</strong></p>
        <table>
          <thead>
            <tr>
              <th class="text-left" style="text-align:left">勘定科目</th>
              <th colspan="2">修正記入</th>
              <th>損益計算書<br>または貸借対照表</th>
            </tr>
            <tr>
              <th></th>
              <th>借方</th>
              <th>貸方</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-left" style="text-align:left">貸倒引当金繰入</td>
              <td>{{blank:ans-q3-1-1}}</td>
              <td>—</td>
              <td>（損益）{{blank:ans-q3-1-2}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">貸倒引当金</td>
              <td>—</td>
              <td>{{blank:ans-q3-1-3}}</td>
              <td>（B/S）{{blank:ans-q3-1-4}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">減価償却費</td>
              <td>{{blank:ans-q3-1-5}}</td>
              <td>—</td>
              <td>（損益）{{blank:ans-q3-1-6}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">備品減価償却累計額</td>
              <td>—</td>
              <td>{{blank:ans-q3-1-7}}</td>
              <td>（B/S）{{blank:ans-q3-1-8}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">前払保険料</td>
              <td>{{blank:ans-q3-1-9}}</td>
              <td>—</td>
              <td>（B/S）{{blank:ans-q3-1-10}}</td>
            </tr>
          </tbody>
        </table>
      `,
      answerForm: [
        { id: "ans-q3-1-1", type: "number", correctAnswer: 7000, points: 2 },
        { id: "ans-q3-1-2", type: "number", correctAnswer: 7000, points: 2 },
        { id: "ans-q3-1-3", type: "number", correctAnswer: 7000, points: 2 },
        { id: "ans-q3-1-4", type: "number", correctAnswer: 10000, points: 2 },
        { id: "ans-q3-1-5", type: "number", correctAnswer: 160000, points: 2 },
        { id: "ans-q3-1-6", type: "number", correctAnswer: 160000, points: 2 },
        { id: "ans-q3-1-7", type: "number", correctAnswer: 160000, points: 2 },
        { id: "ans-q3-1-8", type: "number", correctAnswer: 320000, points: 2 },
        { id: "ans-q3-1-9", type: "number", correctAnswer: 24000, points: 2 },
        { id: "ans-q3-1-10", type: "number", correctAnswer: 24000, points: 2 }
      ]
    },
    {
      id: "q3-002",
      title: "次の決算整理事項に基づき、損益計算書および貸借対照表の空欄を埋めなさい。",
      contentHTML: `
        <p>×3年3月31日の決算において、以下の決算整理前残高試算表と決算整理事項に基づき、各空欄を埋めなさい。</p>
        <p><strong>【決算整理前残高試算表（一部）】</strong></p>
        <table>
          <thead><tr><th class="text-left" style="text-align:left">勘定科目</th><th>借方</th><th>貸方</th></tr></thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">売上</td><td></td><td>3,500,000</td></tr>
            <tr><td class="text-left" style="text-align:left">仕入</td><td>2,100,000</td><td></td></tr>
            <tr><td class="text-left" style="text-align:left">繰越商品</td><td>180,000</td><td></td></tr>
            <tr><td class="text-left" style="text-align:left">給料</td><td>400,000</td><td></td></tr>
            <tr><td class="text-left" style="text-align:left">支払家賃</td><td>360,000</td><td></td></tr>
          </tbody>
        </table>
        <p><strong>【決算整理事項】</strong></p>
        <ol style="margin: 10px 0 10px 20px; font-size: 0.88rem;">
          <li>期末商品棚卸高は￥220,000である。売上原価は「仕入」の行で算定する。</li>
          <li>給料の未払分が￥35,000ある。</li>
          <li>支払家賃のうち￥30,000は翌期分である。</li>
        </ol>
        <p><strong>【解答欄】</strong></p>
        <table>
          <thead><tr><th class="text-left" style="text-align:left">項目</th><th>金額</th></tr></thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">売上原価</td><td>{{blank:ans-q3-2-1}}</td></tr>
            <tr><td class="text-left" style="text-align:left">売上総利益</td><td>{{blank:ans-q3-2-2}}</td></tr>
            <tr><td class="text-left" style="text-align:left">給料（損益計算書）</td><td>{{blank:ans-q3-2-3}}</td></tr>
            <tr><td class="text-left" style="text-align:left">支払家賃（損益計算書）</td><td>{{blank:ans-q3-2-4}}</td></tr>
            <tr><td class="text-left" style="text-align:left">未払費用（貸借対照表）</td><td>{{blank:ans-q3-2-5}}</td></tr>
            <tr><td class="text-left" style="text-align:left">前払費用（貸借対照表）</td><td>{{blank:ans-q3-2-6}}</td></tr>
            <tr><td class="text-left" style="text-align:left">繰越商品（貸借対照表）</td><td>{{blank:ans-q3-2-7}}</td></tr>
          </tbody>
        </table>
      `,
      answerForm: [
        { id: "ans-q3-2-1", type: "number", correctAnswer: 2060000, points: 4 },
        { id: "ans-q3-2-2", type: "number", correctAnswer: 1440000, points: 4 },
        { id: "ans-q3-2-3", type: "number", correctAnswer: 435000, points: 2 },
        { id: "ans-q3-2-4", type: "number", correctAnswer: 330000, points: 2 },
        { id: "ans-q3-2-5", type: "number", correctAnswer: 35000, points: 3 },
        { id: "ans-q3-2-6", type: "number", correctAnswer: 30000, points: 3 },
        { id: "ans-q3-2-7", type: "number", correctAnswer: 220000, points: 2 }
      ]
    }
  ],

  // ============================================================
  // 第4問: 工業簿記 仕訳/個別問題（合計20点）
  // pointsフィールドで各問題の配点を指定
  // 抽出ロジックで合計20点になる組み合わせを選ぶ
  // ============================================================
  q4_industrial: [
    {
      id: "q4-001",
      title: "次の取引について仕訳しなさい（工業簿記の勘定体系による）。",
      points: 20,
      contentHTML: `
        <p>以下の取引について、工業簿記の勘定体系により仕訳しなさい。各設問の解答欄に勘定科目と金額を記入すること。</p>
        <p><strong>(1)</strong> 材料￥300,000を掛けで購入した。</p>
        <table class="journal-entry-table">
          <thead><tr><th></th><th>借方科目</th><th>金額</th><th>貸方科目</th><th>金額</th></tr></thead>
          <tbody><tr>
            <td class="side-label">1</td>
            <td>{{blank:ans-q4-1-1a}}</td>
            <td>{{blank:ans-q4-1-1b}}</td>
            <td>{{blank:ans-q4-1-1c}}</td>
            <td>{{blank:ans-q4-1-1d}}</td>
          </tr></tbody>
        </table>
        <p><strong>(2)</strong> 材料￥250,000を消費した。うち直接材料費は￥200,000、間接材料費は￥50,000である。</p>
        <table class="journal-entry-table">
          <thead><tr><th></th><th>借方科目</th><th>金額</th><th>貸方科目</th><th>金額</th></tr></thead>
          <tbody>
            <tr>
              <td class="side-label">1</td>
              <td>{{blank:ans-q4-1-2a}}</td>
              <td>{{blank:ans-q4-1-2b}}</td>
              <td rowspan="2">{{blank:ans-q4-1-2e}}</td>
              <td rowspan="2">{{blank:ans-q4-1-2f}}</td>
            </tr>
            <tr>
              <td class="side-label">2</td>
              <td>{{blank:ans-q4-1-2c}}</td>
              <td>{{blank:ans-q4-1-2d}}</td>
            </tr>
          </tbody>
        </table>
        <p><strong>(3)</strong> 賃金￥400,000を当座預金から支払った。</p>
        <table class="journal-entry-table">
          <thead><tr><th></th><th>借方科目</th><th>金額</th><th>貸方科目</th><th>金額</th></tr></thead>
          <tbody><tr>
            <td class="side-label">1</td>
            <td>{{blank:ans-q4-1-3a}}</td>
            <td>{{blank:ans-q4-1-3b}}</td>
            <td>{{blank:ans-q4-1-3c}}</td>
            <td>{{blank:ans-q4-1-3d}}</td>
          </tr></tbody>
        </table>
        <p><strong>(4)</strong> 賃金￥400,000を消費した。うち直接労務費は￥320,000、間接労務費は￥80,000である。</p>
        <table class="journal-entry-table">
          <thead><tr><th></th><th>借方科目</th><th>金額</th><th>貸方科目</th><th>金額</th></tr></thead>
          <tbody>
            <tr>
              <td class="side-label">1</td>
              <td>{{blank:ans-q4-1-4a}}</td>
              <td>{{blank:ans-q4-1-4b}}</td>
              <td rowspan="2">{{blank:ans-q4-1-4e}}</td>
              <td rowspan="2">{{blank:ans-q4-1-4f}}</td>
            </tr>
            <tr>
              <td class="side-label">2</td>
              <td>{{blank:ans-q4-1-4c}}</td>
              <td>{{blank:ans-q4-1-4d}}</td>
            </tr>
          </tbody>
        </table>
        <p><strong>(5)</strong> 製造間接費￥130,000（間接材料費￥50,000＋間接労務費￥80,000）を予定配賦率@￥500、直接作業時間280時間で仕掛品に配賦した。</p>
        <table class="journal-entry-table">
          <thead><tr><th></th><th>借方科目</th><th>金額</th><th>貸方科目</th><th>金額</th></tr></thead>
          <tbody><tr>
            <td class="side-label">1</td>
            <td>{{blank:ans-q4-1-5a}}</td>
            <td>{{blank:ans-q4-1-5b}}</td>
            <td>{{blank:ans-q4-1-5c}}</td>
            <td>{{blank:ans-q4-1-5d}}</td>
          </tr></tbody>
        </table>
      `,
      answerForm: [
        // (1) 材料購入
        { id: "ans-q4-1-1a", type: "select", options: accountList, correctAnswer: "材料", points: 1 },
        { id: "ans-q4-1-1b", type: "number", correctAnswer: 300000, points: 1 },
        { id: "ans-q4-1-1c", type: "select", options: accountList, correctAnswer: "買掛金", points: 1 },
        { id: "ans-q4-1-1d", type: "number", correctAnswer: 300000, points: 1 },
        // (2) 材料消費
        { id: "ans-q4-1-2a", type: "select", options: accountList, correctAnswer: "仕掛品", points: 1 },
        { id: "ans-q4-1-2b", type: "number", correctAnswer: 200000, points: 1 },
        { id: "ans-q4-1-2c", type: "select", options: accountList, correctAnswer: "製造間接費", points: 1 },
        { id: "ans-q4-1-2d", type: "number", correctAnswer: 50000, points: 1 },
        { id: "ans-q4-1-2e", type: "select", options: accountList, correctAnswer: "材料", points: 1 },
        { id: "ans-q4-1-2f", type: "number", correctAnswer: 250000, points: 1 },
        // (3) 賃金支払
        { id: "ans-q4-1-3a", type: "select", options: accountList, correctAnswer: "賃金", points: 1 },
        { id: "ans-q4-1-3b", type: "number", correctAnswer: 400000, points: 1 },
        { id: "ans-q4-1-3c", type: "select", options: accountList, correctAnswer: "当座預金", points: 1 },
        { id: "ans-q4-1-3d", type: "number", correctAnswer: 400000, points: 1 },
        // (4) 賃金消費
        { id: "ans-q4-1-4a", type: "select", options: accountList, correctAnswer: "仕掛品", points: 1 },
        { id: "ans-q4-1-4b", type: "number", correctAnswer: 320000, points: 1 },
        { id: "ans-q4-1-4c", type: "select", options: accountList, correctAnswer: "製造間接費", points: 1 },
        { id: "ans-q4-1-4d", type: "number", correctAnswer: 80000, points: 1 },
        { id: "ans-q4-1-4e", type: "select", options: accountList, correctAnswer: "賃金", points: 0 },
        { id: "ans-q4-1-4f", type: "number", correctAnswer: 400000, points: 0 },
        // (5) 製造間接費配賦
        { id: "ans-q4-1-5a", type: "select", options: accountList, correctAnswer: "仕掛品", points: 1 },
        { id: "ans-q4-1-5b", type: "number", correctAnswer: 140000, points: 1 },
        { id: "ans-q4-1-5c", type: "select", options: accountList, correctAnswer: "製造間接費", points: 1 },
        { id: "ans-q4-1-5d", type: "number", correctAnswer: 140000, points: 1 }
      ]
    },
    {
      id: "q4-010",
      title: "次の資料に基づき、個別原価計算における製造指図書別の原価を計算しなさい。",
      points: 20,
      contentHTML: `
        <p>当月の製造指図書別の原価データは以下のとおりである。製造間接費は直接作業時間を基準に予定配賦する（予定配賦率: @￥600/時間）。</p>
        <p><strong>【資料】</strong></p>
        <table>
          <thead>
            <tr>
              <th class="text-left" style="text-align:left">項目</th>
              <th>指図書#101<br>（月初仕掛）</th>
              <th>指図書#102<br>（当月着手）</th>
              <th>指図書#103<br>（当月着手）</th>
            </tr>
          </thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">月初仕掛品原価</td><td>85,000</td><td>—</td><td>—</td></tr>
            <tr><td class="text-left" style="text-align:left">直接材料費</td><td>120,000</td><td>200,000</td><td>150,000</td></tr>
            <tr><td class="text-left" style="text-align:left">直接労務費</td><td>90,000</td><td>160,000</td><td>100,000</td></tr>
            <tr><td class="text-left" style="text-align:left">直接作業時間</td><td>150h</td><td>250h</td><td>200h</td></tr>
          </tbody>
        </table>
        <p>指図書#101と#102は当月完成、#103は月末仕掛中である。</p>
        <p><strong>【解答欄】</strong></p>
        <table>
          <thead>
            <tr>
              <th class="text-left" style="text-align:left">項目</th>
              <th>指図書#101</th>
              <th>指図書#102</th>
              <th>指図書#103</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-left" style="text-align:left">製造間接費配賦額</td>
              <td>{{blank:ans-q4-2-1}}</td>
              <td>{{blank:ans-q4-2-2}}</td>
              <td>{{blank:ans-q4-2-3}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">製造原価合計</td>
              <td>{{blank:ans-q4-2-4}}</td>
              <td>{{blank:ans-q4-2-5}}</td>
              <td>{{blank:ans-q4-2-6}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">完成品原価合計</td>
              <td colspan="3">{{blank:ans-q4-2-7}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">月末仕掛品原価</td>
              <td colspan="3">{{blank:ans-q4-2-8}}</td>
            </tr>
          </tbody>
        </table>
      `,
      answerForm: [
        { id: "ans-q4-2-1", type: "number", correctAnswer: 90000, points: 2 },
        { id: "ans-q4-2-2", type: "number", correctAnswer: 150000, points: 2 },
        { id: "ans-q4-2-3", type: "number", correctAnswer: 120000, points: 2 },
        { id: "ans-q4-2-4", type: "number", correctAnswer: 385000, points: 3 },
        { id: "ans-q4-2-5", type: "number", correctAnswer: 510000, points: 3 },
        { id: "ans-q4-2-6", type: "number", correctAnswer: 370000, points: 3 },
        { id: "ans-q4-2-7", type: "number", correctAnswer: 895000, points: 3 },
        { id: "ans-q4-2-8", type: "number", correctAnswer: 370000, points: 2 }
      ]
    }
  ],

  // ============================================================
  // 第5問: 工業簿記 総合原価計算等（20点）
  // ============================================================
  q5_industrial: [
    {
      id: "q5-001",
      title: "次の資料に基づき、単純総合原価計算（先入先出法）により、完成品原価と月末仕掛品原価を計算しなさい。",
      contentHTML: `
        <p>当月の生産データおよび原価データは以下のとおりである。月末仕掛品の評価は先入先出法による。</p>
        <p><strong>【生産データ】</strong></p>
        <table>
          <thead><tr><th class="text-left" style="text-align:left">項目</th><th>数量</th></tr></thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">月初仕掛品</td><td>200個（加工進捗度50%）</td></tr>
            <tr><td class="text-left" style="text-align:left">当月投入</td><td>800個</td></tr>
            <tr><td class="text-left" style="text-align:left">合計</td><td>1,000個</td></tr>
            <tr><td class="text-left" style="text-align:left">月末仕掛品</td><td>100個（加工進捗度40%）</td></tr>
            <tr><td class="text-left" style="text-align:left">完成品</td><td>900個</td></tr>
          </tbody>
        </table>
        <p>※ 材料はすべて工程の始点で投入する。完成品単位原価は円未満を四捨五入すること。</p>
        <p><strong>【原価データ】</strong></p>
        <table>
          <thead><tr><th class="text-left" style="text-align:left">項目</th><th>直接材料費</th><th>加工費</th></tr></thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">月初仕掛品原価</td><td>￥60,000</td><td>￥45,000</td></tr>
            <tr><td class="text-left" style="text-align:left">当月製造費用</td><td>￥240,000</td><td>￥336,000</td></tr>
          </tbody>
        </table>
        <p><strong>【解答欄】</strong></p>
        <table>
          <thead><tr><th class="text-left" style="text-align:left">項目</th><th>直接材料費</th><th>加工費</th><th>合計</th></tr></thead>
          <tbody>
            <tr>
              <td class="text-left" style="text-align:left">月末仕掛品原価</td>
              <td>{{blank:ans-q5-1-1}}</td>
              <td>{{blank:ans-q5-1-2}}</td>
              <td>{{blank:ans-q5-1-3}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">完成品原価</td>
              <td>{{blank:ans-q5-1-4}}</td>
              <td>{{blank:ans-q5-1-5}}</td>
              <td>{{blank:ans-q5-1-6}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">完成品単位原価</td>
              <td colspan="2">—</td>
              <td>{{blank:ans-q5-1-7}}</td>
            </tr>
          </tbody>
        </table>
      `,
      answerForm: [
        // 先入先出法:
        // 材料: 当月投入800個のうち月末100個 → 月末材料費 = 240,000 × 100/800 = 30,000
        // 加工: 当月加工換算 = 完成900 - 月初換算100 + 月末換算40 = 840 → 月末加工費 = 333,200 × 40/840 ≒ 15,867 → 端数処理で15,867
        // ただし計算を簡便にするため:
        // 加工費当月換算量 = 900 - 200*0.5 + 100*0.4 = 900 - 100 + 40 = 840
        // 月末加工費 = 333,200 * 40 / 840 = 15,866.666... → 四捨五入で調整
        // ここでは割り切れる数値に修正:
        // 加工費当月投入 = 333,200、換算量840、月末40個分 = 333,200 × 40/840 = 15,866.67
        // 簿記試験では割り切れるように出題されるので、加工費を修正
        // 加工費当月: 336,000 → 336,000 × 40/840 = 16,000
        // 完成品加工費: 45,000 + 336,000 - 16,000 = 365,000
        // → 修正済み（contentHTMLも修正済みとする — 上のcontentHTMLの333,200は336,000に変更すべきだが
        //   サンプルデータとしてそのまま進める。app.js側で整数判定する）
        // → contentHTMLの当月加工費を336,000に修正する
        { id: "ans-q5-1-1", type: "number", correctAnswer: 30000, points: 3 },
        { id: "ans-q5-1-2", type: "number", correctAnswer: 16000, points: 3 },
        { id: "ans-q5-1-3", type: "number", correctAnswer: 46000, points: 3 },
        { id: "ans-q5-1-4", type: "number", correctAnswer: 270000, points: 3 },
        { id: "ans-q5-1-5", type: "number", correctAnswer: 365000, points: 3 },
        { id: "ans-q5-1-6", type: "number", correctAnswer: 635000, points: 3 },
        { id: "ans-q5-1-7", type: "number", correctAnswer: 706, points: 2 }
      ]
    },
    {
      id: "q5-002",
      title: "次の資料に基づき、単純総合原価計算（平均法）により、完成品原価と月末仕掛品原価を計算しなさい。",
      contentHTML: `
        <p>当月の生産データおよび原価データは以下のとおりである。月末仕掛品の評価は平均法による。</p>
        <p><strong>【生産データ】</strong></p>
        <table>
          <thead><tr><th class="text-left" style="text-align:left">項目</th><th>数量</th></tr></thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">月初仕掛品</td><td>100個（加工進捗度40%）</td></tr>
            <tr><td class="text-left" style="text-align:left">当月投入</td><td>900個</td></tr>
            <tr><td class="text-left" style="text-align:left">合計</td><td>1,000個</td></tr>
            <tr><td class="text-left" style="text-align:left">月末仕掛品</td><td>200個（加工進捗度50%）</td></tr>
            <tr><td class="text-left" style="text-align:left">完成品</td><td>800個</td></tr>
          </tbody>
        </table>
        <p>※ 材料はすべて工程の始点で投入する。完成品単位原価は円未満を四捨五入すること。</p>
        <p><strong>【原価データ】</strong></p>
        <table>
          <thead><tr><th class="text-left" style="text-align:left">項目</th><th>直接材料費</th><th>加工費</th></tr></thead>
          <tbody>
            <tr><td class="text-left" style="text-align:left">月初仕掛品原価</td><td>￥50,000</td><td>￥24,000</td></tr>
            <tr><td class="text-left" style="text-align:left">当月製造費用</td><td>￥450,000</td><td>￥696,000</td></tr>
          </tbody>
        </table>
        <p><strong>【解答欄】</strong></p>
        <table>
          <thead><tr><th class="text-left" style="text-align:left">項目</th><th>直接材料費</th><th>加工費</th><th>合計</th></tr></thead>
          <tbody>
            <tr>
              <td class="text-left" style="text-align:left">月末仕掛品原価</td>
              <td>{{blank:ans-q5-2-1}}</td>
              <td>{{blank:ans-q5-2-2}}</td>
              <td>{{blank:ans-q5-2-3}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">完成品原価</td>
              <td>{{blank:ans-q5-2-4}}</td>
              <td>{{blank:ans-q5-2-5}}</td>
              <td>{{blank:ans-q5-2-6}}</td>
            </tr>
            <tr>
              <td class="text-left" style="text-align:left">完成品単位原価</td>
              <td colspan="2">—</td>
              <td>{{blank:ans-q5-2-7}}</td>
            </tr>
          </tbody>
        </table>
      `,
      answerForm: [
        // 平均法:
        // 材料: (50,000+450,000) / (100+900) × 200 = 500,000 / 1,000 × 200 = 100,000
        // 加工: 完成品換算量合計 = 800 + 200×0.5 = 900
        //       (24,000+576,000) / (40+860) = 600,000 / 900 × 100 ... 
        //       月初換算40 + 当月投入分の加工換算 = ?
        //       平均法なので: 総換算量 = 完成800 + 月末100 = 900
        //       月末加工換算 = 200 × 0.5 = 100
        //       加工費合計 = 24,000 + 576,000 = 600,000
        //       加工費単価 = 600,000 / (800 + 100) = 600,000 / 900 ≒ 666.67
        //       月末加工費 = 666.67 × 100 = 66,667 → 割り切れない
        //       → 修正: 加工費当月を576,000のままだと割り切れない
        //       → 加工費: (24,000 + 576,000) = 600,000 / 900 = 666.67...
        //       → 簿記的には端数が出ない数値が望ましい
        //       → 当月加工費を540,000に変更: (24,000+540,000)=564,000/900=626.67 まだダメ
        //       → 月初加工費36,000 + 当月504,000 = 540,000 / 900 = 600
        //       → contentHTMLの数値と合わせて修正
        //       実際にはcontentHTMLは上に固定されているので、このまま整数で出る数値にしておく
        //       (24,000 + 576,000) = 600,000、換算量900 → 割り切れないが、
        //       実務的には円未満四捨五入として進める
        //       → 月末加工: 600,000 / 900 * 100 = 66,667 (四捨五入)
        //       → しかし簿記試験では割り切れるのが普通なので数値修正:
        //       月初加工費を36,000、当月加工費を504,000に変更 → 合計540,000/900=600
        //       → 月末加工費 = 600 × 100 = 60,000
        //       → 完成品加工費 = 600 × 800 = 480,000
        //       → ここではanswerFormの正解値だけ整合させ、contentHTMLのほうは後から修正可能とする
        //       最終的にcontentHTMLの数値と整合するように:
        //       月初加工36,000 + 当月504,000 = 540,000
        //       ↑ contentHTMLでは24,000と576,000になっている → answerFormとcontentHTMLで不整合
        //       → 正しい計算: 材料 (50,000+450,000)=500,000/1000*200=100,000
        //                    加工 換算量800+100=900, (24,000+576,000)=600,000/900=666.666
        //       → 割り切れないので、contentHTMLの当月加工費を変更する
        //       → 当月加工費を576,000 → 696,000に変更: (24,000+696,000)=720,000/900=800
        //       → 月末加工費=800*100=80,000 完成品加工費=800*800=640,000
        //       → これで割り切れる。ただしcontentHTML側の修正が必要
        //       
        //       簡単に割り切れる組み合わせ:
        //       月初加工: 24,000  当月加工: 696,000  合計720,000  換算900  単価800
        //       月末加工: 80,000  完成品加工: 640,000
        //       材料: 月末100,000 完成品400,000
        //       月末合計: 180,000  完成品合計: 1,040,000  単位原価: 1,300

        { id: "ans-q5-2-1", type: "number", correctAnswer: 100000, points: 3 },
        { id: "ans-q5-2-2", type: "number", correctAnswer: 80000, points: 3 },
        { id: "ans-q5-2-3", type: "number", correctAnswer: 180000, points: 3 },
        { id: "ans-q5-2-4", type: "number", correctAnswer: 400000, points: 3 },
        { id: "ans-q5-2-5", type: "number", correctAnswer: 640000, points: 3 },
        { id: "ans-q5-2-6", type: "number", correctAnswer: 1040000, points: 3 },
        { id: "ans-q5-2-7", type: "number", correctAnswer: 1300, points: 2 }
      ]
    }
  ]
};
