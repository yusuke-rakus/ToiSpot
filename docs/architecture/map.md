# ローカルの地図画面

[概要](../../README.md) · [文書一覧](../README.md) · [技術構成](README.md)

## 実装済みの操作

- Google Maps JavaScript APIを `@vis.gl/react-google-maps` で表示する。
- 現在地取得前・取得失敗時は東京駅付近、ズーム14。表示言語は日本語、地域は日本。
- 地図の移動・拡大縮小と、コンビニのピン選択ができる。地図の余白のクリック・タップではピンを設置しない。
- 初回描画後と「現在地」操作時にブラウザで位置情報を要求し、取得できれば現在地へ移動してマーカーと半径3kmの登録店舗を表示する。
- PCでは左側に地点情報、右側に地図を表示する。スマホでは地図の下に地点情報を表示する。

ローカルFirestoreの登録店舗を取得し、独自のピンと一覧に表示する。ピンまたは一覧から詳細を選ぶと地図を店舗位置へ移動し、選択ピンを緑色・拡大で強調する。「一覧へ戻る」で解除する。店舗の選択や解除でも地図自体は維持する。

Place IDのある登録店舗だけを一覧・詳細へ表示する。詳細は住所、利用条件、設備区分・内訳、備考、最終確認日を表示し、設備なしの0と不明を区別する。PCは左パネル、スマホは地図下のスクロール可能なパネルを使う。Googleから取得したコンビニは、登録確認後に未登録ならグレーで表示する。選択してもグレーを保ち、拡大して強調する。登録済みの貸出状況「不明」と「データなし」は区別する。登録店舗は検索中心から半径3kmの範囲を距離順に表示する。

同じ`/`右上から管理者がGoogle模擬ログインすると、店舗登録・編集の操作を追加する。新規登録はPlacesで取得した未登録コンビニの詳細から行い、Place ID・店名・住所・座標をフォームに引き継ぐ。フォームはDialogとして地図の上へ表示し、閉じる・保存で地図インスタンスを維持する。手順は[管理者機能](../development/admin.md)を参照する。

## 環境変数と起動

`.env` または `.env.local` に設定する。`.env.local` などの優先順位に注意し、変更後は開発サーバーを再起動する。キーの値を文書・ソースコード・ログに転記しない。

```dotenv
VITE_USE_FIREBASE_EMULATORS=true
VITE_GOOGLE_MAPS_API_KEY=取得したキー
VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
```

Map IDを省略した場合は開発用の `DEMO_MAP_ID` を使用する。APIキーとは別の設定。通常キーではMaps JavaScript APIとPlaces API（New）を同じプロジェクトで有効化し、キーのAPI制限に両方を含め、開くローカルURLをHTTPリファラー制限で許可する。キーが地図表示だけに対応していると、地図は表示できてもコンビニ検索は失敗する。起動コマンドは `pnpm dev`。

店舗表示には `pnpm emulators`・`pnpm seed` を実行する。Firebaseの実プロジェクトは不要。Emulator接続失敗時も地図を操作でき、更新ボタンで再取得できる。`VITE_USE_FIREBASE_EMULATORS=false`では店舗取得を無効にする。Mapsには実際に接続し、通常のAPIキーではローカル利用も利用量に含まれる。

試作には、対象となる個人Googleアカウントで請求先登録なしに取得できるMaps Demo Keyも利用できる。機能と日次使用量に制限があり、本番公開用のキーではない。

出典：[Mapsのキー設定](https://developers.google.com/maps/documentation/javascript/get-api-key)、[Maps Demo Key](https://developers.google.com/maps/documentation/javascript/demo-key)、[開発用Map ID](https://developers.google.com/maps/documentation/javascript/advanced-markers/start)。

## 状態管理とデータの扱い

- `src/features/map/map-page.tsx` が地図画面、`map-config.ts` が設定と初期位置を担当する。
- APIProviderを1つにし、カメラ状態はReactで保持する。店舗選択では`panTo`で地図を店舗へ寄せ、詳細と強調表示を更新する。
- `reuseMaps` を有効にし、同じMap IDの再マウント時に再利用を試みる。無制限の無料表示を保証するものではない。
- 現在地は画面内の状態だけに保持し、DB・端末ストレージには保存しない。現在地を取得して地図を移動すると、その地域の地図をGoogleから読み込む。
- Places API（New）のNearby Searchでコンビニを取得する。Geocoding API・Routes APIは使用しない。管理者が選択して登録した店舗に限り、Place ID・店名・住所・座標と入力したトイレ情報をFirestoreに保存する。
- 店舗の取得は `src/features/stores/` に集約し、TanStack Queryで結果を共有する。読み込み・0件・接続失敗・不正データ・検索候補・表示の上限超過を区別する。仕様と投入方法は[店舗データ](../development/sample-data.md)を参照する。

出典：[APIProvider](https://visgl.github.io/react-google-maps/docs/api-reference/components/api-provider)、[地図コンポーネント](https://visgl.github.io/react-google-maps/docs/api-reference/components/map)。

## 読み込みと失敗時

| 状態                                 | 挙動                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- |
| キー未設定                           | 設定案内を表示し、Mapsを読み込まない                                   |
| 読み込み中                           | タイル描画まで読み込み表示。現在地ボタンを無効にする                   |
| 20秒以上の待機                       | 通信・設定の確認と手動の再読み込みを案内。後から描画できれば地図へ戻る |
| SDK読み込み失敗                      | 通信・ブラウザ設定の確認と手動再読み込みを案内                         |
| 認証失敗                             | キー・API有効化・アクセス元制限の確認を案内                            |
| 位置情報拒否・取得失敗・タイムアウト | エラーを案内し、地図移動とコンビニ選択を継続可能にする                 |

位置情報のタイムアウトは10秒、直近1分の取得結果の再利用を許可し、高精度取得は要求しない。初回描画後の自動取得は1回だけ行う。地図の自動再読み込みは行わない。Mapsのエラー本文はキーを含む可能性があるためアプリからログへ出力しない。

## 検証方法

`pnpm check` と `pnpm test:e2e` で検証する。単体テストは地図SDK・位置情報を置き換えて、実キーや実際の現在地を使わずに操作を検証する。

Playwrightのテストサーバーは `e2e` モードでキーを空に上書きし、既存の開発サーバーを再利用しない。個人の `.env` にキーがあっても有料Maps APIを自動テストから呼び出さない。実キーでの表示とピン操作はローカル画面で別途確認する。

## 周辺コンビニと登録状況

初回の位置情報取得が完了してから、現在地（失敗時は東京駅）の半径3kmを`Place.searchNearby()`で検索する。対象は`convenience_store`、距離順、最大20件。地図移動・選択・詳細の開閉だけでは検索しない。「この周辺を検索」では地図中心をPlacesとFirestoreの共通の検索中心にする。20件上限の常設説明は表示しない。

登録済み店舗は別途最大100件を取得し、Placesの20件に含まれなくても表示する。Places候補ごとの`placeLinks/{placeId}`と紐付け先店舗は範囲・100件制限と独立して照会し、同じ登録店舗を1本のピン・1行の一覧へ統合する。取得中・失敗・Emulator無効では「データなし」と断定しない。紐付け済み情報は古い内容が残る場合があるため、取得失敗の案内と更新操作を表示する。

検索中の同じ中心への要求を重複させず、自動再試行しない。新しい検索や画面終了後に返った古い結果は無視する。Places失敗でも登録店舗を表示し、コンビニ検索だけ再試行できる。「更新」と保存後の再取得はFirestoreだけを更新し、Places検索を増やさない。

Google提供の情報はラベルと境界線・余白でアプリのトイレ情報と区別し、返された提供元表示も表示する。地図の帰属表示を遮らない。公開前には利用規約・プライバシーポリシーと最新のGoogle要件を整える。

出典：[Nearby Search](https://developers.google.com/maps/documentation/javascript/nearby-search)、[Placesのポリシー](https://developers.google.com/maps/documentation/places/web-service/policies)。

## テーマとの連動

解決済みのテーマを地図の`colorScheme`（`LIGHT` / `DARK`）へ渡す。配色変更でSDK内部の地図インスタンスが交換されるため、中心・ズーム・傾き・方角をReactで保持して引き継ぐ。`reuseMaps`で色別のインスタンス再利用を試みるが、新規生成に伴う課金を回避できる保証はない。

テーマ変更では店舗選択・編集内容を維持し、選択店舗への再移動・現在地の再取得・PlacesやFirestoreの再検索を行わない。読み込み中の現在地取得が完了した場合は、最新の地図に反映する。

出典：[地図コンポーネントの配色と再利用](https://visgl.github.io/react-google-maps/docs/api-reference/components/map)。
