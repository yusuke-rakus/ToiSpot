# コンビニトイレマップ

コンビニのトイレの貸出可否、男性用・女性用・共用の個室数、小便器数、備考を、地図から確認できるスマホ対応Webアプリ。

一般利用者はログインせずに閲覧し、店舗情報の新規登録・修正を申請できる。申請は管理者が承認した後に公開情報へ反映される。管理者1名がメール・パスワードでログインし、申請の承認・却下や直接の登録・編集を行う。本番・ローカルとも同じメール・パスワード認証を使う。ローカルはEmulator専用アカウント、本番はConsoleで事前登録したアカウントを使用する。周辺コンビニはGoogle Placesで検索する。

## 最初に読む

1. [要件と初期版の機能](docs/requirements/README.md)で確定要件と提案を確認する。
2. [未決事項と決定履歴](docs/decisions/README.md)で、担当機能の着手前に決める事項を確認する。
3. [技術構成](docs/architecture/README.md)と[実装ロードマップ](docs/development/implementation.md)を読む。
4. [開発手順](docs/development/README.md)に沿って起動し、専門資料を参照しながら実装する。

詳細な仕様・調査・検証項目は[ドキュメント一覧](docs/README.md)から参照できる。既存の要件ID・未決事項ID・調査結果は分割後も保持している。

本番公開は[Firebaseへのデプロイ手順](docs/operations/deployment.md)を参照する。Maps API有効化後のFirebase設定、メール・パスワードの事前登録ユーザー限定ログイン、App Hostingの環境変数、GitHub Actionsの設定と公開時の確認をまとめている。

## 現在の状態

- 開発基盤を導入済み：React・Vite、shadcn/ui・Tailwind CSS、TanStack Query・Router、フォーム・検証・地図連携の依存関係、テスト・静的検査。
- APIキー設定時にGoogleマップを表示する。現在地への移動とコンビニのピン選択を実装済み。任意地点のピン設置は行わない。キー未設定時は設定案内を表示する。
- Google Placesで半径3kmのコンビニを近い最大20件まで取得。ピンはセブン-イレブン、ローソン、ファミリーマート、その他の4種類。未登録店舗のトイレ情報は「データなし」と表示する。「この周辺を検索」で地図移動後に検索し直せる。
- ローカルFirestoreの店舗を取得し、地図のピン・一覧・詳細へ表示する。Placesで選択した店舗だけを登録し、地図を再読み込みしない手動更新に対応。設備数の0と不明を区別する。
- Auth・Firestore EmulatorをDocker Composeで起動できる。管理UIと停止時のデータ保存にも対応。`stores`は誰でも読み取り可能で、許可UIDの管理者だけが作成・更新できる。削除は禁止する。
- 同じ`/`から管理者ログイン、店舗登録・編集ができる。フォームはshadcn/uiのDialog、React Hook FormとZodで構成する。現在地から半径3kmの周辺検索を実装済み。Placesの店舗からの新規登録に限定し、Place IDを必須にする。設定済みの本番Firebaseへの接続にも対応する。
- 一般利用者は未登録店舗の新規登録・登録済み店舗の修正を申請できる。管理者はヘッダーの件数付きベルから`/admin/store-requests`を開き、申請中の内容を承認・却下する。件数は画面表示・手動更新・審査後に取得し、リアルタイム購読は行わない。
- Google Maps API有効化は2026-11-04にユーザー申告で完了済み。APIキー発行・制限、Firebaseプロジェクト・DB・管理者アカウント、認証方式、請求先の設定状況は要確認。本リポジトリの作業ではクラウド設定・デプロイを行っていない。本番接続、設定検査付きの`pnpm build:production`、GitHub Actionsを実装済み。本番のメール・パスワード認証と公開ドメインでの確認は未実施。

## 採用技術

| 分野                 | 技術                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| フロントエンド       | React、TypeScript、Vite                                                              |
| UI・CSS              | shadcn/ui、Tailwind CSS、Lucide React                                                |
| データ取得・画面遷移 | TanStack Query、TanStack Router                                                      |
| フォーム・検証       | React Hook Form、Zod                                                                 |
| 地図・位置検索       | Google Maps JavaScript API、@vis.gl/react-google-maps、geofire-common                |
| データ・認証・配信   | Firebase SDK、Firestore、Authentication、App Hosting                                 |
| テスト・品質         | Vitest、React Testing Library、Playwright、Firebase Emulator Suite、ESLint、Prettier |

役割・制約・導入状況は[技術構成](docs/architecture/README.md)、実際のバージョンは[依存関係](docs/development/dependencies.md)と `pnpm-lock.yaml` を参照する。

## ローカル起動

Node.js 24系（24.12.0以上）とpnpm 12系（12.16.1）を使用する。`.nvmrc`・`.node-version` に対応した環境管理ツールでNode.jsを選択する。既存のNode.js設定を自動変更する仕組みは設けていない。

```sh
pnpm install --frozen-lockfile
pnpm emulators
pnpm seed
pnpm dev
```

起動先はターミナルに表示されるローカルURL。`.env` または `.env.local` に `VITE_GOOGLE_MAPS_API_KEY`（通常キーではMaps JavaScript APIとPlaces API（New）を有効化）と `VITE_USE_FIREBASE_EMULATORS=true` を設定する。Map IDは省略すると開発用IDになる。`pnpm seed`はローカル18081番・`demo-toilet-map`限定で、万願寺周辺のテスト店舗7件とPlace IDの紐付けの不足分を投入し、指定時に管理者設定を更新する。既存店舗は上書きしない。旧データは`pnpm stores:cleanup`で確認し、`pnpm stores:cleanup --apply`で整理できる。[店舗データの手順](docs/development/sample-data.md)、[地図の設定と操作](docs/architecture/map.md)を参照する。

管理者は`.env`または`.env.local`に`ADMIN_EMAIL`と`ADMIN_PASSWORD`を設定して`pnpm seed`を実行する。`/admin-login`で同じメール・パスワードを入力するとログインできる。旧`ADMIN_GOOGLE_EMAIL`は新しい2項目へ置き換える。再シードでは同じUIDのパスワードを更新する。本番用の認証情報は流用しない。[管理者ログインと登録・編集](docs/development/admin.md)に詳細を記載した。

Emulatorが停止していても地図操作とPlaces検索は利用できるが、登録情報の有無は「確認できません」と表示する。`VITE_USE_FIREBASE_EMULATORS=false`とFirebase設定4項目が揃うと、本番Firestoreの取得・メール・パスワード認証・保存を有効にする。設定不足では接続を停止して案内する。通常の開発はEmulatorを使い、E2Eモードでは設定に関係なくFirebase接続を無効にする。

```sh
pnpm check
pnpm format:check
```

Firebaseを使う開発ではDockerを起動して、次を実行する。Auth・Firestoreのみを起動し、ホスト側のJavaは不要。

```sh
pnpm emulators
# 管理UI: http://127.0.0.1:14001
pnpm test:rules:docker
pnpm emulators:stop
```

データ保存・停止操作・ブラウザテストは[開発手順](docs/development/README.md)を参照する。

## 本番ビルドと公開

`pnpm build`・`pnpm check`は従来どおりローカル検証に使う。本番公開用は`pnpm build:production`で、Emulator無効指定・Firebase設定4項目・Mapsキー・本番Map IDを検査してからビルドする。環境変数の設定後、再ビルドが必要。

`.github/workflows/firebase-hosting.yml`は`main`へのpushで、静的検査・単体・Rules・E2Eテスト、Firestore Rules・インデックスの公開、App Hostingでの本番ビルド・ロールアウトの順に実行する。[デプロイ手順](docs/operations/deployment.md)に沿ってBlazeプラン、GitHub接続済みバックエンド、GitHub SecretsからSecret Managerへの同期権限とActionsの認証設定を準備する。自動ロールアウトを無効にし、Actionsのテスト成功後に対象コミットを公開する。本リポジトリの作業ではpushやデプロイは実行していない。

## 費用の方針

無料枠内で月額0円を目指す。Google Mapsには請求先登録が必要で、超過時の課金の可能性は残る。無料枠・資料間の記載差・利用制限・通知案は[料金と上限](docs/operations/costs.md)にまとめている。
