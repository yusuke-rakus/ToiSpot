# 技術構成と採用状況

[概要](../../README.md) · [文書一覧](../README.md)

shadcn/uiとTailwind CSSはユーザー指定として確定。TanStackは適合するものの採用判断を委任されているため、QueryとRouterを採用する。2026-11-03の依頼により、前回の推奨技術も採用・依存関係導入済みとする。業務機能への組み込みが未完了のものは、導入済みと実装済みを区別する。

| 用途                   | 技術                                        | 状況 | 理由・確認事項                                            |
| ---------------------- | ------------------------------------------- | ---- | --------------------------------------------------------- |
| 画面                   | React＋TypeScript＋Vite                     | 採用 | 静的配信できるWebアプリとして構成する                     |
| UI                     | shadcn/ui                                   | 確定 | ボタン、入力、選択、ダイアログ、詳細パネルなどを統一する  |
| CSS                    | Tailwind CSS                                | 確定 | レスポンシブなレイアウトとスタイルを実装する。4系を採用   |
| データ取得・キャッシュ | TanStack Query（`@tanstack/react-query`）   | 採用 | Firestore取得結果、読込・失敗状態、保存後の更新を管理する |
| 画面遷移・URL          | TanStack Router（`@tanstack/react-router`） | 採用 | 公開地図と管理画面を分け、URLの検索条件を型付きで管理する |
| 配信                   | Firebase Hosting                            | 採用 | 初期版は標準ドメインを使い、独自ドメイン費用を避ける      |
| 地図                   | Google Maps JavaScript API                  | 確定 | 独自データのピン表示と地図操作に使用する                  |
| DB                     | Cloud Firestore Standard                    | 採用 | 店舗とトイレ情報を保存する                                |
| DB配置                 | 東京リージョン                              | 候補 | 日本向けを想定。DB作成前に確定する                        |
| 認証                   | Firebase Authentication                     | 採用 | 管理者1名のGoogle認証。ローカルはAuth Emulatorの模擬認証  |
| 権限                   | Firestore Security Rules                    | 採用 | 管理者のUIDによる書き込み制限と入力検証                   |

初期版はブラウザからFirebaseのモジュラーSDKで接続し、専用バックエンド、Cloud Functions、App Hostingを使わない案とする。独自のHTTP APIは現時点で設けない。

現在はローカルEmulator限定の店舗表示、Google模擬ログイン、管理者による店舗登録・編集を実装している。`firebase-admin`は開発用サンプルと非公開の管理者設定の投入に使用し、配信するブラウザのコードには含めない。現在地から半径3kmの周辺検索を実装済み。クラウド接続は未実装。

## 追加技術（採用・依存関係導入済み）

| 用途              | 採用技術                                                | このアプリでの役割                                                           |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| フォーム          | React Hook Form＋`@hookform/resolvers`                  | 設備数などの入力、エラー、変更状態、送信状態を管理する                       |
| 入力・データ検証  | Zod（4系）                                              | フォーム、URL入力、Firestoreから読み出すデータを実行時に検証し、型を導出する |
| Reactと地図の接続 | `@vis.gl/react-google-maps`                             | Google Mapsの読込、地図、ピン、イベントをReactから扱う                       |
| 周辺検索の計算    | `geofire-common`                                        | Firebase公式の位置検索例に沿ってgeohashの範囲と距離を計算する                |
| アイコン          | `lucide-react`                                          | 地図操作、編集、設備などのアイコンを統一する                                 |
| 単体・画面テスト  | Vitest＋React Testing Library                           | 検証、検索処理、フォームの挙動を必要な範囲で確認する                         |
| 権限テスト        | Firebase Emulator Suite＋`@firebase/rules-unit-testing` | 未ログイン・管理者・非管理者のアクセスと入力制約を確認する                   |
| ブラウザテスト    | Playwright                                              | ログインから保存までの主要操作と、画面サイズ別の動作を確認する               |
| 静的検査・整形    | ESLint＋Prettier                                        | React・TypeScriptの検査と書式を統一する                                      |

フォームはshadcn/uiの公式例にもあるReact Hook Form＋Zodを採用する。TanStack Formも選択肢だが、Query・Routerの採用だけを理由にフォームまで統一せず、フォームライブラリは1つに絞る。

Zodの入力検証はSecurity Rulesを置き換えない。FirestoreのTimestampなどSDK固有の値と画面用の値を変換する境界を設ける。空欄の設備数を数値へ変換した結果、意図せず0として保存しないようにする。項目の意味と必須条件は[データモデル](data-model.md)と[Q-04](../decisions/README.md)で確定する。

地図ラッパーはGoogleのReact向け教材でも使われている。地図コンポーネントを維持する構成を優先し、必要なら `reuseMaps` を検討するが、再利用機能だけで課金回避を保証しない。Map ID・色設定などの変更による再生成と、再利用機能の制約を実装時に確認する。

出典：[shadcn/uiのフォーム例](https://ui.shadcn.com/docs/forms/react-hook-form)、[Zod](https://zod.dev/)、[GoogleのReact向け地図教材](https://developers.google.com/codelabs/maps-platform/maps-platform-101-react-js)、[地図コンポーネントと再利用](https://visgl.github.io/react-google-maps/docs/api-reference/components/map)、[Firebaseの位置検索](https://firebase.google.com/docs/firestore/solutions/geoqueries)、[Lucide React](https://lucide.dev/guide/react)。

検証ツールの出典：[Vitest](https://vitest.dev/guide/)、[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)、[Firebaseの権限テスト](https://firebase.google.com/docs/rules/unit-tests)、[Playwright](https://playwright.dev/docs/intro)、[ESLint](https://eslint.org/docs/latest/)、[Prettier](https://prettier.io/docs/)。

## 追加しない技術と依存管理

- TanStack Table・Virtual：複雑な表操作や大量件数の描画が必要になった時点で検討する。
- TanStack Start・Next.js：初期版ではSSRや専用サーバーを必要とする要件がないため追加しない。
- Redux・Zustand：まずQuery・Router・フォーム・Reactの状態で分担し、アプリ全体の状態管理ライブラリは追加しない。
- 日付ライブラリ：当面は標準の `Intl` などを使い、複雑な日時処理が必要になれば検討する。
- PWA・オフライン同期：キャッシュの鮮度や保存失敗時の仕様が増えるため、初期版には含めない。

2026-11-03に安定版同士の互換性を確認して依存関係を導入し、Node.js、パッケージマネージャー、主要ライブラリのバージョンを[依存関係一覧](../development/dependencies.md)とlockfileに記録した。TanStackの開発ツールを使う場合は開発環境に限定する。依存関係の導入はローカルのみで、クラウドの作成・課金設定・デプロイは行っていない。

基本的なデータフローは「閲覧画面 → Query → データアクセス層 → Firestore → 地図と一覧」「管理画面 → フォーム検証 → Authenticationの認証状態 → Security Rulesで検証して保存 → Queryキャッシュ更新」とする。

管理者用画面は別URLへ分けず、同じ`/`に管理者の登録・編集操作を追加する。管理者メールはNode.jsのシードだけで読み込み、非公開の`_settings/admin`へ保存してRulesから照合する。

## 詳細設計

- [フロントエンドと状態管理](frontend.md)
- [地図画面とローカル設定](map.md)
- [データモデル](data-model.md)
- [認証とアクセス制御](security.md)
- [周辺検索](search.md)
