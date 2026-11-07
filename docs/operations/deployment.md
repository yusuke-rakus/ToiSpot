# Firebaseへのデプロイ手順

[概要](../../README.md) · [文書一覧](../README.md)

Google Maps API有効化後から、Firebaseの準備、管理者登録、GitHub Actionsでの公開、公開後の確認までを扱う。2026-11-07時点の手順。Google Maps API有効化はユーザー申告で完了済み。APIキー発行・制限、Firebase側の設定・デプロイの実施状況は別途確認する。

本番Firebaseへの接続、設定検査付き本番ビルド、GitHub Actionsは実装済み。クラウド設定・Secrets・管理者の事前登録を準備してから公開する。本リポジトリの作業ではクラウド設定変更やデプロイを行っていない。

一般利用者はログイン不要。管理者は1名で、Firebase Authenticationに事前登録したメール・パスワードのアカウントだけログインできるようにする。ユーザー自身の新規登録を禁止し、店舗の編集は既存の`_settings/admin`とSecurity Rulesでも制限する。「Authenticator」は本書ではFirebase Authenticationを指し、Google Authenticatorのワンタイムパスワード設定ではない。

## 1. 設定前に確認すること

| 項目                 | 確認内容・初期案                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebaseプロジェクト | Mapsを有効化した既存のGoogle CloudプロジェクトにFirebaseを追加する案を基本に、プロジェクトIDと所有者を確認する。MemoirAIのプロジェクトは流用しない |
| DB                   | Firestore Standard edition・Native mode・デフォルトDBの`(default)`を使用する                                                                       |
| DBリージョン         | 日本中心なら東京`asia-northeast1`を候補に、既存DBの有無と所在地を作成前に確認する。作成後の所在地変更はできない                                    |
| 公開URL              | App Hostingバックエンドの公開URLを使用する。独自ドメインは追加設定として扱う                                                                       |
| 管理者               | 管理者のメールアドレスを1名分決める。アプリの管理者とFirebaseプロジェクトを操作するIAM管理者は別の役割                                             |
| 請求・通知           | Mapsの請求先、Firebaseの料金プラン、予算通知の受信先、API利用上限と超過時の対応者を確認する                                                        |
| 復旧                 | 店舗情報を失った場合の復旧方法・許容損失を決める。バックアップ・PITRを使う場合は費用も確認する                                                     |

本番のID・メール・キーは本文に実値を書かない。以降の`<PROJECT_ID>`などは実際の値へ置き換える。[未決事項Q-10〜Q-12](../decisions/README.md)、[料金と上限](costs.md)も確認する。

出典：[既存Google CloudプロジェクトへのFirebase追加](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project)、[Firestoreのロケーション](https://firebase.google.com/docs/firestore/locations)。

## 2. 実装済みの接続切替とビルド

| 条件                                                        | 接続・動作                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `VITE_USE_FIREBASE_EMULATORS`が未指定または`true`           | `demo-toilet-map`のローカルAuth・Firestore Emulatorを使う                     |
| `false`とFirebase設定4項目が揃う                            | 指定プロジェクトの本番のメール・パスワード認証・Firestore取得・保存を利用する |
| 設定不足、不正なフラグ、クラウドに`demo-`プロジェクトを指定 | SDKを初期化せず、設定エラーを画面に案内する                                   |
| Viteの`e2e`モード                                           | 設定値に関係なくFirebase接続を無効にする                                      |

`pnpm build`・`pnpm check`は従来のローカル検証用として維持する。公開には`pnpm build:production`を使う。Viteのproduction設定を読み、Emulator無効指定・Firebase設定4項目・Mapsキー・`DEMO_MAP_ID`以外のMap IDを検査してからビルドする。検査とブラウザの接続判定は共通化している。キーの有効性、API制限、請求先、Authの新規登録禁止はビルドだけでは確認できない。

クラウドでもタブ内セッション、passwordプロバイダー・管理者UIDの照合、対象外ユーザーのサインアウト、Rulesによる保存検証を維持する。Queryキーは接続モード・プロジェクトID・検索条件を含み、検索停止時のキャンセルにも同じキーを使う。

`pnpm seed`と`pnpm stores:cleanup`はローカル専用のまま。本番へ接続するよう変更しない。ローカルの7件は実地未確認のテストデータなので、本番へコピーしない。

## 3. Firebaseリソースを準備する

1. [Firebase Console](https://console.firebase.google.com/)で対象プロジェクトを選択する。既存のMaps用プロジェクトを利用する場合は、そのプロジェクトにFirebaseを追加する。
2. 「プロジェクトの設定」からWebアプリを登録し、`apiKey`・`authDomain`・`projectId`・`appId`を控える。これらはGitHub Secretsへ登録し、ActionsからSecret Managerへ同期する。Analytics・Storageは本アプリの必須設定ではない。
3. Firestore Databaseで`(default)`を作成する。DB所在地を確認し、本番モードで開始する。テストモードの全許可ルールは使わない。
4. プロジェクトOwnerがApp Hostingの初回バックエンドを作成する。Blazeプランを有効にし、対象GitHubリポジトリを接続、ルートディレクトリを`/`、live branchを`main`にする。バックエンドIDと公開URLを控える。同一プロジェクトの複数リージョンで同じバックエンドIDを使わない。
5. バックエンドの自動ロールアウトを無効にする。テスト成功後にActionsから対象コミットを指定してロールアウトするため、自動ロールアウトを有効にすると検証前の公開・二重実行になる。初回の公開も環境変数の準備後に行う。
6. Firestore API・Firebase Rules API・App Hostingおよび関連サービスの初期設定はプロジェクト管理者が行う。App Hosting用のビルド・実行サービスアカウントはデプロイ用アカウントと区別する。

本リポジトリの`apphosting.yaml`は、`pnpm build:production`でViteをビルドし、`node scripts/serve.mjs`で`dist`を配信する。Node.jsサーバーはCloud Runの`PORT`を使用し、`/admin-login`などの直接アクセスをSPAへ戻す。Next.js・Angular向けアダプターは利用せず、カスタムビルド・起動コマンドを指定する。Vite構成はApp Hostingの事前構成済みフレームワークではないため、初回Cloud Buildでの動作確認が必要。`minInstances: 0`・`maxInstances: 1`は費用を抑える初期設定であり、無料を保証しない。Cloud Run・Cloud Build・Artifact Registry等の費用も確認する。

出典：[App Hostingの開始](https://firebase.google.com/docs/app-hosting/get-started)、[ビルド・起動コマンドの設定](https://firebase.google.com/docs/app-hosting/configure)、[対応フレームワークとツール](https://firebase.google.com/docs/app-hosting/frameworks-tooling)。

`firebase.json`の`emulators`設定はローカル用であり、Emulatorをクラウドへ公開する設定ではない。CLIの実行時には常に`--project`で本番IDを明示する。`firebase.json`の`hosting`は旧Hosting用設定であり、今回のActionsでは使用しない。App Hostingは`apphosting.yaml`を使う。本書では`.firebaserc`による既定プロジェクトへの依存を設けない。

出典：[WebアプリへのFirebase追加](https://firebase.google.com/docs/web/setup)、[Firestoreの開始](https://firebase.google.com/docs/firestore/quickstart)、[Hostingの開始](https://firebase.google.com/docs/hosting/quickstart)。

## 4. メール・パスワード認証と事前登録

### Email/Passwordを有効にする

1. Firebase Consoleの対象プロジェクトで、Authenticationの「Sign-in method」から「メール / パスワード（Email/Password）」を有効にする。メールリンク方式は使わない。
2. 使用するApp Hostingドメインとパスワード再設定用メールのテンプレート・アクションURLを確認する。通常のローカル開発はEmulatorと別アカウントを使う。
3. Google認証から移行する場合、旧方式での作業を終了し、以降のアカウント登録・UID設定・アプリとRulesの公開を同じメンテナンス時間内に行う。

出典：[メール・パスワード認証](https://firebase.google.com/docs/auth/web/password-auth)。

### ユーザー自身の新規登録を禁止する

Authenticationの「Settings → User actions」で「Enable create (sign-up)」を無効にする。必要に応じてユーザー自身の削除も無効にし、登録・削除・交代はConsoleの管理操作で行う。

登録画面を設けないことだけではAPI経由の登録を防げない。新規登録を試みるAPIが`auth/admin-restricted-operation`などの登録禁止エラーとなり、AuthのUsersにユーザーが増えないことを確認する。設定項目を利用できない場合はAuthentication構成・Identity Platformの必要性と料金を確認し、登録禁止が成立してから公開する。本アプリに登録用APIやブロッキングCloud Functionsは追加しない。

出典：[ユーザーのセルフサービス制限](https://firebase.google.com/docs/auth/users#user_self-service)。

### Consoleで管理者ユーザーを追加する

1. Authenticationの「Users → Add user（ユーザーを追加）」で、管理者のメールアドレスと本番専用パスワードを設定する。プロジェクトで設定したパスワードポリシーを満たす値を使う。
2. 作成したユーザーのUIDを控える。メールアドレスやGoogleのプロバイダーIDをUIDとして使わない。
3. 同じメールのユーザーが既に存在する場合、削除・再作成でUIDを変えず、Consoleのパスワード再設定を使ってパスワード認証へ移行する。Usersのプロバイダー情報と実ログインで確認する。

パスワードをGit、App Hostingの環境変数とActions設定、`VITE_`環境変数へ登録しない。アプリのビルド・デプロイには管理者の認証情報は不要。ローカル用`ADMIN_EMAIL`・`ADMIN_PASSWORD`は本番で使用しない。新規登録禁止を一時解除してユーザーを作る運用も行わない。

出典：[Consoleでのユーザー追加](https://support.google.com/firebase/answer/6400802)、[ユーザー管理](https://firebase.google.com/docs/auth/web/manage-users)。

### Firestoreの管理者UIDを指定する

Firebase ConsoleのFirestoreデータ画面で次のドキュメントを作成する。IAM担当者にはFirestoreデータを編集する権限が必要。Consoleの管理操作はブラウザ用Security Rulesとは別のIAM権限で行う。

| 項目           | 値                        |
| -------------- | ------------------------- |
| コレクション   | `_settings`               |
| ドキュメントID | `admin`                   |
| フィールド     | `uid`（string）           |
| フィールド値   | 作成したAuthユーザーのUID |

旧設定の`email`を削除して`{ uid }`へ置き換える。新しいRulesとアプリは旧形式を受け付けない。UID一致と認証プロバイダー`password`を両方要求し、メール確認済み操作は要求しない。ローカルの環境変数や`pnpm seed`は本番設定を更新しない。

続いてアプリとRulesを公開し、事前登録ユーザーでログイン・店舗の登録編集を確認する。新Rulesだけが先に公開されている間は旧Googleログインから編集できない。Hosting公開が失敗した場合は、新アプリを再公開するか、Rules・管理者設定・アプリを対応する旧版へまとめて戻す。移行成功後、AuthenticationのGoogleプロバイダーを無効化する。

## 5. Mapsキーと公開設定を制限する

- Maps用とFirebase用のAPIキーは別にする。Maps用は開発用・本番用も分離する。
- 本番Mapsキーのアプリケーション制限を「ウェブサイト」にし、バックエンドの公開URLに対応する`https://<APP_HOSTING_HOST>/*`と実際に使用する別ドメインだけをHTTPリファラーに登録する。旧Hostingドメインも引き続き使う場合だけ、そのURLも追加する。
- API制限でMaps JavaScript APIとPlaces API（New）だけを許可する。有効化済みでも両方が対象プロジェクトで利用可能か確認する。
- 本番用JavaScript Map IDを作成し、`VITE_GOOGLE_MAPS_MAP_ID`へ設定する。試作用の`DEMO_MAP_ID`を本番設定として使わない。
- FirebaseのWeb APIキーにはFirebase向けの制限を使用する。Maps向けのAPI制限をそのまま適用してAuthenticationを壊さない。
- MapsのロードとPlacesのNearby Searchは別の利用量として監視し、クォータと予算通知を設定する。予算通知は自動的な課金停止を保証しない。

`VITE_`で始まる値はビルド後のJavaScriptに含まれ、利用者から見える。App Hostingの環境変数とActions設定はGit・YAMLへの直書きを避けるために使い、ブラウザからキーを隠す仕組みとは考えない。サービスアカウント秘密鍵、管理者メール・パスワード、トークンに`VITE_`を付けない。

出典：[Mapsキーの制限](https://developers.google.com/maps/api-security-best-practices)、[Map IDの作成](https://developers.google.com/maps/documentation/get-map-id)、[Firebase APIキーの扱い](https://firebase.google.com/docs/projects/api-keys)、[Viteの環境変数](https://vite.dev/guide/env-and-mode)。

## 6. 環境変数とGitHub Actionsの認証設定

### GitHub SecretsとSecret Managerで管理する値

既存のRepository secretsをそのまま使用する。Firebase・Mapsの6項目はGitに実値を書かず、ActionsがCloud Secret Managerへ同期する。`apphosting.yaml`の`secret`には同じ名前の参照だけを記載し、ビルド時に取得する。

| GitHub Secret / Secret Manager名 | 値                                       |
| -------------------------------- | ---------------------------------------- |
| `VITE_FIREBASE_API_KEY`          | Firebase Webアプリの`apiKey`             |
| `VITE_FIREBASE_AUTH_DOMAIN`      | Firebase Webアプリの`authDomain`         |
| `VITE_FIREBASE_PROJECT_ID`       | デプロイ先のFirebaseプロジェクトID       |
| `VITE_FIREBASE_APP_ID`           | Firebase Webアプリの`appId`              |
| `VITE_GOOGLE_MAPS_API_KEY`       | 制限済みの本番Mapsキー                   |
| `VITE_GOOGLE_MAPS_MAP_ID`        | `DEMO_MAP_ID`以外の本番JavaScript Map ID |

既存の`FIREBASE_PROJECT_ID`と`FIREBASE_SERVICE_ACCOUNT`も継続してRepository secretsから参照する。前者はCLIのデプロイ先、後者はデプロイ専用サービスアカウントJSON全文（Base64化しない）。この2項目はApp Hostingの環境変数へコピーしない。サービスアカウントの秘密鍵はビルド成果物にも含めない。

追加するRepository variableは`FIREBASE_APP_HOSTING_BACKEND_ID`（GitHub接続済みバックエンドID）。GitHubの「Settings → Secrets and variables → Actions」のVariablesへ登録する。`VITE_FIREBASE_PROJECT_ID`と`FIREBASE_PROJECT_ID`は同じ値にする。

Actionsは全6項目の存在・プロジェクトID一致・本番Map IDを検査してから同期する。Secret Manager APIは事前に有効にしておく。シークレットがなければ作成し、各デプロイで新しいバージョンを追加して、対象バックエンドへ読み取り権限を付与する。値は標準入力でCLIへ渡し、一時ファイルやコマンド引数には保存しない。同期処理の出力へ値を表示しない。Secret Managerの保存バージョン数・アクセス料金も運用時に確認する。

初回公開前に、App Hosting Consoleへ同じ6項目の標準環境変数や別Secret参照を設定済みなら削除し、YAMLの参照を使う。Consoleの設定が優先されるため、残っているとGitHub Secretの更新が反映されない。以後はGitHub Secretを更新し、Actionsを再実行して同期・再ビルドする。手動ロールアウトは同期せず、その時点のSecret Managerの最新値を使用する。

Firebase Web設定やMap ID自体は秘密の認証情報ではないが、プロジェクト固有の値をGitから分離し、既存Secretsへ管理を統一する。`VITE_*`はビルド後のJavaScriptに含まれるため、ブラウザから隠せるわけではない。API制限は引き続き必要。`ADMIN_EMAIL`・`ADMIN_PASSWORD`はローカル専用で本番へ渡さない。

出典：[App Hostingのシークレット参照とアクセス権](https://firebase.google.com/docs/app-hosting/configure)、[Secret Managerへのバージョン追加](https://cloud.google.com/sdk/gcloud/reference/secrets/versions/add)。

### Git管理する動作設定

`apphosting.yaml`では`VITE_USE_FIREBASE_EMULATORS=false`、`VITE_PLACES_AUTO_SEARCH=false`、`VITE_PLACES_EXPANDED_SEARCH=true`、`VITE_PLACES_MIN_ZOOM=13`、`VITE_PLACES_MAX_RESULTS=100`、`VITE_PLACES_MAX_REQUESTS=9`を通常の`value`として管理する。すべて`availability: [BUILD]`とし、実行サーバーへは渡さない。変更後は新しいコミットをActionsでロールアウトする。

### デプロイ専用サービスアカウント

対象プロジェクトに専用アカウントを作成し、次のロールを付与する。店舗データ編集やAuthユーザー管理の権限は不要。

| ロール                                                                              | 用途                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Firebase App Hosting Developer（`roles/firebaseapphosting.developer`）              | ビルド・ロールアウトの作成と状態参照                             |
| Developer Connect Viewer（`roles/developerconnect.viewer`）                         | GitHub接続情報の参照                                             |
| Developer Connect Read Token Accessor（`roles/developerconnect.readTokenAccessor`） | CLIが対象コミットを確認するための読み取りトークン取得            |
| Firebase Rules Admin（`roles/firebaserules.admin`）                                 | Firestore Rulesの検証・公開                                      |
| Cloud Datastore Index Admin（`roles/datastore.indexAdmin`）                         | Firestoreインデックスの管理                                      |
| API Keys Viewer（`roles/serviceusage.apiKeysViewer`）                               | Firebase CLIのAPIキー参照                                        |
| Service Usage Consumer（`roles/serviceusage.serviceUsageConsumer`）                 | 有効化済みAPIの利用                                              |
| Secret Manager Admin（`roles/secretmanager.admin`）                                 | 同期用Secretの作成・バージョン追加・バックエンドのアクセス権設定 |

JSON鍵を発行して`FIREBASE_SERVICE_ACCOUNT`へ登録する。鍵はGitへ追加しない。鍵発行を禁止する組織ではWorkload Identity FederationによるADC方式へ変更する。Secret Manager Adminは今回の同期処理に必要な追加ロール。対象プロジェクト内のシークレット管理権限があるため、専用アカウントに付与する。初回バックエンド作成・Secret Manager等のAPI有効化・サービスエージェントの準備はプロジェクト管理者が行う。

出典：[Secret ManagerのIAMロール](https://cloud.google.com/secret-manager/docs/access-control)、[App HostingのIAMロール](https://firebase.google.com/docs/projects/iam/roles-predefined-product)、[Developer ConnectのIAMロール](https://cloud.google.com/iam/docs/roles-permissions/developerconnect)、[CLIのCI認証](https://firebase.google.com/docs/cli#cli-ci-systems)。

## 7. ワークフローで公開する

[ワークフロー本体](../../.github/workflows/firebase-hosting.yml)は`main`へのpushで実行する。ファイル名は従来どおりだが、公開先はApp Hosting。

1. 静的検査・単体・配信サーバーテスト、Firestore Rulesテスト、E2Eを実行する。本番の環境変数やデプロイ認証情報はテストへ渡さない。
2. プロジェクトID・バックエンドIDを検査し、サービスアカウントJSONを一時ファイルへ保存する。
3. GitHub Secretsの6項目をSecret Managerへ同期し、対象バックエンドへアクセス権を付与する。続いてFirestore Rules・インデックスをデプロイする。
4. `firebase apphosting:rollouts:create <BACKEND_ID> --git-commit <GITHUB_SHA> --force --non-interactive`で、テストしたコミットのビルド・ロールアウトを実行する。CLIはビルドとロールアウトの終了を待ち、失敗した場合はActionsも失敗する。
5. 成否にかかわらず認証情報の一時ファイルを削除する。

App HostingのCloud Build内で`pnpm build:production`がSecret Managerの参照値とYAMLの動作設定を検査してからビルドする。GitHub Actionsで生成した`dist`をアップロードする方式ではない。バックエンドは事前に同じリポジトリへ接続し、自動ロールアウトを無効にしておく。検証済みコミットを公開するため、`--git-branch main`での最新コミット指定は使わない。

第3〜6節の準備後に通常の手順でmainへ反映し、ActionsとApp HostingのRollouts画面で結果を確認する。本書の整備作業ではpush・クラウド変更・デプロイは実行していない。ローカル検証は[検証手順](../development/testing.md)を参照する。

Firestore反映後にApp Hostingのビルドが失敗すると、Rulesだけが新しい状態で残る。両者の互換性を保つ。インデックスを追加した場合は構築完了も確認する。

出典：[ロールアウトの管理](https://firebase.google.com/docs/app-hosting/rollouts)。

## 8. 公開後の確認

本番のメール・パスワード認証・新規登録禁止・リファラー制限はEmulatorだけでは確認できない。以下は本番で確認し、日時・対象コミット・結果を記録する。本番のメール・パスワード認証・課金API呼び出しは今回の自動検証では実施していない。

- [ ] 未ログインで地図、Placesの周辺コンビニ、登録済みトイレ情報を閲覧できる。位置情報の許可・拒否の両方で利用できる。
- [ ] スマホとPCで地図・詳細・登録フォームを操作でき、Googleのロゴと帰属表示を隠していない。
- [ ] `/admin-login`へ直接アクセス・再読み込みしてもSPAが表示される。
- [ ] 事前登録済み管理者がメール・パスワードでログインでき、管理者UIDが一致し、新しいユーザーが増えない。
- [ ] 未登録メールとパスワード誤りは同じ案内で拒否される。API経由の新規登録も拒否され、AuthのUsersに追加されない。試行回数超過と通信失敗の案内も確認する。
- [ ] 管理者がPlacesの店舗から登録・編集でき、再読み込み後も反映される。実地未確認のテスト店舗は投入されていない。
- [ ] 同じタブではセッションを維持し、ログアウト後やタブを閉じた後は管理操作できない。
- [ ] RulesのテストまたはRules Playgroundで、未認証・非管理者の書き込み、店舗削除、`_settings/admin`へのクライアント書き込みが拒否される。登録済みでも許可UIDが違うアカウントやGoogle認証に編集権限を与えない。
- [ ] ブラウザの通信先に`127.0.0.1:19090`・`127.0.0.1:18081`・`demo-toilet-map`が出ない。サービスアカウント秘密鍵や管理者用設定が配信ファイルに含まれていない。
- [ ] Mapsキーの許可リファラー・利用API、Firestore読み取り数、Places呼び出し数、予算通知の受信先を確認した。
- [ ] 利用規約・プライバシーポリシーとGoogleの必要な規約参照を公開した。確認時点と情報が現状と異なる可能性を表示し、備考に個人情報・管理用の連絡事項がない。

出典：[Mapsの公開要件](https://developers.google.com/maps/documentation/javascript/policies)。

## 9. 管理者交代・障害対応・復旧

### 管理者を交代・停止する

交代時は新しいメール・パスワードユーザーをConsoleで事前登録し、`_settings/admin.uid`を新管理者のUIDへ変更する。新管理者のログインと編集を確認し、旧Authユーザーを無効化してリフレッシュトークンを失効する。新規登録禁止は維持する。管理者は同時に1名で、設定変更後に旧UIDで行う書き込みはRulesで拒否する。

緊急停止は`_settings/admin`を削除するか許可UIDを変更し、対象Authユーザーを無効化してトークンを失効する。Authの無効化・トークン失効だけでは既発行IDトークンが直ちに使えなくなるとは限らないため、書き込み停止にはRulesが参照する設定変更も行う。ローカルの環境変数やActions Secretを削除するだけでは権限を失効できない。

メールアカウントも利用できなくなった場合は、FirebaseプロジェクトのIAM管理者が同じ交代手順を行う。復旧担当者がConsoleへアクセスできることを公開前に確認しておく。出典：[Authセッションの管理](https://firebase.google.com/docs/auth/admin/manage-sessions)。

### パスワードを再設定する

AuthenticationのUsersで対象管理者のメニューからパスワード再設定メールを送信する。本人がメールのリンクから再設定し、同じUIDでログイン・編集できることを確認する。アプリ内に再設定画面は追加しない。メール・パスワードを紛失した場合の復旧担当者は、アプリの認証とは別のIAMアクセスを確保する。

出典：[Consoleからのパスワード再設定](https://support.google.com/firebase/answer/9133462)。

### デプロイや接続に失敗した場合

| 症状                                                | 確認すること                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `auth/unauthorized-domain`                          | Authenticationの設定、`authDomain`、パスワード再設定メールのアクションURL                     |
| 登録済み管理者でも`auth/admin-restricted-operation` | 対象プロジェクト・事前登録の有無・Email/Passwordの有効状態。新規登録禁止は維持する            |
| ログインできるが管理者になれない                    | `_settings/admin.uid`の一致、`password`、旧email設定の残存、Rulesのデプロイ先                 |
| 地図・検索が失敗する                                | MapsとPlacesのAPI有効化、キーのリファラー・API制限、請求先、クォータ                          |
| 本番でログインボタンや店舗取得が無効                | 第2節の接続条件と設定エラー、`VITE_USE_FIREBASE_EMULATORS`とビルド時設定                      |
| CLIが権限不足になる                                 | サービスアカウントとプロジェクトIDの一致、IAMロール、API有効化、CLIエラーに記載された不足権限 |

修正後はActionsの対象コミットと反映先を再確認する。古い実行の再実行は古いコードを公開するため、最新の修正を含む実行を選ぶ。

### ロールバックとデータ復旧

App Hostingの不具合は正常だったコミットを指定して新しいロールアウトを作成し、再度確認する。再ビルドでは現在の環境変数が使われるため、設定も正常時の値へ戻す。App Hostingの再公開ではFirestore Rules・インデックス・Authユーザー・店舗データは戻らない。Rulesを戻す場合は正常版をレビューし、明示したプロジェクトへ別途デプロイする。データ不整合を直すためにRulesを全許可へ変更しない。

本番データのバックアップ・PITRは無料枠に含まれないため、自動では有効化しない。利用する場合は復旧担当者・保管先・保持期間・費用を決め、復旧手順を事前検証する。利用しない場合は障害・誤編集後に復元できない可能性があることを運用判断として記録する。ローカルのシードは本番の復旧用バックアップではない。

出典：[App Hostingのロールアウト管理](https://firebase.google.com/docs/app-hosting/rollouts)、[Firestoreの無料対象外機能](https://firebase.google.com/docs/firestore/pricing)。
