# verification — @ph0ryn/dsh-optimizations

> この文書が答える問い: **どうやって正しさを確かめるか**。検証する不変条件、自動テスト、手動確認の手順と判定基準を書く。要求は `spec.md` を参照し、ここで再定義しない。

## 検証する不変条件

| #   | 不変条件                                                                                                                                               | 対応する契約 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| I1  | `FEATURES` の全 id に、設定スキーマのフィールド・各面の実装・英語の表示名と説明が存在する                                                              | S1, S2       |
| I2  | 機能の全フィールドが volatile で既定値が false。`schemaVersion` だけが非機能フィールドとして volatile（既定値 1）                                      | S2, S4       |
| I3  | 設定タブは `id: optimizations` / `order: 25` / `label: "Optimizations"` で1回だけ登録される（`src/section.ts`）                                        | S1           |
| I4  | 差分適用は、ON の機能だけを mount し、OFF になった機能だけを dispose する（Host と Client の両面で）                                                   | S2, S3       |
| I5  | 全機能 OFF のとき、機能由来のスタイル・スロット寄与・購読・Host 側の登録がゼロである。設定ページのスタイルはページを開いている間だけ存在する           | S2, S3       |
| I6  | 設定の書き込みは `configForms` 経由で、トグル1操作が 1 write に収まる（一括操作は `mutate` 1回）                                                       | S3, S4       |
| I7  | 1機能の apply 失敗が他機能と設定ページに影響しない。両面の機能では片側の失敗が他方を止めない                                                           | S6           |
| I8  | ビルド成果物が Module Loader 契約（`window.__ModuleLoader__.load`、id `@ph0ryn/dsh-optimizations`）を満たし、JSX が残っていない（`src/dist.check.ts`） | S1           |
| I9  | モジュール id / Host エントリ id / セクション id の3つが設計どおりで、互いに取り違えられていない                                                       | S1, S4       |
| I10 | 設定の書き込みが profile の設定ドキュメントに反映され、再起動後に復元される                                                                            | S4           |
| I11 | Host 側の機能は `loader/volatile-update` の後にだけ mount/dispose され、起動時にも現在値で1回同期される                                                | S2, S3       |
| I12 | 再起動反映の機能は起動時にだけ評価され、トグルでは再マウントされず、行に「再起動が必要」と表示される                                                   | S2, S3       |

## 自動テスト

テストはパッケージ内で実行する。ページの `.tsx` を Node の型剥がしだけでは読み込めないため、
`pnpm --filter @ph0ryn/dsh-optimizations test` はテスト実行時のみ `tsx` ローダーを使う。

```sh
pnpm --filter @ph0ryn/dsh-optimizations typecheck
pnpm --filter @ph0ryn/dsh-optimizations test
pnpm --filter @ph0ryn/dsh-optimizations build
```

### レジストリ・スキーマ（`src/features.test.ts`）

- I1: `FEATURES` と両面の実装マップのキー集合、`COPY` の網羅、id の形式・グループ・作用面。
- I2: 機能フィールドが volatile で既定値 false。`schemaVersion` は volatile・既定値 1。
  機能以外のフィールドは `schemaVersion` だけ。
- I3: `SECTION` の `{ name, id, order, label }` を固定値と比較する。

### 差分適用（`src/diff.test.ts` / `src/hostRuntime.test.ts` / `src/clientRuntime.test.ts`）

- I4: `diffFeatures` の初期 `{}`、部分的な値、全 ON → 全 OFF、無関係キー、非 boolean 値、面と再起動のフィルタ。
- I5: ダミー ctx で両ランタイムを起動し、全 OFF のとき `ctx.plugin` が呼ばれず、後始末で
  fiber と購読がゼロに戻ることを検証する。
- I7: 実装マップに無い id を mount しようとすると例外になる（登録整合性は I1 で固定）。
- I11: Host ランタイムは起動時に1回同期し、`loader/volatile-update` を発火させたときだけ fiber が
  増減すること、通知前の値変更では何も起きないことを検証する。
- I12: `reload: "restart"` の機能は起動時のみ mount され、イベント発火では変化しないことを検証する。

ランタイムには合成 registry と実装マップを渡して検証する（`src/testing.ts` のダミー ctx / ConfigForm）。

### 設定ページ（`src/settingsPage.test.ts`、react-test-renderer）

- I1: 行が渡した registry と同じ件数・順序で描画され、作用面と再起動の表示が付く。空 registry では空状態。
- I6: Switch 1操作で `form.set(id, true)` が1回。一括 ON / 一括 OFF / 初期値復帰は `form.mutate` が1回で、
  初期値復帰は `unset` オペレーションになる。
- S2: 名前・説明・状態・操作手段・作用面・反映方式が行に現れ、名前と説明で絞り込める。
- S5: `writable: false` で全トグルと一括操作が disabled になり、読み取り専用の注記が出る。
- S6: 書き込み拒否で現在値が再表示され、`role="alert"` のエラーが出る。

### コンパクトサイドバー（`src/compactSidebar.test.ts`）

- I13: スタイル文字列が expanded 専用のコンテナクエリ、パネル行の非表示、既存ボタンの絶対配置、
  ブランド名の非表示を含む。機能の apply がスタイル要素と `sidebar.panellist.actions` の行登録を
  行い、後始末で両方が消える。
- I14: `panelRows` が登録順・ラベル（文字列 / thunk / 未設定）を解決する。`SidebarNavRows` が全パネルを
  アイコン付きで描画し、クリックで `selectPanel` と `onDismiss` を1回ずつ呼ぶ。現在のパネルに
  `aria-current` が付く。

### ビルド成果物（`src/dist.check.ts`、`build` の一部）

- I8: `dist/client/client.cjs` が `window.__ModuleLoader__.load({id:"@ph0ryn/dsh-optimizations",factory:...` で始まり、
  評価できること（生の JSX が残っていないことの実証）と `react/jsx-runtime` を require することを検証する。
  `dist/server/index.js` が `name` / `Config` / `apply` を export することを import で検証する。
- I9: モジュール id `@ph0ryn/dsh-optimizations`、`cordis.patch.yml` の `optimizations`、`SECTION.id` の `optimizations` を突き合わせる。

### 設定の永続化（`src/settingsPersistence.test.ts`、実 Loader / Settings）

- I2/I10: `settings.describe()` に `optimizations` が現れ、`applies: "live"`、`value` が `{ schemaVersion: 1 }`、
  配信フォームのスキーマが `schemaVersion` だけであることを確認する。`mutate` で `schemaVersion` を書くと
  revision が増え、profile の `cordis.patch.yml` に現れ、再起動後も復元される。
- I6: 古い revision の書き込みが `SettingsConflictError` で拒否され、ファイルが変わらない。
- I9: Host エントリを無効化すると `describe()` から `optimizations` が消える。

## 手動確認

自動テストで担保できない統合部分は、次の手順と判定基準で確認する。

### 1. 導入とタブ表示

1. `development.md` の手順でローカルインストールし、Web GUI を開く。
2. Settings を開く。

判定: ナビゲーションに `Optimizations` がアイコン付きで1つ表示され、選択すると機能一覧が開く。
機能が0件の間は、空であることを示す文言が出る。アイコンはシェル既定の glyph でよい。

### 2. トグルの即時反映と永続化

1. 見た目に影響する機能を1つ ON にする（例: 余白の変更）。
2. 画面が保存操作なしで変わることを確認する。
3. profile の設定ファイルを開く。

判定: `optimizations` の設定に該当キーが `true` で書かれている。再読み込み後も ON のまま。
OFF に戻すと見た目が完全に元へ戻り、設定ファイルからキーが消える（または `false`）。

### 3. 無効時の無影響

1. 全機能を OFF にする。
2. DevTools で DOM を確認する。

判定: 設定を閉じた状態で、本プラグインの `<style data-plugin="@ph0ryn/dsh-optimizations">` が存在しない。
スロットに本プラグイン由来の要素が無い。見た目と挙動が素の DSH と一致する。
（設定ページを開いている間だけ、ページ自身がスタイル要素を描画する。）

### 4. 失敗隔離

1. 開発時、1機能の apply で意図的に例外を投げる。

判定: その機能だけが効かず、他の機能とタブは動作する。コンソールに当該 fiber の失敗が記録される。

### 5. バージョン警告

1. 期待バージョン以外の DSH で起動する。

判定: 起動ログに警告が出る。タブと機能は引き続き試行される。

### 6. Host 側の機能

1. Host と Client の両面を持つ機能を ON にする（または Host 側だけの機能を ON にする）。

判定: ページを再読み込みせずに Host 側の効果が現れる。OFF に戻すと Host 側の提供（登録・購読）が消え、
ログにエラーが残らない。

### 7. コンパクトサイドバー

1. `compactSidebar` を ON にする。
2. サイドバー上部が1行（ブランドマーク / New Session / More / 折りたたみ）になり、
   Workspaces が上に広がることを確認する。
3. More ボタンを押し、メニュー先頭に Plugins / Automation tasks / Context Insights などが
   サイドバーと同じ順・同じアイコンで並ぶことを確認する。1行を選ぶとパネルが開き、メニューが閉じる。
4. サイドバーを折りたたみ、レール表示が通常どおりであることを確認する。展開すると1行表示に戻る。
5. OFF に戻し、ロゴ行・New Session 行・パネル行・余白が元に戻ることを確認する。

判定: メニュー経由で全パネルに到達できる。折りたたみ中と OFF 時に余計なスタイルや行が残らない。

### 8. 再起動反映の機能

1. 「再起動が必要」と表示される機能を ON にする。
2. ページを再読み込みし、次に DSH を再起動する。

判定: トグル直後とページ再読み込み後は効果が現れない。DSH 再起動後にだけ効果が現れる。

## 自動化しない範囲と理由

- 実際の DSH シェル上でのスロット描画位置と見た目は、ブラウザのレンダリングに依存するため自動化しない。
  手動確認 1〜3 で代替する。
- Host 側の機能が外部プロセスやネットワークに及ぼす効果は、環境依存のため自動化しない。手動確認 6 で代替する。
- 他プラグインとの共存（notify-sounds、siwc、テーマ系）は組み合わせが利用者依存のため、
  手動確認の際に有効化して目視する。
