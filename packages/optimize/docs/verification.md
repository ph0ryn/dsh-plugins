# verification — dsh-optimize

> この文書が答える問い: **どうやって正しさを確かめるか**。検証する不変条件、自動テスト、手動確認の手順と判定基準を書く。要求は `spec.md` を参照し、ここで再定義しない。

## 検証する不変条件

| #   | 不変条件                                                                                                           | 対応する契約 |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------ |
| I1  | `FEATURES` の全 id に、設定スキーマのフィールド・各面の実装・英語の表示名と説明が存在する                          | S1, S2       |
| I2  | 設定スキーマの全フィールドが volatile で、既定値が false                                                           | S2, S4       |
| I3  | 設定タブは `id: optimize` / `order: 25` / `label: "Optimization"` で1回だけ登録される                              | S1           |
| I4  | 差分適用は、ON の機能だけを mount し、OFF になった機能だけを dispose する（Host と Client の両面で）               | S2, S3       |
| I5  | 全機能 OFF のとき、注入するスタイル・スロット寄与・購読・Host 側の登録がゼロである                                 | S2, S3       |
| I6  | 設定の書き込みは `configForms` 経由で、トグル1操作が 1 write に収まる（一括操作は `mutate` 1回）                   | S3, S4       |
| I7  | 1機能の apply 失敗が他機能と設定ページに影響しない。両面の機能では片側の失敗が他方を止めない                       | S6           |
| I8  | ビルド成果物が Module Loader 契約（`window.__ModuleLoader__.load`、id `dsh-optimize`）を満たし、JSX が残っていない | S1           |
| I9  | モジュール id / Host エントリ id / セクション id の3つが設計どおりで、互いに取り違えられていない                   | S1, S4       |
| I10 | 設定の書き込みが profile の設定ドキュメントに反映され、再起動後に復元される                                        | S4           |
| I11 | Host 側の機能は `loader/volatile-update` の後にだけ mount/dispose され、起動時にも現在値で1回同期される            | S2, S3       |
| I12 | 再起動反映の機能は起動時にだけ評価され、トグルでは再マウントされず、行に「再起動が必要」と表示される               | S2, S3       |

## 自動テスト

### レジストリ・スキーマ（Node の unit test）

- I1: `FEATURES` と Host / Client それぞれの実装マップのキー集合が、`host` / `client` フラグと一致する。
  表示名・説明の辞書キーが全 id を網羅する。
- I2: 生成したスキーマの各フィールドが `volatile` で既定値 false である。
- I3: `buildSectionRegistration()` が返す `{ name, id, order, label }` を固定値と比較する。
- I4: 差分計算を純関数 `diffFeatures(features, previous, next)` として切り出し、面ごとの mount/dispose の集合を
  検証する（初期 `undefined`、部分的な値、全 ON → 全 OFF、無関係キーの混入、`reload: "restart"` の除外）。
- I5: ダミー ctx で両ランタイムを起動し、全 OFF のとき `ctx.plugin` が呼ばれず `ctx.effect` の後始末で
  登録がゼロに戻ることを検証する。
- I11: ダミー ctx で Host ランタイムを起動し、`loader/volatile-update` を発火させたときだけ fiber が
  増減すること、起動時に現在値で1回同期されることを検証する。
- I12: `reload: "restart"` の機能は起動時のみ mount され、イベント発火では変化しないことを検証する。

### 設定ページ（react-test-renderer）

- I1: 行が `FEATURES` と同じ件数・順序で描画される。検索語で絞り込める。
- I6: Switch の操作で `form.set(id, true)` が1回呼ばれる。一括 ON/OFF は `form.mutate` が1回だけ呼ばれる。
- S5: `writable: false` のスナップショットで全トグルが disabled になり、読み取り専用の注記が出る。

### ビルド成果物（ビルド後の検査）

- I8: `dist/client/client.cjs` が `window.__ModuleLoader__.load({id:"dsh-optimize"` で始まり、
  外部モジュールを `require` し、`jsx` 相当の変換漏れ（生の JSX）が無い。
- I8: `dist/server/index.js` が `name` と `Config` と `apply` を export する。
- I9: クライアントバンドルの `id`、`cordis.patch.yml` の `id`、セクション登録の `id` を突き合わせ、
  `dsh-optimize` / `optimize` / `optimize` の組になっていることを固定値で検査する。

### 設定の永続化（ホスト統合テスト）

`packages/siwc/src/settingsPersistence.test.ts` と同じ構成で、一時 profile を対象に検証する。

- I10: `settings.describe()` に `optimize` が現れ、`applies: "live"` と全フィールドの `volatile` が確認できる。
- I2, I10: `mutate` で1フィールドを書き、`describe` の revision が増え、profile の `cordis.patch.yml` に
  `optimize` の `config` が現れる。再読込で値が復元される。
- I6: 古い revision の書き込みが競合として拒否され、ファイルが変わらない。
- I2: volatile でないフィールドへの書き込みが拒否される。
- I9: Host エントリを無効化すると `describe` から `optimize` が消え、クライアント側の
  `whileServed` が発火しない（タブが登録されない）。

## 手動確認

自動テストで担保できない統合部分は、次の手順と判定基準で確認する。

### 1. 導入とタブ表示

1. `development.md` の手順でローカルインストールし、Web GUI を開く。
2. Settings を開く。

判定: ナビゲーションに `Optimization` がアイコン付きで1つ表示され、選択すると機能一覧が開く。

### 2. トグルの即時反映と永続化

1. 見た目に影響する機能を1つ ON にする（例: 余白の変更）。
2. 画面が保存操作なしで変わることを確認する。
3. profile の設定ファイルを開く。

判定: `optimize` の設定に該当キーが `true` で書かれている。再読み込み後も ON のまま。
OFF に戻すと見た目が完全に元へ戻り、設定ファイルからキーが消える（または `false`）。

### 3. 無効時の無影響

1. 全機能を OFF にする。
2. DevTools で DOM を確認する。

判定: 本プラグインの `<style data-plugin="dsh-optimize">` が存在しない。
スロットに本プラグイン由来の要素が無い。見た目と挙動が素の DSH と一致する。

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

### 7. 再起動反映の機能

1. 「再起動が必要」と表示される機能を ON にする。
2. ページを再読み込みし、次に DSH を再起動する。

判定: トグル直後とページ再読み込み後は効果が現れない。DSH 再起動後にだけ効果が現れる。

## 自動化しない範囲と理由

- 実際の DSH シェル上でのスロット描画位置と見た目は、ブラウザのレンダリングに依存するため自動化しない。
  手動確認 1〜3 で代替する。
- Host 側の機能が外部プロセスやネットワークに及ぼす効果は、環境依存のため自動化しない。手動確認 6 で代替する。
- 他プラグインとの共存（notify-sounds、siwc、テーマ系）は組み合わせが利用者依存のため、
  手動確認の際に有効化して目視する。
