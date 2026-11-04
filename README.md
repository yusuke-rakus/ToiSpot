# コンビニトイレマップ

コンビニのトイレの貸出可否、利用条件、男性用・女性用・共用の個室数、小便器数を、地図から確認できるスマホ対応Webアプリ。

一般利用者はログインせずに閲覧し、管理者1名がGoogleログインして情報を登録・編集する。現在はローカルEmulatorの模擬Google認証を使用する。周辺コンビニはGoogle Placesで検索し、トイレ情報は管理者が独自に確認して登録する。

## 最初に読む

1. [要件と初期版の機能](docs/requirements/README.md)で確定要件と提案を確認する。
2. [未決事項と決定履歴](docs/decisions/README.md)で、担当機能の着手前に決める事項を確認する。
3. [技術構成](docs/architecture/README.md)と[実装ロードマップ](docs/development/implementation.md)を読む。
4. [開発手順](docs/development/README.md)に沿って起動し、専門資料を参照しながら実装する。

詳細な仕様・調査・検証項目は[ドキュメント一覧](docs/README.md)から参照できる。既存の要件ID・未決事項ID・調査結果は分割後も保持している。

## 現在の状態

- 開発基盤を導入済み：React・Vite、shadcn/ui・Tailwind CSS、TanStack Query・Router、フォーム・検証・地図連携の依存関係、テスト・静的検査。
- APIキー設定時にGoogleマップを表示する。現在地への移動とコンビニのピン選択を実装済み。任意地点のピン設置は行わない。キー未設定時は設定案内を表示する。
- Google Placesで半径3kmのコンビニを近い最大20件まで取得。未登録店舗はグレーのピンと「データなし」、登録済み店舗は緑系のピンで表示する。「この周辺を検索」で地図移動後に検索し直せる。
- ローカルFirestoreの店舗を取得し、地図のピン・一覧・詳細へ表示する。Placesで選択した店舗だけを登録し、地図を再読み込みしない手動更新に対応。設備数の0と不明を区別する。
- Auth・Firestore EmulatorをDocker Composeで起動できる。管理UIと停止時のデータ保存にも対応。`stores`は誰でも読み取り可能で、指定したGoogle管理者だけが作成・更新できる。削除は禁止する。
- 同じ`/`から管理者ログイン、店舗登録・編集ができる。フォームはshadcn/uiのDialog、React Hook FormとZodで構成する。現在地から半径3kmの周辺検索を実装済み。Placesの店舗からの新規登録に限定し、Place IDを必須にする。クラウド接続は未実装。
- API有効化、APIキー発行、Firebaseプロジェクト・DB・管理者アカウント作成、認証方式の有効化、請求先登録、デプロイは未実施。Firebase関連の操作はローカル設定とEmulatorでの検証のみ。

## 採用技術

| 分野                 | 技術                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| フロントエンド       | React、TypeScript、Vite                                                              |
| UI・CSS              | shadcn/ui、Tailwind CSS、Lucide React                                                |
| データ取得・画面遷移 | TanStack Query、TanStack Router                                                      |
| フォーム・検証       | React Hook Form、Zod                                                                 |
| 地図・位置検索       | Google Maps JavaScript API、@vis.gl/react-google-maps、geofire-common                |
| データ・認証・配信   | Firebase SDK、Firestore、Authentication、Hosting                                     |
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

管理者は`.env`または`.env.local`に`ADMIN_GOOGLE_EMAIL=admin@example.test`などのメールを指定して`pnpm seed`を実行する。`/admin-login`の「Googleでログイン」から、模擬Google画面で同じメールのアカウントを選ぶ。パスワードは不要。ポップアップに対応したChromeなどで操作する。[管理者ログインと登録・編集](docs/development/admin.md)に詳細を記載した。

Emulatorが停止していても地図操作とPlaces検索は利用できるが、登録情報の有無は「確認できません」と表示する。`VITE_USE_FIREBASE_EMULATORS=false`では店舗取得・ログイン・保存を無効にし、クラウドへ自動アクセスしない。

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

## 費用の方針

無料枠内で月額0円を目指す。Google Mapsには請求先登録が必要で、超過時の課金の可能性は残る。無料枠・資料間の記載差・利用制限・通知案は[料金と上限](docs/operations/costs.md)にまとめている。
