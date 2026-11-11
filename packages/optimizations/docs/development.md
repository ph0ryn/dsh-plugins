# development — @ph0ryn/dsh-optimizations

> この文書が答える問い: **開発・ビルド・ローカル導入・追随をどう行うか**。手順を書き、要求は `spec.md`、設計は `architecture.md` を参照する。

## 前提

- リポジトリの前提に従う: Node.js 22.19 以上、pnpm 11.22.0。
- 動作確認済みの DSH バージョンは、ホスト側 `src/index.ts` の `EXPECTED_DSH_VERSIONS` に列挙する。
  現在はワークスペースの型基準 `0.2.1-rc.2` と `0.2.2-alpha.3` を入れてある。
  手元の DSH (`dsh --version`) を変えたら一覧と `architecture.md` の型基準の記述を更新する。
- `package.json` の `peerDependencies` も `catalog:` で参照する。pnpm は pack / publish 時に
  実 range へ置き換えるため、公開物の互換判定は従来どおり range で行われる。`engines.dsh` を
  宣言しない理由は `architecture.md` の「バージョン要件」を参照する。
- Host ランタイムが購読する `loader/volatile-update` の型宣言のため、`@deepseek-ai/cordis-plugin-loader` を
  devDependency に置き、型だけを import する。
- テストは `node --import tsx --test` で実行する。ページを `.tsx` で書いているため、Node の型剥がしだけでは
  テストから import できない。`tsx` はテスト実行のためだけの devDependency。
- DSH はグローバルインストールされた CLI (`dsh`) と、profile ディレクトリ（既定 `$DSH_HOME/profiles/<name>`）を使う。

## コマンド

リポジトリのルートで実行する。

```sh
pnpm --filter @ph0ryn/dsh-optimizations typecheck
pnpm --filter @ph0ryn/dsh-optimizations test
pnpm --filter @ph0ryn/dsh-optimizations build
```

`build` は `vp pack` の後に `src/dist.check.ts` を実行し、Module Loader 契約と識別子の
突き合わせ（`verification.md` の I8 / I9）まで確認する。

全体の検査は CI と同じ順で実行する。

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

整形は `pnpm format`。Markdown も対象に含まれる。

## インストール

公開パッケージを profile に入れる。

```sh
dsh plugin --profile web add @ph0ryn/dsh-optimizations --ignore-scripts
```

`dsh plugin` は profile ディレクトリで pnpm を実行する薄いラッパである。インストール後、
パッケージが `dsh.bundle.patch` を宣言していれば、profile の `package.json` の
`dsh.profile.bundles` へ自動で追加され、パッチが適用される。手作業での追記は不要。

- **確認**: profile の `package.json` の `dependencies` と `dsh.profile.bundles` に `@ph0ryn/dsh-optimizations` が入る。
- **更新**: 新しいバージョンを公開したら同じ `dsh plugin add` を再実行する。
- **削除**: `dsh plugin --profile web remove @ph0ryn/dsh-optimizations`。バンドル一覧からも外れる。
- **設定の削除**: profile の `cordis.patch.yml` にある `optimizations` の `config` を消す。

GUI の Plugins パネルからでも同じ操作ができる（インストール・有効/無効・更新）。

### ソースから

`peerDependencies` が `catalog:` のまま link される `file:` 指定は互換判定を通らないため、
tarball を作ってから入れる。

```sh
pnpm --filter @ph0ryn/dsh-optimizations pack --pack-destination ./artifacts
dsh plugin --profile web add ./artifacts/ph0ryn-dsh-optimizations-0.1.0.tgz --ignore-scripts
```

`pack` は作業ツリーの `package.json` を書き換える（`prepack` の `clean-pkg-json`）ので、
確認後は `git restore packages/optimizations/package.json` で戻す。

### 旧 `dsh-optimize` からの移行

未公開だった `dsh-optimize` を `file:` で入れている profile は、パッケージ名と設定名前空間が
変わっているため入れ替える。

```sh
dsh plugin --profile web remove dsh-optimize
dsh plugin --profile web add @ph0ryn/dsh-optimizations --ignore-scripts
```

設定を引き継ぐには、profile の `cordis.patch.yml` にある旧エントリの `id: optimize` を
`id: optimizations` に、`name: dsh-optimize` を `name: "@ph0ryn/dsh-optimizations"` に書き換える。

### 開発ループ

1. クライアントを変更したら `pnpm --filter @ph0ryn/dsh-optimizations build` を実行する。
2. ホストは配信中のクライアント成果物を監視しており、成果物が変わると HMR で差し替える。
   反映されない場合はページを再読み込みする。
3. HMR ではプラグイン内の React state が失われる。トグル操作の途中状態は保存されない前提で確認する。

DSH 本体のチェックアウトで使う `pnpm run dev:web` は、本プラグインの開発には不要。

## 機能の追加手順

1. 実装を書く。作用する面ごとに cordis プラグインを1つ用意する。
   - Client 面: `src/features/<id>.tsx`。スロットへ追加する場合、`id` とキーには `optimizations-` 接頭辞を付ける。
   - Host 面: `src/features/<id>.host.ts`。
   - `name` は `optimizations/<id>`。副作用は `ctx.effect` の中で登録し、戻り値の disposer で必ず解除する。
   - 必要なサービスは `inject` に列挙する。無い構成では PENDING で留まる前提で書く。
2. 実装マップに1行追加する。面ごとに別のマップである。
   - Client: `src/features/client.ts`
   - Host: `src/features/host.ts`
3. `src/features.ts` の `FEATURES` に1エントリ追加する（`id`、`group`、`host` / `client` フラグ、
   必要なら `reload: "restart"`）。設定スキーマはここから生成されるため、`config.ts` を手で編集しない。
4. `src/page/copy.ts` に表示名と説明を英語で追加する（全 id 分が揃っていないとテストが落ちる）。
5. `spec.md` の機能仕様に1小節追記する。各小節は次の項目を持つ。
   - 識別子: 設定キー（camelCase）、表示名、既定値（OFF 固定）
   - 作用する面: `host` / `client` / 両方
   - 反映方式: 即時 / 再起動
   - 有効時の変化: 利用者が観測できる変化（見た目・操作・出力・振る舞い）
   - 無効時の復元: 打ち消される副作用（スタイル、登録、購読、Host 側の提供）
   - 前提と制約: 依存する DSH の契約、他機能・他プラグインとの排他
6. テストを足す。差分と面の扱いは `src/diff.test.ts` / `src/hostRuntime.test.ts` / `src/clientRuntime.test.ts`、
   ページの行・検索・書き込みは `src/settingsPage.test.ts` の合成 registry パターンに合わせる。
7. シェルの DOM を対象にする Client 機能は、`src/compactSidebar.test.ts` のようにスタイル文字列・
   スロット登録・後始末をテストし、見た目は `verification.md` の手動確認で補う。

## DSH 更新時の追従

DSH を更新したら、次の順で確認する。

1. `EXPECTED_DSH_VERSIONS` に新しいバージョンを追加する。互換性が未確認なら追加しない。
2. `@deepseek-ai/dsh` の型定義で、`architecture.md` の「依存する DSH の契約」表の各項目を確認する。
   - `settings.section` の契約（`settings.section.icon` は DSH 0.2.2 系で追加された。型基準を上げたら登録を検討する）
   - `ConfigForm` の `get` / `set` / `mutate` / `whileServed`
   - `loader/volatile-update` イベント（`@deepseek-ai/cordis-plugin-loader`）の有無と通知条件
   - `ctx.theme.overrideTokens` の有無と引数
   - `@deepseek-ai/dsh-client-ui-primitives` の `Switch` / `Input` / `Button` の export
3. シェルの共有モジュール表に `react` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` が
   残っていることを、配信される `dsh-web-frontend` のバンドルで確認する。
4. CSS の対象化に使っている `data-slot` 名と `data-*` 属性が残っているか確認する。
   `compactSidebar` はサイドバーの要素の並びに依存するため、次を確認する。
   - `[data-slot="sidebar"]` 直下のロゴ行 / New Session ボタン / `nav`（パネル行 + More アンカー）の並び
   - `[data-slot="sidebar.brand.name"]` と `[data-slot="sidebar.panellist"]` の存在
   - More アンカーが `nav` の最後の子で、`aria-haspopup="menu"` を持つボタンであること
5. 手動確認（`verification.md`）を一通り実行する。

## 公開

リリースは GitHub Actions の Release ワークフローが行う。ディレクトリ名を使ったタグ
`<plugin>-v<version>`（例 `optimizations-v0.1.0`）を push すると、ワークフローが
`packages/optimizations/package.json` を読み、`pnpm --filter @ph0ryn/dsh-optimizations pack` で
tarball を作成し、npm と GitHub Release に公開する。`package.json` の `version` とタグの version は
一致させる。

公開物をローカルで確認する場合:

```sh
pnpm --filter @ph0ryn/dsh-optimizations pack --pack-destination ./artifacts
tar -tzf artifacts/ph0ryn-dsh-optimizations-*.tgz
```

`prepack` が `dist` をビルドして `clean-pkg-json --keep dsh` を実行するため、tarball 内の
`package.json` からは `scripts` と `devDependencies` が除かれる（`dsh`、`peerDependencies`、`files` は残る）。
`pack` は作業ツリーの `package.json` も書き換えるので、確認後は
`git restore packages/optimizations/package.json` で戻す。

## デバッグ

- 本プラグインのスタイルは `style[data-plugin="@ph0ryn/dsh-optimizations"]` で見つかる。
- 各機能の適用状況は、fiber 名 `optimizations/<id>` でログを追う。
- 設定の実体は profile の `cordis.patch.yml` の `optimizations` セクション。書き込みに失敗する場合は
  まずこのファイルの権限と `writable` を確認する。
- **タブが出ない**: `cordis.patch.yml` の `id` と `ctx.configForms.get()` の引数が一致しているか、
  `Config` の全フィールドに `.volatile()` が付いているかを確認する。volatile が無いと名前空間が
  設定ドキュメントに現れず、`whileServed` が発火しないためタブも登録されない。
- **トグルが効かない**: `ctx.plugin()` に渡す実装マップのキーと `FEATURES` の `id` が一致しているか、
  機能側の `inject` が満たされているかを確認する。満たされない fiber は PENDING のまま無言で待つ。
