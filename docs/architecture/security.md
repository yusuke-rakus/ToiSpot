# 認証・アクセス制御

[概要](../../README.md) · [文書一覧](../README.md)

## 現在のローカル認証と権限

一般利用者は認証不要。`stores/{storeId}`は公開読み取りとし、作成・更新は許可したGoogle管理者だけに認め、Place IDを必須にする。Place IDのない店舗と架空サンプルは拒否する。`placeLinks/{placeId}`は公開getのみ許可し、listは拒否する。紐付けの作成は管理者だけに許可し、店舗との対応を`getAfter`で相互検証する。紐付けの更新・削除、店舗の既存Place IDの変更・解除、サンプルとの紐付けは禁止する。店舗削除とサブコレクション、その他のコレクションは拒否する。店舗取得・認証・保存はEmulator接続時だけ有効で、クラウド接続時は無効にする。

Googleプロバイダー、`email_verified=true`、許可メールとの一致をRulesで照合する。許可メールは`ADMIN_GOOGLE_EMAIL`からシードが読み込み、非公開の`_settings/admin`へ保存する。このドキュメントのgetは一致する管理者だけ、listとクライアントの書き込みは全員拒否する。ブラウザでの判定に加え、保存リクエストごとにRulesで判定するため、管理者の設定変更後は旧アカウントの書き込みが拒否される。

サンプルと管理者設定の投入には開発依存のFirebase Admin SDKを使う。Admin SDKはRulesを迂回するため、初期化前に`demo-toilet-map`・ローカル18081番へ固定する。店舗は未登録分だけをcreateし、既存データは変更しない。管理者設定は指定時にだけ作成・更新する。クラウドのRules変更・デプロイは行っていない。

店舗のフィールド・型・列挙値・座標範囲・設備数と日時をRulesで検証する。作成・更新日時にはサーバー時刻を要求し、更新時の作成日時とサンプル識別の変更は禁止する。新規登録からサンプル識別を有効化できない。geohashの座標との対応はクライアントが生成し、Rulesは文字列形式を検証する。

Rules・取得・シードの検証は別の `demo-toilet-map-tests` に分離し、そのテスト用データだけを初期化する。

## 認証の挙動と今後の公開準備

2026-11-04に、本番でも管理者1名とし、Authenticationに事前登録したGoogleユーザーだけログイン可能にする方針を確定した。ユーザー自身の新規登録を禁止し、編集権限は引き続き`_settings/admin.email`・Googleプロバイダー・確認済みメールで照合する。Authユーザーの存在だけでは編集権限を与えない。設定と登録・交代の手順は[Firebaseへのデプロイ手順](../operations/deployment.md)を参照する。現時点では本番対応を実装・適用した状態ではない。

- `GoogleAuthProvider`と`signInWithPopup`を使用する。Auth Emulatorの画面は模擬認証であり、実際のGoogleアカウントの所有確認ではない。ローカル専用として利用する。
- 公開店舗情報は未ログインでも読み取り可能とする。
- 書き込みは許可メール・Googleプロバイダー・確認済みメールの全条件を満たした管理者だけに許可する。ログイン済みという条件だけでは許可しない。
- 別の認証アカウントがAPI経由で作られても、管理者の編集権限を得られないようにする。登録画面を設けないことだけを防御にしない。
- 件数、座標、区分などのデータ検証は、画面とSecurity Rulesの両方で行う。
- パスワードは使用しない。管理者メールにも`VITE_`を付けず、シード専用の設定とする。メール・トークン・生の認証エラーはログへ出力しない。
- セッションは`browserSessionPersistence`で同じタブの再読み込みに保持し、タブを閉じると終了する。権限確認中・失敗時は閲覧のみ。対象外アカウントはサインアウトする。
- ログアウト・アカウント切替前の非同期判定は破棄する。保存時の権限拒否では再判定し、フォーム入力は保持したまま保存を無効化する。
- 管理者変更は環境変数を変更して再シードする。未指定は既存設定を維持するため、変数を消すだけでは権限を取り消さない。
- 本番公開前に実FirebaseのGoogleプロバイダー設定、許可ドメイン、管理者識別・交代・紛失時の運用を確認する。

出典：[Google認証](https://firebase.google.com/docs/auth/web/google-signin)、[Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth)、[認証とRules](https://firebase.google.com/docs/rules/rules-and-auth)、[認証状態の永続化](https://firebase.google.com/docs/auth/web/auth-state-persistence)、[Security Rulesの基本](https://firebase.google.com/docs/rules/basics)。以前検討した方式の参考：[メール・パスワード認証](https://firebase.google.com/docs/auth/web/password-auth)。

ブラウザ用Maps APIキーは利用者から見えるため、秘密として隠す設計に依存しない。公開ドメインのHTTPリファラー制限と利用APIの制限を設定し、開発用と本番用を分ける。Firebaseの設定値とMapsキーは区別して管理する。

出典：[Google Maps Platformのキー制限](https://developers.google.com/maps/api-security-best-practices)。
