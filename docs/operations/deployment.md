# Firebaseへのデプロイ手順

[概要](../../README.md) · [文書一覧](../README.md)

Google Maps API有効化後から、Firebaseの準備、管理者登録、GitHub Actionsでの公開、公開後の確認までを扱う。2026-11-04時点の手順。Google Maps API有効化はユーザー申告で完了済み。APIキー発行・制限、Firebase側の設定・デプロイの実施状況は別途確認する。

**現状のコードはEmulator専用で、本番公開の準備は完了していない。** `VITE_USE_FIREBASE_EMULATORS=false`だけでは認証・店舗取得・保存が無効になる。まず[公開前に必要なコード変更](#2-公開前に必要なコード変更)を完了する。本書のYAML・管理操作コードは設定例であり、ワークフローファイルの追加やクラウド操作はまだ行っていない。

一般利用者はログイン不要。管理者は1名で、Firebase Authenticationに事前登録したGoogleアカウントだけログインできるようにする。ユーザー自身の新規登録を禁止し、店舗の編集は既存の`_settings/admin`とSecurity Rulesでも制限する。「Authenticator」は本書ではFirebase Authenticationを指し、Google Authenticatorのワンタイムパスワード設定ではない。

## 1. 設定前に確認すること

| 項目                 | 確認内容・初期案                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebaseプロジェクト | Mapsを有効化した既存のGoogle CloudプロジェクトにFirebaseを追加する案を基本に、プロジェクトIDと所有者を確認する。MemoirAIのプロジェクトは流用しない |
| DB                   | Firestore Standard edition・Native mode・デフォルトDBの`(default)`を使用する                                                                       |
| DBリージョン         | 日本中心なら東京`asia-northeast1`を候補に、既存DBの有無と所在地を作成前に確認する。作成後の所在地変更はできない                                    |
| 公開URL              | 初回はFirebase Hostingの`https://<PROJECT_ID>.web.app`を使用する。独自ドメインは追加設定として扱う                                                 |
| 管理者               | 所有確認できるGoogleアカウントを1名決める。GoogleアカウントとFirebaseプロジェクトを操作するIAM管理者は別の役割                                     |
| 請求・通知           | Mapsの請求先、Firebaseの料金プラン、予算通知の受信先、API利用上限と超過時の対応者を確認する                                                        |
| 復旧                 | 店舗情報を失った場合の復旧方法・許容損失を決める。バックアップ・PITRを使う場合は費用も確認する                                                     |

本番のID・メール・キーは本文に実値を書かない。以降の`<PROJECT_ID>`などは実際の値へ置き換える。[未決事項Q-10〜Q-12](../decisions/README.md)、[料金と上限](costs.md)も確認する。

出典：[既存Google CloudプロジェクトへのFirebase追加](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project)、[Firestoreのロケーション](https://firebase.google.com/docs/firestore/locations)。

## 2. 公開前に必要なコード変更

以下は未実装の作業一覧。本書の設定だけで完了したとは扱わない。

| 対象           | 必要な変更                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase初期化 | `src/lib/firebase.ts`の本番設定4項目を使用する。Emulator接続はローカル時だけに限定し、本番ビルドではEmulator指定や必須設定不足を検出する                                    |
| 認証           | `src/features/auth/`のEmulator限定ガード・ボタン無効化を環境に応じて切り替える。実Google認証でも許可メール、確認済みメール、`google.com`の照合を維持する                    |
| 店舗取得・保存 | 店舗リポジトリ・writer・`useStores`・Placesの`place-links`にあるEmulator限定ガードを本番対応する。未認証ユーザーの公開読み取りも有効にする                                  |
| キャッシュ     | Queryキーに固定された`emulator`・`demo-toilet-map`を接続環境とプロジェクトに応じた値へ変更する                                                                              |
| メッセージ     | ローカル模擬認証・シード・Emulator接続を案内する文面を環境別にする。`auth/admin-restricted-operation`は「登録済みの管理者アカウントでログインしてください」などの案内にする |
| 検証・文書     | 本番モードを拒否する既存テストを更新し、Emulatorとの分離と設定不足時の失敗を検証する。実装後にREADME・開発手順・認証設計の実装状態も更新する                                |

本番でも`browserSessionPersistence`、認証・権限確認中の編集禁止、ログアウト時の非同期結果破棄、Rulesによるサーバー側の検証を維持する。`pnpm seed`と`pnpm stores:cleanup`はローカル専用のままにし、本番へ接続するよう変更しない。ローカルの7件は実地未確認のテストデータなので、本番へコピーしない。

## 3. Firebaseリソースを準備する

1. [Firebase Console](https://console.firebase.google.com/)で対象プロジェクトを選択する。既存のMaps用プロジェクトを利用する場合は、そのプロジェクトにFirebaseを追加する。
2. 「プロジェクトの設定」からWebアプリを登録し、`apiKey`・`authDomain`・`projectId`・`appId`を控える。これらは後でActions Secretsへ登録する。Analytics・Storageは本アプリの必須設定ではない。
3. Firestore Databaseで`(default)`を作成する。DB所在地を確認し、本番モードで開始する。テストモードの全許可ルールは使わない。
4. Hostingの利用を開始し、デフォルトサイトと公開URLを確認する。リポジトリには`firebase.json`があり、配信先`dist`、`/index.html`へのSPAフォールバック、FirestoreのRules・インデックス参照を設定済み。`firebase init`で既存設定を上書きしない。
5. 対象プロジェクトでFirestore API・Firebase Rules API・Firebase Hosting APIの利用状態を確認する。初期のAPI有効化はプロジェクト管理者が行う。

`firebase.json`の`emulators`設定はローカル用であり、Emulatorをクラウドへ公開する設定ではない。CLIの実行時には常に`--project`で本番IDを明示する。本書では`.firebaserc`による既定プロジェクトへの依存を設けない。

出典：[WebアプリへのFirebase追加](https://firebase.google.com/docs/web/setup)、[Firestoreの開始](https://firebase.google.com/docs/firestore/quickstart)、[Hostingの開始](https://firebase.google.com/docs/hosting/quickstart)。

## 4. Google認証と事前登録ユーザー限定ログイン

### Googleプロバイダーとドメイン

1. Authenticationの「Sign-in method」でGoogleを有効化し、公開用のプロジェクト名とサポートメールを設定する。メール・パスワードや匿名認証は本手順では有効化しない。
2. Authenticationの「Settings → Authorized domains」で`<PROJECT_ID>.web.app`と、使用する`<PROJECT_ID>.firebaseapp.com`を確認する。独自ドメインを使用する場合は追加する。URLのスキームやパスは入力しない。
3. 本番プロジェクトでローカル確認する必要がある場合だけ、使用するローカルホストを承認済みドメインに追加する。通常のローカル開発はEmulatorを使う。
4. Google CloudのGoogle Auth Platformで同意画面・対象ユーザー・OAuthクライアントを確認する。外部向けのテスト状態なら管理者をテストユーザーに追加し、公開に必要な設定を確認する。独自の`authDomain`を使う場合はOAuthリダイレクトURIの設定も必要になる。

出典：[WebでのGoogle認証](https://firebase.google.com/docs/auth/web/google-signin)。

### ユーザー自身の新規登録を禁止する

Authenticationの「Settings → User actions」で「Enable create (sign-up)」を無効にする。Googleログインの初回自動登録も許容しない。必要に応じてユーザー自身のアカウント削除も無効にし、削除・交代は管理者が行う。

新規登録禁止時、未登録ユーザーの操作は`auth/admin-restricted-operation`で失敗する。ログイン後に`isNewUser`を見て削除する方法や、フロントエンドでログアウトするだけの方法で代用しない。設定項目を利用できない場合は対象プロジェクトのAuthentication構成・Identity Platformの必要性と料金を確認し、この制限が成立するまで公開しない。本手順のためにブロッキングCloud Functionsを新設する必要はない。

出典：[ユーザーのセルフサービス制限](https://firebase.google.com/docs/auth/users#user_self-service)。

### Googleアカウントを事前登録する

Googleプロバイダー付きのAuthユーザーをAdmin SDKで登録する。Consoleの「ユーザーを追加」でメール・パスワードのユーザーを作る操作とは区別する。**新規登録禁止を解除して初回ログインさせる運用は行わない。**

1. 対象者のGoogleプロバイダーIDを確認する。Google Identity Servicesで本人がログインして得たGoogle IDトークンを、署名・`aud`・`iss`・有効期限まで検証したうえで、その`sub`を使う。メールと確認済み状態も照合する。取得・検証は[GoogleのIDトークン検証手順](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)に従う。既存の管理下のFirebaseプロジェクトに同じ本人のGoogleログインがある場合は、Admin SDKでそのユーザーを取得し、`providerData`内の`providerId === 'google.com'`の`uid`を確認する方法もある。
2. Googleの`sub`はメールアドレスでもFirebase UIDでもない。JWTを単にデコードした値、申告だけのID、Emulatorの模擬アカウントのIDは使わない。
3. ローカルの信頼できる管理端末で依存関係をインストールし、管理用の認証情報を設定する。対象プロジェクトのFirebase Authentication Admin（`roles/firebaseauth.admin`）権限を持つ操作担当者が実行する。Actionsのデプロイ用サービスアカウントとは分ける。

以下はリポジトリ直下で実行する一度限りの登録例。`GOOGLE_APPLICATION_CREDENTIALS`には管理操作用サービスアカウントJSONの絶対パスを指定する。JSONはリポジトリ外で管理し、実行後は不要な鍵を失効する。IDトークンやJSON本文をシェル履歴・ログへ出さない。

```sh
pnpm install --frozen-lockfile
export GOOGLE_APPLICATION_CREDENTIALS='/absolute/path/outside-repo/admin-credentials.json'
export FIREBASE_PROJECT_ID='<PROJECT_ID>'
export ADMIN_GOOGLE_EMAIL='<ADMIN_GOOGLE_EMAIL>'
export GOOGLE_PROVIDER_UID='<VERIFIED_GOOGLE_SUB>'

node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth Emulator設定を外してください')
const projectId = process.env.FIREBASE_PROJECT_ID
const email = process.env.ADMIN_GOOGLE_EMAIL?.trim().toLowerCase()
const googleUid = process.env.GOOGLE_PROVIDER_UID?.trim()
assert(projectId && !projectId.startsWith('demo-') && !projectId.includes('<'))
assert(email && email.includes('@') && !email.includes('<'))
assert(googleUid && !googleUid.includes('<'))
initializeApp({ credential: applicationDefault(), projectId })
const auth = getAuth()
async function lookup(find) {
  try {
    return await find()
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null
    throw error
  }
}
const byEmail = await lookup(() => auth.getUserByEmail(email))
const byGoogle = await lookup(() => auth.getUserByProviderUid('google.com', googleUid))
if (byEmail || byGoogle) {
  assert(byEmail && byGoogle && byEmail.uid === byGoogle.uid,
    '既存ユーザーとの競合があります。上書きせず、管理者が紐付けを確認してください')
  assert(!byEmail.disabled && byEmail.emailVerified, '既存ユーザーの状態を確認してください')
  console.log('一致する登録済みユーザーを確認しました。変更はありません。')
} else {
  const result = await auth.importUsers([{
    uid: randomUUID(),
    email,
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: 'google.com', uid: googleUid, email }],
  }])
  assert.equal(result.failureCount, 0,
    '登録に失敗しました。Consoleで登録状態・競合を確認してください')
  console.log('Googleプロバイダー付きの管理者ユーザーを登録しました。')
}
NODE

unset GOOGLE_APPLICATION_CREDENTIALS FIREBASE_PROJECT_ID ADMIN_GOOGLE_EMAIL GOOGLE_PROVIDER_UID
```

`importUsers`は既存ユーザーを上書きし得るため、例では既存メールとGoogle IDを先に照合し、不一致なら停止する。実行中に別担当者がユーザーを登録しないことも確認する。メールだけが一致する既存ユーザーは自動的に変更しない。登録後、ConsoleのUsersで対象者のGoogleプロバイダー・メール・有効状態を確認する。

出典：[Admin SDKでのユーザーインポート](https://firebase.google.com/docs/auth/admin/import-users)、[Admin SDKでのユーザー管理](https://firebase.google.com/docs/auth/admin/manage-users)。

### Firestoreの管理者を指定する

Firebase ConsoleのFirestoreデータ画面で、次のドキュメントを作成する。管理操作を行うIAM担当者にはFirestoreデータを編集する権限が必要。Consoleの管理操作はブラウザ用Security Rulesとは別のIAM権限で行う。

| 項目           | 値                                               |
| -------------- | ------------------------------------------------ |
| コレクション   | `_settings`                                      |
| ドキュメントID | `admin`                                          |
| フィールド     | `email`（string）                                |
| フィールド値   | 事前登録した管理者のGoogleメールを小文字にした値 |

Authユーザーの存在はログインの条件、`_settings/admin.email`との一致は編集権限の条件。既存Rulesはさらに`email_verified=true`と`google.com`を要求する。管理者メールはWebアプリの環境変数に追加しない。ローカル用`ADMIN_GOOGLE_EMAIL`や`pnpm seed`はこの本番ドキュメントを更新しない。

## 5. Mapsキーと公開設定を制限する

- Maps用とFirebase用のAPIキーは別にする。Maps用は開発用・本番用も分離する。
- 本番Mapsキーのアプリケーション制限を「ウェブサイト」にし、`https://<PROJECT_ID>.web.app/*`と実際に使用する別ドメインだけをHTTPリファラーに登録する。`firebaseapp.com`でも配信するならそのURLも追加する。
- API制限でMaps JavaScript APIとPlaces API（New）だけを許可する。有効化済みでも両方が対象プロジェクトで利用可能か確認する。
- 本番用JavaScript Map IDを作成し、`VITE_GOOGLE_MAPS_MAP_ID`へ設定する。試作用の`DEMO_MAP_ID`を本番設定として使わない。
- FirebaseのWeb APIキーにはFirebase向けの制限を使用する。Maps向けのAPI制限をそのまま適用してAuthenticationを壊さない。
- MapsのロードとPlacesのNearby Searchは別の利用量として監視し、クォータと予算通知を設定する。予算通知は自動的な課金停止を保証しない。

`VITE_`で始まる値はビルド後のJavaScriptに含まれ、利用者から見える。Actions SecretsはGit・YAMLへの直書きを避けるために使い、ブラウザからキーを隠す仕組みとは考えない。サービスアカウント秘密鍵、管理者メール、トークンに`VITE_`を付けない。

出典：[Mapsキーの制限](https://developers.google.com/maps/api-security-best-practices)、[Map IDの作成](https://developers.google.com/maps/documentation/get-map-id)、[Firebase APIキーの扱い](https://firebase.google.com/docs/projects/api-keys)、[Viteの環境変数](https://vite.dev/guide/env-and-mode)。

## 6. GitHub ActionsのSecretsを登録する

対象は[ToiSpotリポジトリ](https://github.com/yusuke-rakus/ToiSpot)。GitHubの「Settings → Secrets and variables → Actions → New repository secret」で以下を登録する。本書の例はRepository secretsを参照するため、Environment secretsだけに登録しても読み込まれない。

| Secret名                    | 値・使用箇所                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| `FIREBASE_PROJECT_ID`       | CLIのデプロイ先となるプロジェクトID                                      |
| `FIREBASE_SERVICE_ACCOUNT`  | 対象プロジェクトのデプロイ専用サービスアカウントJSON全文。Base64化しない |
| `VITE_FIREBASE_API_KEY`     | Firebase Webアプリの`apiKey`                                             |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Webアプリの`authDomain`。通常は`<PROJECT_ID>.firebaseapp.com`   |
| `VITE_FIREBASE_PROJECT_ID`  | Firebase Webアプリの`projectId`。`FIREBASE_PROJECT_ID`と一致させる       |
| `VITE_FIREBASE_APP_ID`      | Firebase Webアプリの`appId`                                              |
| `VITE_GOOGLE_MAPS_API_KEY`  | リファラー・API制限済みの本番Mapsキー                                    |
| `VITE_GOOGLE_MAPS_MAP_ID`   | 本番用JavaScript Map ID                                                  |

`VITE_USE_FIREBASE_EMULATORS`は機密ではないためYAMLで文字列`'false'`を固定する。Secretsを変更しても配信済みファイルは変わらず、再ビルド・再デプロイが必要。

### デプロイ専用サービスアカウント

Google Cloudの「IAMと管理 → サービスアカウント」で対象プロジェクトに専用アカウントを作成し、次のロールを付与する。ユーザー登録用のAuth管理権限や店舗データ編集権限は付けない。

| ロール                                                              | 用途                                |
| ------------------------------------------------------------------- | ----------------------------------- |
| Firebase Hosting Admin（`roles/firebasehosting.admin`）             | Hostingの公開                       |
| Firebase Rules Admin（`roles/firebaserules.admin`）                 | Firestore Rulesの検証・公開         |
| Cloud Datastore Index Admin（`roles/datastore.indexAdmin`）         | Firestoreインデックスの管理         |
| API Keys Viewer（`roles/serviceusage.apiKeysViewer`）               | Firebase CLIが必要とするAPIキー参照 |
| Service Usage Consumer（`roles/serviceusage.serviceUsageConsumer`） | 有効化済みAPIの利用                 |

JSON鍵を発行し、全文を`FIREBASE_SERVICE_ACCOUNT`に登録する。鍵ファイルはGitへ追加しない。組織ポリシーで鍵の発行が禁止されている場合は、ポリシーを解除せずWorkload Identity FederationによるADC方式へ変更する必要がある。

API有効化やサービスエージェントの初期設定で権限不足になった場合は、プロジェクト管理者が初期設定を行う。デプロイアカウントへ一律にOwner・Editorを付けない。キーのローテーションは、新しいJSONをSecretへ登録→デプロイ成功を確認→古い鍵を失効、の順に行う。

出典：[GitHub ActionsのSecrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)、[HostingのIAMロール](https://firebase.google.com/docs/projects/iam/roles-predefined-product)、[RulesのIAMロール](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaserules)、[インデックスの権限](https://firebase.google.com/docs/firestore/query-data/indexing#roles_and_permissions)、[CLIのCI認証](https://firebase.google.com/docs/cli#cli-ci-systems)。

## 7. ワークフローを追加して公開する

以下を将来`.github/workflows/firebase-hosting.yml`へ追加する。**第2節の本番対応と、第3〜6節の設定を終えてから有効化する。**

[MemoirAIのfirebase-hosting.yml](https://github.com/yusuke-rakus/MemoirAI/blob/main/.github/workflows/firebase-hosting.yml)（確認時のblob SHA: `c04c4b02f09a8e4a60bccc6e05c8cb3ff3b93b6f`）の、`main`へのpush・Secretsをビルド環境へ渡す・サービスアカウントによるCLIデプロイ、という構成を参考にしている。本アプリに合わせてpnpmを12.16.1へ変更し、`latest`のCLI取得を固定済みの`pnpm exec firebase`へ置き換える。JSONはSecretをシェルコードへ直接埋め込まず、環境変数経由で書き出す。

```yaml
name: Deploy to Firebase

on:
  push:
    branches: [main]

concurrency:
  group: firebase-production
  cancel-in-progress: false

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    env:
      CI: 'true'
      FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true'
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with:
          version: 12.16.1
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '21'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Check documentation, types, lint and unit tests
        run: |
          pnpm docs:check
          pnpm typecheck
          pnpm lint
          pnpm test

      - name: Test Firestore Rules with emulators
        run: pnpm test:rules

      - name: Validate configuration and build
        env:
          FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          VITE_USE_FIREBASE_EMULATORS: 'false'
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_GOOGLE_MAPS_API_KEY: ${{ secrets.VITE_GOOGLE_MAPS_API_KEY }}
          VITE_GOOGLE_MAPS_MAP_ID: ${{ secrets.VITE_GOOGLE_MAPS_MAP_ID }}
        run: |
          node --input-type=module <<'NODE'
          import assert from 'node:assert/strict'
          const names = [
            'FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY',
            'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID',
            'VITE_FIREBASE_APP_ID', 'VITE_GOOGLE_MAPS_API_KEY',
            'VITE_GOOGLE_MAPS_MAP_ID',
          ]
          for (const name of names) {
            assert(process.env[name]?.trim(), `${name} is required`)
          }
          assert.equal(process.env.FIREBASE_PROJECT_ID, process.env.VITE_FIREBASE_PROJECT_ID)
          assert(!process.env.FIREBASE_PROJECT_ID.startsWith('demo-'))
          assert.equal(process.env.VITE_USE_FIREBASE_EMULATORS, 'false')
          assert.notEqual(process.env.VITE_GOOGLE_MAPS_MAP_ID, 'DEMO_MAP_ID')
          NODE
          pnpm build

      - name: Write deployment credentials
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
        run: |
          node --input-type=module <<'NODE'
          import assert from 'node:assert/strict'
          import { writeFileSync } from 'node:fs'
          import { join } from 'node:path'
          assert(process.env.FIREBASE_SERVICE_ACCOUNT?.trim(), 'FIREBASE_SERVICE_ACCOUNT is required')
          let account
          try {
            account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
          } catch {
            throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid JSON')
          }
          assert.equal(account.type, 'service_account')
          assert.equal(account.project_id, process.env.FIREBASE_PROJECT_ID)
          assert(account.client_email && account.private_key, 'Invalid service account')
          writeFileSync(join(process.env.RUNNER_TEMP, 'firebase-service-account.json'),
            JSON.stringify(account), { mode: 0o600 })
          NODE

      - name: Deploy Firestore Rules and indexes
        env:
          FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ runner.temp }}/firebase-service-account.json
        run: pnpm exec firebase deploy --only firestore:rules,firestore:indexes --project "$FIREBASE_PROJECT_ID" --non-interactive

      - name: Deploy Hosting
        env:
          FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ runner.temp }}/firebase-service-account.json
        run: pnpm exec firebase deploy --only hosting --project "$FIREBASE_PROJECT_ID" --non-interactive

      - name: Remove deployment credentials
        if: ${{ always() }}
        run: rm -f -- "$RUNNER_TEMP/firebase-service-account.json"
```

テスト工程へ本番Secretやデプロイ認証情報を渡さず、Rulesテストは既存の`demo-toilet-map-tests`へ接続する。Java 21はEmulatorの実行用。デプロイ前にE2Eも[開発時の検証手順](../development/testing.md)に沿って実行する。

初回は必要なコード変更・設定とYAMLをレビューし、通常の手順で`main`に反映する。Actionsで各工程の成功を確認し、Hosting URLを開く。本書の整備作業ではpush・デプロイを実行していない。既存`firebase.json`を使うため、`firebase init hosting:github`による別ワークフローの自動生成は不要。

現在の`firestore.indexes.json`には複合インデックスの定義がない。将来追加した場合、CLI完了後も構築中の可能性があるため、必要なインデックスが利用可能になってから新しい検索を公開する。Firestoreの反映後にHostingが失敗すると、Rulesだけが新しい状態で残るため、両者の互換性を保つ。

## 8. 公開後の確認

実Google認証・新規登録禁止・リファラー制限はEmulatorだけでは確認できない。以下は本番で確認し、日時・対象コミット・結果を記録する。実ブラウザ確認・課金API呼び出しは本書の文書検証では実施していない。

- [ ] 未ログインで地図、Placesの周辺コンビニ、登録済みトイレ情報を閲覧できる。位置情報の許可・拒否の両方で利用できる。
- [ ] スマホとPCで地図・詳細・登録フォームを操作でき、Googleのロゴと帰属表示を隠していない。
- [ ] `/admin-login`へ直接アクセス・再読み込みしてもSPAが表示される。
- [ ] 事前登録済み管理者がGoogleログインでき、既存AuthユーザーのUIDが変わらず、新しいユーザーが増えない。
- [ ] 未登録の別Googleアカウントはログインを拒否され、AuthのUsersにも追加されない。キャンセルやポップアップブロックも案内される。
- [ ] 管理者がPlacesの店舗から登録・編集でき、再読み込み後も反映される。実地未確認のテスト店舗は投入されていない。
- [ ] 同じタブではセッションを維持し、ログアウト後やタブを閉じた後は管理操作できない。
- [ ] RulesのテストまたはRules Playgroundで、未認証・非管理者の書き込み、店舗削除、`_settings/admin`へのクライアント書き込みが拒否される。登録済みでも許可メールが違うアカウントに編集権限を与えない。
- [ ] ブラウザの通信先に`127.0.0.1:19090`・`127.0.0.1:18081`・`demo-toilet-map`が出ない。サービスアカウント秘密鍵や管理者用設定が配信ファイルに含まれていない。
- [ ] Mapsキーの許可リファラー・利用API、Firestore読み取り数、Places呼び出し数、予算通知の受信先を確認した。
- [ ] 利用規約・プライバシーポリシーとGoogleの必要な規約参照を公開した。確認時点と情報が現状と異なる可能性を表示し、備考に個人情報・管理用の連絡事項がない。

出典：[Mapsの公開要件](https://developers.google.com/maps/documentation/javascript/policies)。

## 9. 管理者交代・障害対応・復旧

### 管理者を交代・停止する

交代時は新しいGoogleユーザーを事前登録し、`_settings/admin.email`を新管理者のメールへ変更する。新管理者のログインと編集を確認し、旧Authユーザーを無効化してリフレッシュトークンを失効する。新規登録禁止は維持する。管理者は同時に1名で、設定変更後に旧メールで行う書き込みはRulesで拒否する。

緊急停止は`_settings/admin`を削除するか許可メールを変更し、対象Authユーザーを無効化してトークンを失効する。Authの無効化・トークン失効だけでは既発行IDトークンが直ちに使えなくなるとは限らないため、書き込み停止にはRulesが参照する設定変更も行う。ローカルの環境変数やActions Secretを削除するだけでは権限を失効できない。

Googleアカウントを紛失した場合は、FirebaseプロジェクトのIAM管理者が同じ交代手順を行う。復旧担当者がConsoleへアクセスできることを公開前に確認しておく。出典：[Authセッションの管理](https://firebase.google.com/docs/auth/admin/manage-sessions)。

### デプロイや接続に失敗した場合

| 症状                                                | 確認すること                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `auth/unauthorized-domain`                          | Authenticationの承認済みドメイン、`authDomain`、独自ドメイン利用時のOAuth設定                                |
| 登録済み管理者でも`auth/admin-restricted-operation` | 対象プロジェクトが正しいか、GoogleプロバイダーIDの紐付けが正しいか。新規登録禁止を解除せず登録状態を確認する |
| ログインできるが管理者になれない                    | `_settings/admin.email`の小文字一致、`google.com`、確認済みメール、Rulesのデプロイ先                         |
| 地図・検索が失敗する                                | MapsとPlacesのAPI有効化、キーのリファラー・API制限、請求先、クォータ                                         |
| 本番でログインボタンや店舗取得が無効                | 第2節の本番対応漏れ、`VITE_USE_FIREBASE_EMULATORS`とビルド時設定                                             |
| CLIが権限不足になる                                 | サービスアカウントとプロジェクトIDの一致、IAMロール、API有効化、CLIエラーに記載された不足権限                |

修正後はActionsの対象コミットと反映先を再確認する。古い実行の再実行は古いコードを公開するため、最新の修正を含む実行を選ぶ。

### ロールバックとデータ復旧

Hostingの不具合はFirebase ConsoleのHostingリリース履歴から正常なリリースへロールバックし、再度確認する。HostingのロールバックではFirestore Rules・インデックス・Authユーザー・店舗データは戻らない。Rulesを戻す場合は正常版をレビューし、明示したプロジェクトへ別途デプロイする。データ不整合を直すためにRulesを全許可へ変更しない。

本番データのバックアップ・PITRは無料枠に含まれないため、自動では有効化しない。利用する場合は復旧担当者・保管先・保持期間・費用を決め、復旧手順を事前検証する。利用しない場合は障害・誤編集後に復元できない可能性があることを運用判断として記録する。ローカルのシードは本番の復旧用バックアップではない。

出典：[Hostingのリリース管理](https://firebase.google.com/docs/hosting/manage-hosting-resources)、[Firestoreの無料対象外機能](https://firebase.google.com/docs/firestore/pricing)。
