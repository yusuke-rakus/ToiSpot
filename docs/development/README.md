# 開発環境とコマンド

[概要](../../README.md) · [文書一覧](../README.md)

## 必要な環境

- Node.js 24系、24.12.0以上。現行Firebase SDK・権限テストライブラリの実行要件に合わせる。
- pnpm 12系（12.16.1）。lockfileを使い `pnpm install --frozen-lockfile` で依存関係を再現する。
- PlaywrightのChromium：ブラウザテスト時のみ必要。
- Docker Desktop（またはDocker EngineとCompose v2）：Auth・Firestore Emulatorの起動に使用する。
- Java 21以上：Dockerを使わず `pnpm emulators:local` / `pnpm test:rules` を実行する場合のみ必要。DockerイメージにはJava 21とFirebase CLIを含む。

Node.jsの選択用に `.nvmrc` と `.node-version` を用意した。Voltaを使用する場合も実行するNode.jsを24系に選択する。Firebase CLIは開発依存とDockerイメージに含め、ホストのグローバルインストールに依存しない。pnpmのキャッシュ・ストアは `pnpm-workspace.yaml` によりプロジェクト内の `.cache/` に保存する。

## 起動

```sh
pnpm install --frozen-lockfile
pnpm emulators
pnpm seed
pnpm dev
```

APIキー未設定では設定案内を表示する。`.env` または `.env.local` に `VITE_GOOGLE_MAPS_API_KEY` を設定するとGoogleマップを表示する。`VITE_USE_FIREBASE_EMULATORS=true`でローカルの店舗情報を取得する。[店舗データの登録・整理](sample-data.md)と[地図の設定と操作](../architecture/map.md)を参照する。

環境ファイルがまだない場合は、`.env.example` を `.env.local` にコピーする。既存のキー設定を上書きしない。初期値の `VITE_USE_FIREBASE_EMULATORS=true` では架空の `demo-toilet-map` プロジェクトを使う。

```sh
cp .env.example .env.local
pnpm emulators
```

`pnpm emulators` はイメージをビルドしてバックグラウンド起動し、ヘルスチェックの完了まで待つ。初回ビルドにはネット接続が必要。フロントエンドはホストで `pnpm dev` を実行する。クライアントの `getFirebaseServices()` を呼んだ時だけ初期化・接続する。

| 接続先         | URL                    |
| -------------- | ---------------------- |
| Emulator UI    | http://127.0.0.1:14001 |
| Authentication | http://127.0.0.1:19090 |
| Firestore      | http://127.0.0.1:18081 |

Docker内では `0.0.0.0` で待ち受け、ホストへは `127.0.0.1` に限定して公開する。Storage・Functions・Hosting Emulatorは起動しない。`.env` やクラウド認証情報をコンテナに渡す必要はない。プロジェクトIDはSDKと同じ `demo-toilet-map` に固定している。

```sh
pnpm emulators:logs
pnpm emulators:stop
```

Authアカウント・Firestoreデータは正常停止時にDockerの名前付きボリューム `firebase-data` へexportし、次回起動時にimportする。`docker compose down` でも保存される。強制終了では直前の変更が保存されない場合がある。データを初期化する場合だけ `docker compose down --volumes` を実行する。

Rules・インデックス・Docker用設定は読み取り専用でマウントする。設定変更後は `docker compose restart firebase`、Dockerfile・起動スクリプト変更後は `pnpm emulators` で再ビルドする。

`docker/firebase.json` はDocker専用で、ルートの `firebase.json` はホストでのEmulator実行・将来のHosting設定用。Dockerを使わず起動する場合はJava 21以上を準備して `pnpm emulators:local` を実行する。Docker版と同時には起動しない。

管理者ログイン・登録編集は[管理者機能の手順](admin.md)を参照する。`ADMIN_GOOGLE_EMAIL`を設定して`pnpm seed`を実行し、`/admin-login`の「Googleでログイン」から模擬Googleアカウントを選択する。環境変数の優先順位は`.env`→`.env.local`→シェル。未指定時は既存の管理者設定を保持する。

`VITE_USE_FIREBASE_EMULATORS=false` は将来のクラウド接続用で、店舗取得・ログイン・保存は無効になる。各データアクセス関数もクラウドへのアクセスを拒否する。Firebaseの設定とは別に、Mapsのキー設定時は地図表示が始まる。

## 検証コマンド

| コマンド                 | 内容                                                                           |
| ------------------------ | ------------------------------------------------------------------------------ |
| `pnpm docs:dependencies` | 導入済みの直接依存からバージョン一覧を再生成                                   |
| `pnpm seed`              | 万願寺周辺のテスト店舗7件・紐付けの不足分と、指定された管理者設定をローカルへ投入 |
| `pnpm stores:cleanup`    | Place IDのない旧店舗と架空サンプルの件数確認（`--apply`で削除）                |
| `pnpm docs:check`        | 文書リンク、見出し階層、要件・未決事項IDを検証                                 |
| `pnpm typecheck`         | TypeScriptの型検査                                                             |
| `pnpm lint`              | ESLintによる検査                                                               |
| `pnpm test`              | Vitestの単体・画面テスト用プロジェクト                                         |
| `pnpm build`             | 型検査と本番用ビルド                                                           |
| `pnpm check`             | 文書・型・lint・単体テスト・ビルドをまとめて実行                               |
| `pnpm format:check`      | Prettierの書式確認                                                             |
| `pnpm format`            | Prettierで整形                                                                 |
| `pnpm test:e2e`          | PC・モバイルサイズでPlaywrightを実行                                           |
| `pnpm test:rules`        | ホストのJavaでAuth・Firestore Emulatorを起動し、認証・権限テストを実行して終了 |
| `pnpm test:rules:docker` | 起動済みDockerのFirestoreに接続して権限テストを実行                            |

ブラウザテストの初回のみ実行する。

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

Docker起動済みの場合は次を実行する。ホストにJavaは不要。テストは専用プロジェクトID `demo-toilet-map-tests` にルールとデータを用意し、この名前空間だけを初期化する。開発用の店舗は保持する。

```sh
pnpm emulators
pnpm test:rules:docker
```

ホストでEmulatorを一時起動する従来の権限テストでは、Docker版を停止し、`java -version` でJava 21以上が選択されていることを確認してから実行する。ダウンロード用のキャッシュを指定する場合は `FIREBASE_EMULATORS_PATH` を利用できる。SDKの接続先はdemoプロジェクトであり、本番データを使わない。

```sh
pnpm test:rules
```

## ソースの役割

| 場所                                    | 役割                                                       |
| --------------------------------------- | ---------------------------------------------------------- |
| `src/main.tsx`・`src/app.tsx`           | React、Query、Routerの起動                                 |
| `src/router.tsx`                        | 地図画面、404、型付きルート。自動プリロードは無効          |
| `src/lib/query-client.ts`               | 自動再取得・再試行を抑えたQuery設定                        |
| `src/lib/firebase.ts`                   | 遅延初期化、環境変数検証、Emulator接続                     |
| `src/components/ui/`・`components.json` | shadcn/uiのコンポーネントと設定                            |
| `src/index.css`                         | Tailwind CSS、共通UIトークン                               |
| `tests/`                                | 検証のセットアップ、ブラウザテスト、権限テスト             |
| `firestore.rules`                       | 公開読み取りとGoogle管理者の作成・更新を許可し、入力も検証 |
| `src/features/auth/`                    | セッション準備・模擬Googleログイン・管理者判定・ログアウト |
| `src/features/stores/`                  | 共有スキーマ・取得・Query・一覧・詳細・店舗ピン            |
| `scripts/seed.ts`・`scripts/lib/`       | ローカル限定のテスト店舗・紐付け・管理者設定の投入と旧店舗整理 |
| `scripts/data/stores.json`             | 万願寺周辺のテスト店舗7件の保存データ                       |

## 実装済みと接続待ち

Query・Router・Tailwindと基本UI、地図・現在地・コンビニ選択、Firestoreのスキーマ・店舗表示、Google模擬ログインと登録編集フォームを実装済み。geofire-commonで現在地から半径3kmの周辺検索を実装済み。クラウド接続は今後実装する。業務画面の実装状況は[ロードマップ](implementation.md)を参照する。

出典：[Viteの環境要件](https://vite.dev/guide/)、[Firebase Emulatorの導入](https://firebase.google.com/docs/emulator-suite/install_and_configure)。

他プロジェクトとの同時起動時に8080・9099・4000が使用されていたため、Firestoreは18081、Authは19090、UIは14001を採用した。ポートを変更する場合は `compose.yaml`・`docker/firebase.json`・`firebase.json`・`src/lib/firebase.ts` と、`package.json` の `test:rules:docker` の接続先を合わせて更新する。

データ保存方式は[Firebase CLIのimport・export設定](https://firebase.google.com/docs/emulator-suite/install_and_configure)を参照する。

## pnpmの設定

`packageManager` は `pnpm@12.16.1` に固定し、lockfileは `pnpm-lock.yaml` に統一する。既存環境のpnpmが古い場合は先に12.16.1へ更新する。Node.js 24系の選択も必要。

初回は `pnpm install --frozen-lockfile`、起動は `pnpm dev`。スクリプト内部とPlaywrightの起動コマンドにもpnpmを使用する。依存更新は `pnpm add`、shadcn/uiの部品追加は `pnpm exec shadcn add <component>` を使う。

npmのlockfileを `pnpm import` で引き継ぎ、直接依存のバージョンとgRPCの固定を維持して移行した。pnpmの依存ビルドは、これまで導入済みだった `@firebase/util`・`fsevents`・`protobufjs`・`re2` を明示的に許可している。

出典：[pnpmの導入](https://pnpm.io/installation)、[lockfileの移行](https://pnpm.io/cli/import)、[設定](https://pnpm.io/settings)。
