# architecture — @ph0ryn/dsh-optimizations

> この文書が答える問い: **どう設計されているか**。構造、データフロー、依存する DSH の契約、技術的制約を書く。要求そのものは `spec.md`、採用理由と代替案は `decisions.md` に置き、ここで重複させない。

## 全体構成

2エントリを1パッケージに同居させる。機能は Host 側・Client 側・両方のいずれかで実装でき、
それぞれの面が独立した機能ランタイムを持つ。

| エントリ                       | 実行環境 | 責務                                                                                  |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------- |
| `src/index.ts`（Host half）    | Node     | 設定スキーマの宣言、設定ページの自動生成抑止、バージョン警告、Host 側機能のランタイム |
| `src/client.ts`（Client half） | ブラウザ | 設定タブの登録、Client 側機能のランタイム、設定ページの描画                           |

Host half は必須である。DSH は Host Loader のエントリが読み込んだパッケージのマニフェストから
`dsh.client` を読み、クライアントバンドルを配信する。Host 行が無いパッケージのクライアントバンドルは配信されない。
Host 側の機能を持たない場合でも、設定スキーマの宣言のために Host half は必要になる。

両者は共有の純データ `src/features.ts` を import する。Host はスキーマ生成と Host 機能の適用に、
Client は一覧と Client 機能の適用に使う。

### ビルド成果物

| 成果物                   | 形式           | 備考                                                                            |
| ------------------------ | -------------- | ------------------------------------------------------------------------------- |
| `dist/server/index.js`   | ESM / Node     | `@deepseek-ai/cordis` のプラグイン                                              |
| `dist/client/client.cjs` | CJS / ブラウザ | `window.__ModuleLoader__.load({ id, factory })` 形式の Module Loader パッケージ |

クライアントバンドルは React などの共有モジュールを自前で束ねず、シェルのモジュール表から `require` する
（`deps.neverBundle`）。tsx は automatic runtime で `react/jsx-runtime` を require する形に変換する。

### マニフェスト宣言

| フィールド            | 値・意味                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsh.client.platform` | `"web"`。これ以外だとクライアントバンドルは配信されない                                                                                                                            |
| `dsh.client.inject`   | 依存する**パッケージ名**の宣言。Cordis のサービス注入ではない                                                                                                                      |
| `dsh.client.external` | 共有モジュール表の**ベースライン外**で `require` するモジュール名。本プラグインは宣言しない（`react` / `react/jsx-runtime` / primitives はシェルの `PLATFORM_MODULES` に含まれる） |
| `dsh.bundle.patch`    | 適用する `cordis.patch.yml`。宣言があると `dsh plugin add` が profile のバンドル層へ自動で加える                                                                                   |
| `exports["./client"]` | Module Loader バンドル。無いとクライアント配信時に失敗する                                                                                                                         |

Cordis のサービス注入は `src/client.ts` の `export const inject = [...]` で宣言する（上記とは別系統）。

### 識別子

3つの識別子を混同しない。値は次のとおり。

| 識別子           | 値                                          | 使われる場所                                               |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------- |
| モジュール id    | `@ph0ryn/dsh-optimizations`（パッケージ名） | `window.__ModuleLoader__.load({ id })`                     |
| Host エントリ id | `optimizations`                             | `cordis.patch.yml` の `id`、`ctx.configForms.get()` の引数 |
| セクション id    | `optimizations`                             | `settings.section` / `settings.section.icon` の `id`       |

## パッケージ構成

```text
packages/optimizations/
  package.json        exports: . / ./client、dsh.client.inject、dsh.bundle.patch
  cordis.patch.yml    - insert: [{ id: optimizations, name: "@ph0ryn/dsh-optimizations" }]
  vite.config.ts      2エントリの pack 設定
  tsconfig.json       jsx: react-jsx
  src/
    index.ts           Host half（バージョン警告、スキーマ公開、Host ランタイム起動）
    features.ts        機能レジストリ（Host/Client 共有の純データ）
    config.ts          features.ts から生成する設定スキーマと配信マーカー
    diff.ts            ON/OFF 差分の純関数（両ランタイム共有）
    fiber.ts           機能 fiber の mount/dispose と実装解決
    section.ts         settings.section 登録の固定値
    client.ts          Client half（locale 非依存）
    host/
      runtime.ts       Host 側の機能 fiber の差分適用
    client/
      runtime.ts       Client 側の機能 fiber の差分適用
    page/
      SettingsPage.tsx 設定タブ本体の配線（primitives を渡す）
      view.tsx         設定タブの描画（検索、一括操作、行の一覧）
      FeatureRow.tsx   1機能の行
      copy.ts          表示名・説明・固定文言（英語）
      styles.ts        設定ページの CSS
    features/
      host.ts          Host 機能の実装マップ
      client.ts        Client 機能の実装マップ
      compactSidebar.tsx コンパクトサイドバー（CSS 再配置 + More メニュー行）
      <feature>.tsx    Client 機能の実装（cordis プラグイン）
      <feature>.host.ts Host 機能の実装（cordis プラグイン）
    testing.ts         テスト用のダミー ctx / ConfigForm
  docs/
    spec.md architecture.md verification.md development.md decisions.md
```

## スロットの合成規則

- スロットは「セル」単位で合成される。`single` はスロット自体、`list` は登録した `id`、`keyed` はキーがセル。
- セル内のエントリは `priority` 昇順に並び、最小 `priority` の生存エントリだけが描画される。出荷側の既定は `0`。
- 同じセルに同じ `priority` で2件登録すると例外になる。
- 子スロットを宣言している席（`root`、`sidebar`、`conversation.session`、`conversation.composer.bar` など）を
  別のエントリが奪うと、その子席は描画されない。子席の再宣言も例外になる。
- すべてのスロット出口は `data-slot="<slotKey>"` を持つ `display: contents` の要素で包まれる。
  CSS の対象化はこの属性を起点にし、レイアウトは子要素に書く。
- 本プラグインは `list` / `keyed` への追加、CSS、テーマトークンだけを使う。
  追加時の `id` とキーには `optimizations-` 接頭辞を付け、他プラグインとセルを共有しない。

## 機能レジストリ

`src/features.ts` が唯一の真実。識別子、グループ、作用する面、反映方式を持つ。
React も cordis も import しない。

```ts
export const GROUPS = ["conversation", "composer", "sidebar", "shell", "host"] as const;

export interface FeatureMeta {
  readonly id: string; // 設定キーを兼ねる camelCase
  readonly group: (typeof GROUPS)[number];
  readonly host?: true; // Host 側の実装を持つ
  readonly client?: true; // Client 側の実装を持つ
  readonly reload?: "restart"; // 省略時は即時反映
}

export const FEATURES = [
  { id: "messageTime", group: "conversation", client: true },
  { id: "sessionLogRetention", group: "host", host: true, reload: "restart" },
  // ...
] as const satisfies readonly FeatureMeta[];

export type FeatureId = (typeof FEATURES)[number]["id"];
```

- **設定スキーマ**は `FEATURES` から生成する。1機能1フィールドのフラットな boolean。
  `.volatile()` を付ける（付けないと設定フォームに露出せず、編集も拒否される）。
  既定値は常に `false`。機能固有のパラメータを持たせたい場合は、この生成に
  追加フィールドを足す拡張点を用意する（v1 では使わない）。
- **配信マーカー**: `settings.describe()` は volatile フィールドを1つも持たない
  名前空間を配信対象から外す。機能が0件の間も設定タブを出すため、スキーマには
  内部フィールド `schemaVersion`（volatile、既定値 1）を常に含める。機能トグルでは
  なく設定ドキュメントの互換バージョンであり、設定ページは描画しない。
- **差分適用**は `src/diff.ts` の純関数 `diffFeatures(features, previous, next)` に集約する。
  面ごとのフィルタ（`liveFeatures(features, side)`）は呼び出し側で行い、両ランタイムは
  同じ遷移規則を共有する。
- **実装マップ**は面ごとに分ける。`src/features/client.ts` と `src/features/host.ts` が
  `Partial<Record<FeatureId, Plugin.Object>>` を持ち、`FEATURES` の `host` / `client` フラグと
  過不足が一致することをテストで固定する（面ごとに別バンドルなので同じマップに同居させない。
  Host バンドルに React を巻き込まないため）。
- グループは設定ページの並べ方だけに使う。設定キーはネストしない
  （設定フォームの単一フィールド書き込みが名前空間直下のスカラーを前提にするため）。

## 機能の実装単位

1機能 = 1つの cordis プラグイン。面ごとに独立して mount / dispose する。

```ts
export const messageTime: Plugin.Object = {
  name: "optimizations/message-time",
  inject: ["slots"],
  apply(ctx) {
    // ctx.effect(...) で登録し、後始末は cordis に任せる
  },
};
```

- 副作用は必ず `ctx.effect` の中で登録する。fiber の dispose で自動的に解除される。
- 必要なサービスは `inject` で宣言する。サービスが無い構成では fiber が PENDING のまま留まり、何も壊さない。
- 1機能の apply が投げた例外は cordis がその fiber を FAILED にし、ログに残す。他機能は影響を受けない。
- 両面で実装する機能は、Host と Client で別々の fiber になる。片側の失敗はもう片側を止めない。

## Client ランタイム（トグルの適用）

Client 側は共有 `ConfigForm` のスナップショットを購読し、差分だけを fiber に反映する。

```ts
// src/client/runtime.ts（要点）
const immediate = liveFeatures(source.features, "client");

ctx.effect(() => {
  let previous: Readonly<Record<string, unknown>> = {};
  const sync = () => {
    const value = form.getSnapshot().value;
    if (!value) return; // 未配信・読み込み中は何も適用しない
    const diff = diffFeatures(immediate, previous, value);
    previous = value;
    applyFeatureDiff(ctx, source.implementations, fibers, diff);
  };
  sync();
  const off = form.subscribe(sync);
  return () => {
    off();
    disposeFibers(fibers);
  };
});
```

- `ctx.configForms.get(entryId)` の `entryId` は **Host Loader のエントリ id**（`optimizations`）と一致させる。
- スナップショットが `undefined` の間は何も適用しない。OFF 既定を先に適用してしまう事故を避ける。
- 差分は `diffFeatures` に集約し、ON/OFF の辺だけを mount/dispose する。`applyFeatureDiff` は実装マップに無い id を例外にする。
- runtime は registry と実装マップを引数で受け取れる（既定は `FEATURES` / `CLIENT_IMPLEMENTATIONS`）。テストは合成 registry を渡す。
- 設定の変更は設定ドキュメントの更新として伝播するため、ポーリングもリロードも不要。
- 書き込みは `configForms` が revision で直列化する。古い revision の書き込みは拒否され、
  スナップショットが再読込されるため、画面は現在値に戻る。
- `reload: "restart"` の機能はこのランタイムでは扱わない（設定ページに再起動が必要と表示するだけ）。

## Host ランタイム（トグルの適用）

Host 側には設定フォームは無い。volatile フィールドの変更は、Loader が**再マウントせずに**
参照値を差し替え、所有 fiber に `loader/volatile-update` を通知する。Host ランタイムはこれを購読する。

```ts
// src/host/runtime.ts（要点）
const immediate = liveFeatures(source.features, "host");
const restart = source.features.filter((f) => f.host && f.reload === "restart");

const snapshot = () =>
  Object.fromEntries(immediate.map((f) => [f.id, config[f.id].get() === true]));

const sync = () => {
  const next = snapshot();
  const diff = diffFeatures(immediate, previous, next);
  previous = next;
  applyFeatureDiff(ctx, source.implementations, fibers, diff);
};

ctx.effect(() => {
  for (const feature of restart) {
    // 再起動反映: 起動時の値だけを見て、以後は購読しない。
    if (config[feature.id].get() === true)
      fibers.set(feature.id, ctx.plugin(implementationFor(source.implementations, feature.id)));
  }
  sync();
  const off = ctx.on("loader/volatile-update", sync);
  return () => {
    off();
    disposeFibers(fibers);
  };
});
```

- `loader/volatile-update` は値が実際に変わったときだけ、所有 fiber に配送される。
  通知時点で新しい値は commit 済みなので、`config.<id>.get()` は新しい値を返す。
- イベント購読には `@deepseek-ai/cordis-plugin-loader` の型宣言が必要になる。
- `reload: "restart"` の機能は起動時にだけ評価し、トグルを変えても再マウントしない。
- 起動時に1回 `sync()` するため、起動時点で ON の機能は `loader/volatile-update` を待たずに mount される。

## 設定タブ

Host が名前空間を配信している間だけ登録する。

```ts
ctx.effect(() =>
  ctx.configForms.whileServed(["optimizations"], () =>
    ctx.slots.inject("settings.section", () =>
      ctx.slots.register(
        { name: "settings.section", id: "optimizations", order: 25, label: "Optimizations" },
        SettingsPage,
      ),
    ),
  ),
);
```

- `label` は静的文字列。`locale` を宣言しないため、locale 辞書の登録は不要（対応する辞書が無いと描画時に失敗する）。
- アイコンはシェル既定の glyph（gear）に任せる。`settings.section.icon` は DSH 0.2.2 系のスロットで、
  ワークスペースの型基準（0.2.1-rc.2）には存在しない。型基準を上げるまで登録しない（`decisions.md` D15）。
- `order: 25` は出荷セクション（account -10、general 0、models 10、plugins 15、agent-presets 20）の直後で、
  既存の並びに割り込まない。
- ページの状態は `form.getSnapshot()` を `useSyncExternalStore` で購読する。書き込みは `form.set(id, boolean)`、
  一括操作は `form.mutate(ops)` で1回の書き込みにまとめる。
- 書き込みが拒否されたらスナップショットが自動で再読込されるため、画面は現在値に戻り、行内にエラーを出す。
- スタイルは設定ページが開いている間だけ、ページが `style[data-plugin="@ph0ryn/dsh-optimizations"]` を描画する。
  設定を閉じると React が要素を外すため、通常の画面にはプラグイン由来のスタイルが残らない。

## コンパクトサイドバー（compactSidebar）

既存コントロールを複製せず、シェルが描画した要素を CSS で1行に寄せる。

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

## 依存する DSH の契約

利用してよいのは以下に限る。バージョン差の影響を受けるため、追加時は `development.md` の追従手順に従う。

| 契約                                                     | 用途                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `settings.section`（list slot）                          | 設定タブの登録                                                              |
| `settings.section.icon`（list slot、DSH ≥ 0.2.2）        | ナビゲーションアイコン（現行の型基準では未使用）                            |
| `ctx.configForms.get` / `set` / `mutate` / `whileServed` | 設定値の読み書き、配信状況の監視                                            |
| `ctx.slots.inject` / `ctx.slots.register`                | スロットへの寄与                                                            |
| `ctx.plugin` と `Fiber.dispose`                          | 機能のマウント・アンマウント（両面）                                        |
| `loader/volatile-update` イベント                        | Host 側のトグル反映（所有 fiber に配送される）                              |
| `ctx.theme.overrideTokens`                               | 色・トークンの上書き（戻り値の disposer で解除）                            |
| `data-slot="<slot 名>"` 属性                             | 既存 UI を CSS で対象化する際の起点                                         |
| シェルが公開する `data-*` 属性                           | 状態に応じた CSS の条件付け                                                 |
| `--dsw-*` / `--dsh-*` CSS 変数                           | 見た目の調整                                                                |
| `@deepseek-ai/dsh-client-ui-primitives`                  | `Switch` / `Input` / `Button`（シェルの `PLATFORM_MODULES` 経由で require） |

### 禁止事項

- CSS Modules のクラス名（例 `_card_u7vgf_24`）への依存。ビルドごとに変わる。
- `single` スロットの奪取（既存 UI の置き換え）。子スロットを持つ席では子 UI が消え、
  同じ `priority` の登録は例外になり、他プラグインと競合する。
- DOM の直接改変や `MutationObserver` によるパッチ。React の再描画と衝突する。
- 他プラグインの設定名前空間への書き込み、他パッケージのファイル改変。
- 機能の効果をグローバルに常駐させること（OFF で消えない登録）。

## ライフサイクル

1. Host 起動 → 設定スキーマ公開 → `settings.configure({ auto: false })` で自動生成ページを抑止
   （現行のクライアントは `autoGenerate` を消費しないため実効は no-op だが、将来の互換のため宣言する）
   → Host ランタイムが即時反映機能を起動時値で mount し、`loader/volatile-update` を購読する。
2. Client 起動 → Client ランタイム開始（スナップショットが `undefined` の間は何もしない）
   → 名前空間の配信を待つ → 設定タブ登録。タブは配信が止まると自動で外れる。
3. トグル変更 → 設定ドキュメント更新 → Loader が volatile 値を commit
   → Host は `loader/volatile-update`、Client はスナップショット購読で fiber を mount/dispose。
4. HMR や fiber 再起動 → `ctx.effect` の後始末が走り、次回起動時に再適用される。
   HMR ではプラグイン内の React state は失われる。
