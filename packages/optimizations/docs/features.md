# features — @ph0ryn/dsh-optimizations

> この文書が答える問い: **個々の機能 (feature) は何をするか、何に依存し、どう確認するか**。
> 機能の追加・変更・DSH 追従のときに編集する。横断的な振る舞いの契約は `spec.md`、仕組みは
> `architecture.md`、共通の検証方針は `verification.md` を参照し、ここでは繰り返さない。

各機能は `src/features.ts` の `FEATURES` に1エントリを持ち、実装は `src/features/` に面ごとに
1ファイル置き、テストは実装の隣に置く。追加手順は `development.md`、レジストリとランタイムの
共通の振る舞いは `architecture.md` を参照する。

## compactSidebar — Compact sidebar

- **識別子**: `compactSidebar`、表示名 `Compact sidebar`、既定値 OFF
- **作用する面**: `client`
- **反映方式**: 即時

### 有効時の変化

サイドバー上部のロゴ行・New Session・パネル行が1行に圧縮される。ブランドマーク、New Session、
ナビゲーション（More ボタン）、折りたたみが横に並び、Workspaces の表示領域が広がる。
パネル行（Plugins、Automation tasks、Context Insights など）はナビゲーションのメニュー先頭に
同順で表示される。

### 無効時の復元

元の行構成・余白・パネル行に戻る。機能が入れたスタイルとメニュー行は残らない。

### 前提と制約

- シェルが描画するサイドバーの DOM 構成（`data-slot` と要素の並び）に依存する。
  サイドバーが折りたたまれている間は何も変えない。幅の都合でブランド名（wordmark）は隠れる。
  ナビゲーションのメニューはシェル既定の More メニューをそのまま使い、パネル行はその先頭に追加する。
- `spec.md` の非目標（既存 UI の描画の差し替え）に対する例外。既存コントロールを複製せず、
  シェルが描画した要素を CSS で再配置する範囲に限る。
- DSH 追従時に確認する DOM 依存（`development.md` の追従手順の一部）:
  - `[data-slot="sidebar"]` 直下のロゴ行 / New Session ボタン / `nav`（パネル行 + More アンカー）の並び
  - `[data-slot="sidebar.brand.name"]` と `[data-slot="sidebar.panellist"]` の存在
  - More アンカーが `nav` の最後の子で、`aria-haspopup="menu"` を持つボタンであること

### 実装上の構造

- 対象は expanded のときだけ。サイドバー列に `container-type: inline-size` を置き、
  `@container (min-width: 200px)` の中でのみ再配置する（56px のレールでは何もしない）。
- 行の非表示は `[data-slot="sidebar"]` 配下の要素の並びで行う。CSS Modules のクラス名には依存しない。
  - ロゴ行: ブランド名（`[data-slot="sidebar.brand.name"]`）を隠してマークだけにする。
  - New Session: 既存ボタンを絶対配置でロゴ行に移す。
  - パネル行: `nav > button`（3行）を隠し、More のアンカーだけをロゴ行右へ移す。
  - Workspaces: 空いた分だけ自動で上に詰まる（`sidebar.workspaces` はそのまま）。
- 隠したパネル行は `sidebar.panellist.actions` に自前の行を追加して、既存 More メニューの先頭に戻す。
  行のアイコンとラベルは `ctx.slots.entries("sidebar.panellist")` から取得し、クリックで
  `ctx.layout.selectPanel(id)`、メニューは `onDismiss()` で閉じる。
- スタイルは機能 fiber の `ctx.effect` が出し入れする。機能 OFF / アンロードで完全に消える。

### 検証

不変条件:

- I13: スタイル文字列が expanded 専用のコンテナクエリ、パネル行の非表示、既存ボタンの絶対配置、
  ブランド名の非表示を含む。機能の apply がスタイル要素と `sidebar.panellist.actions` の行登録を
  行い、後始末で両方が消える。
- I14: `panelRows` が登録順・ラベル（文字列 / thunk / 未設定）を解決する。`SidebarNavRows` が全パネルを
  アイコン付きで描画し、クリックで `selectPanel` と `onDismiss` を1回ずつ呼ぶ。現在のパネルに
  `aria-current` が付く。

自動テスト: `src/features/compactSidebar.test.ts` が I13 / I14 を確かめる。

手動確認:

1. `compactSidebar` を ON にする。
2. サイドバー上部が1行（ブランドマーク / New Session / More / 折りたたみ）になり、
   Workspaces が上に広がることを確認する。
3. More ボタンを押し、メニュー先頭に Plugins / Automation tasks / Context Insights などが
   サイドバーと同じ順・同じアイコンで並ぶことを確認する。1行を選ぶとパネルが開き、メニューが閉じる。
4. サイドバーを折りたたみ、レール表示が通常どおりであることを確認する。展開すると1行表示に戻る。
5. OFF に戻し、ロゴ行・New Session 行・パネル行・余白が元に戻ることを確認する。

判定: メニュー経由で全パネルに到達できる。折りたたみ中と OFF 時に余計なスタイルや行が残らない。

## continueSession — Continue session

- **識別子**: `continueSession`、表示名 `Continue session`、既定値 OFF
- **作用する面**: `client`
- **反映方式**: 即時

### 有効時の変化

直近の `turn/end` が `aborted` / `blocked` / `error` / `max-tokens` / `interrupted` で終わり、
セッションが非実行中で入力欄と添付が空のとき、コンポーザの無効な Send ボタンの代わりに
Send と同じ見た目のプライマリーボタン（`aria-label` は `Continue`）が現れる。
アイコンは Send の上矢印ではなく Continue 用の再生三角で、意図的に異なる。
押すと入力欄に `continue` を入れて通常の送信を行う。
DSH 自身が max-tokens 表示で案内する文言と同じで、新しいユーザーメッセージとして1ターンを開始する。

### 無効時の復元

スロット登録とスタイル要素が消え、Send ボタンは DSH 既定のままになる。

### 前提と制約

- `conversation.input.right`（list、scope=`session`）へ `optimizations-` 付き id で追加する。
  Send ボタン自身を包むスロットは無いため、無効な Send は CSS で隠す。
  DSH が送ボタンに安定した `data-*` を出していないため、セレクタはコンポーザの
  `data-composer-card` と自前の `data-optimizations-continue` だけを使う。
  自前ボタンを含む行（`standardControls`）を `:has(...)` で子孫から選び、その後ろの
  `button:disabled` だけを `visibility: hidden` で隠す。スロット登録は `data-slot` の
  wrapper を挟むため `:has(> ...)` では行に到達できず、Send が残ってアイコンが重なる。
  `display: none` にすると Send の 34px と gap が行から消え、`margin-left: auto` の
  せいでモデル選択などが右に寄るので、レイアウトを保つ `visibility: hidden` を使う。
  これで `input.commands` や他スロットの disabled ボタンは残る。
  `:not([hidden])` は activity 展開中に Send を消さないための条件。
  ハッシュ class とローカライズされた `aria-label`、バージョンで増減する
  `aria-busy` / `data-sending` には依存しない。
- 位置は Send と同じく右 8px、下 6px（行の padding-bottom）+ `translateY(-2px)`。
  下を 8px にすると Send より 2px 上にずれる。
- 終了理由は `ctx.sessions.binding(sessionId).eventSource` の末尾から `turn/end` を探して読む。
  DSH のチャット UI と同じ経路で、Host 側の変更や独自 RPC は使わない。
- `completed` / `forked` や実行中・入力済みのセッションには出さない。
- 押すたびに durable な `user/message` が1件増える（DSH の通常の送信と同じ）。
  Goal が armed の場合は DSH 側も自動継続し得る。

### 実装上の構造

- `lastTurnEndKind` がイベント窓の末尾から理由を読み、`shouldShowContinue` が表示条件を判定する純関数。
- `ContinueButton` は `useSyncExternalStore` でイベント窓を購読し、条件を満たすときだけボタンを描画する。
  `subscribe` / `getSnapshot` は `useCallback` で eventSource に束縛し、再レンダーごとの再購読を避ける。
- クリックは `inputActions.setDraft("continue")` と `inputActions.submit()` だけ。

### 検証

自動テスト: `src/features/continueSession.test.ts` が理由判定・表示条件・クリック・登録と後始末を確かめる。

手動確認:

1. `continueSession` を ON にする。
2. ユーザーが停止したセッション（または max-tokens で終わったセッション）を開き、入力を空にする。
3. `Continue` が表示され、押すと `continue` が送信されて新しいターンが始まることを確認する。
   このとき Send の上矢印が重ならず、モデル選択などが右に寄らないことも確認する。
4. 完了したセッション・実行中のセッション・入力中のセッションでは表示されないことを確認する。
5. OFF に戻し、スタイルとボタンが消えることを確認する。

判定: 異常終了セッションだけに Continue が出て、押下が通常の送信として記録される。

## modelPickerGrid — Model picker grid

- **識別子**: `modelPickerGrid`、表示名 `Model picker grid`、既定値 OFF
- **作用する面**: `client`
- **反映方式**: 即時

### 有効時の変化

コンポーザのモデルピッカーの一覧が等幅の複数列グリッドになる。列数はピッカー幅に応じて 3 → 2 → 1 と
減り、ピッカー自体は `min(660px, 100vw - 32px)` まで広がる。グループ見出しは全幅のまま各グループの上に
付き、長いモデル名は DSH 既存の省略表示で切れる。検索・グループ化・選択ハイライト・キーボード操作は
DSH 既存の挙動のまま。

### 無効時の復元

ピッカーは既定の1列リストと既定幅に戻る。機能が入れたスタイルは残らない。

### 前提と制約

- 着想元: [nakasyou](https://github.com/nakasyou) が DeepSeek Harness 向けに実装した
  [モデルピッカー](https://x.com/nakasyou0/status/2121598360608178628)。本機能の等幅グリッドの発想はこれによる。
- ピッカーのポップアップはスロット木の外（`body` 直下）に描画され `data-slot` を持たないため、
  DSH が公開する ARIA ロールと `data-menu-*` 属性を CSS の対象化に使う。モデル名が入る列幅は
  内容優先ではなく等幅のため、最小列幅を超える名前は省略される。
- 依存する DSH の契約（`architecture.md` の契約表の機能固有の行）:
  モデルピッカーのポップアップの CSS 対象化に ARIA ロール / `data-menu-*` 属性を使う
  （スロット外のため `data-slot` 無し）。
- DSH 追従時に確認する DOM 依存（`development.md` の追従手順の一部）:
  - ポップアップルートが `[role="group"][aria-label="Model and reasoning effort"]` であること
  - 一覧が `[role="menu"][aria-label="Model"]` で、グループに `[data-menu-group]` /
    `[data-menu-group-heading]` / `[data-menu-group-start]` と、行に `[role="menuitemradio"]` があること

### 実装上の構造

- 検索・グループ化・選択ハイライトは DSH 側の実装のまま、一覧の並びだけを CSS で変える。
  対象化の起点は DSH が公開するセマンティック属性にする: ルート
  `[role="group"][aria-label="Model and reasoning effort"]`、一覧
  `[role="menu"][aria-label="Model"]`、グループ `[data-menu-group]`、見出し
  `[data-menu-group-heading]`、行 `[role="menuitemradio"]`。CSS Modules のハッシュクラスには依存しない。
- 各グループを `repeat(auto-fill, minmax(min(164px, 100%), 1fr))` の等幅グリッドにし、
  見出しとスクロールアンカー（`[data-menu-group-start]`）を `grid-column: 1 / -1` で全幅にする。
  列数はピッカー幅に応じ 3 → 2 → 1 と連続的に減る。
- ルートの幅を `min(660px, calc(100vw - 32px))` に広げる。行とそのコピー span に `min-width: 0`
  を置いて列が内容より細くなれるようにし、長いモデル名は DSH 既存の省略表示に任せる。
- DOM 構造（検索入力・`role="menuitemradio"` の順序・選択状態）は変わらないため、キーボード操作と
  スクリーンリーダーの読み順が保たれる。
- スタイルは機能 fiber の `ctx.effect` が出し入れする。機能 OFF / アンロードで完全に消える。

### 検証

不変条件:

- I15: スタイル文字列がピッカー幅（`min(660px, calc(100vw - 32px))`）、等幅の auto-fill グリッド、
  見出し・スクロールアンカーの全幅化、列が縮めるための `min-width: 0` を含む。
- I15: 対象化が ARIA ロール / `data-menu-*` 属性のみで、CSS Modules のハッシュクラスを含まない。
- I5/I15: 機能の apply がプラグイン・機能名付きのスタイル要素を1つ出し、後始末で消す。
  （I5 は `verification.md` の共通の不変条件。）

自動テスト: `src/features/modelPickerGrid.test.ts` が I15 を確かめる。

手動確認:

1. `modelPickerGrid` を ON にする。
2. コンポーザのモデルピッカーを開く。

判定: 一覧が等幅の複数列（標準的な幅で3列）になり、グループ見出しが全幅で各グループの上に付く。
ウィンドウを狭めると列数が減り、極端に狭い幅では1列になる。長いモデル名は省略表示される。
検索・選択ハイライト・キーボード操作は変わらないこと、選択のクリックが効くことを確認する。

3. OFF に戻す。

判定: ピッカーが既定の1列リストと既定幅に戻り、スタイル要素が残らない。
