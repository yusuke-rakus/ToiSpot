# 実現可能性・料金・利用上限

[概要](../../README.md) · [文書一覧](../README.md)

調査日：2026-11-02。料金の調査結果を維持し、公開前に最新条件を再確認する。

App Hostingへの公開にはBlazeプランが必要。旧Firebase Hostingの無料枠をそのまま適用せず、Cloud Run・Cloud Build・Artifact Registry等の費用も確認する。`apphosting.yaml`のインスタンス数制限は無料を保証しない。出典：[App Hostingの料金](https://firebase.google.com/docs/app-hosting/costs)。

## 結論

要望はFirebaseとGoogle Mapsで実現可能。小規模な利用なら月額0円を目指せるが、無料枠内に収まるかは、地図表示回数・取得店舗数・検索頻度・転送量に依存する。

通常のAPIキーを使うMaps JavaScript APIには、無料枠内の利用でも請求先の有効化が必要。同じGoogle Cloudプロジェクトに請求先を関連付けると、Firebaseは従量課金のBlazeプランになる。Blazeにも無料枠はあるが、超過時に必ず停止する料金体系ではない。

出典：[Maps JavaScript APIの課金条件](https://developers.google.com/maps/documentation/javascript/usage-and-billing)、[Firebaseの料金プラン](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)。

## 主な無料枠

2026-11-02の調査結果。Mapsは日本で利用する想定のグローバル料金を参照し、一時的な新規登録クレジットは継続運用の試算に含めない。

認証方式は2026-11-07にメール・パスワードへ統一した。通常の開発はAuth Emulator専用アカウント、本番はFirebase Authenticationの事前登録ユーザーを使う。表は当初の調査記録として保持し、公開前に最新の料金・上限と、新規登録禁止に必要なAuthentication構成を確認する。

| サービス                          | 無料枠・条件                                                                          | 超過時の注意                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Maps JavaScript APIのDynamic Maps | 月10,000回の地図ロード                                                                | 最初の料金帯は超過1,000回あたり7米ドル                       |
| Firestore Standard                | 保存1GiB、読み取り50,000件／日、書き込み20,000件／日、削除20,000件／日、転送10GiB／月 | Blazeでは超過分が課金対象。無料対象DBはプロジェクトあたり1つ |
| Firebase Authentication           | メール・パスワード認証の管理者1名という利用規模は無料範囲                             | SMS認証は本案に含めない                                      |
| Firebase Hosting                  | 料金表上、保存10GB、転送360MB／日                                                     | 超過時は従量課金。転送枠には公式資料間の記載差がある         |

出典：[Maps料金表](https://developers.google.com/maps/billing-and-pricing/pricing)、[Firestore料金](https://firebase.google.com/docs/firestore/pricing)、[Firebase料金表](https://firebase.google.com/pricing)。

Hostingの個別資料には転送10GB／月という記載があり、料金表の360MB／日と集計単位が一致していない。容量設計は保守的に行い、公開前にコンソールと最新資料で適用条件を確認する。

出典：[Firebase Hostingの使用量・料金](https://firebase.google.com/docs/hosting/usage-quotas-pricing)。

## 試算の読み方

- 地図ロードが1日100回なら、月約3,000回でMapsの無料枠内。
- 月20,000回なら、Mapsだけで概算70米ドル。税・通貨換算・他サービスの料金は含まない。
- ピンの追加や通常の地図移動は、それ自体で地図ロードを増やさない。地図インスタンスの再作成には注意する。
- 店舗100件の取得は、基本的に100ドキュメント分の読み取りになる。位置検索の重複・範囲外候補・インデックスなどによる追加分も考慮する。
- 検索回数、地図ロード数、Firestore読み取り件数、Hosting転送量は別々に把握する。
- 開発中と管理画面の利用も試算に含める。Mapsの利用量は同一請求先に関連付けた他プロジェクトと集計されるため、その利用状況も確認する。

出典：[Maps FAQ](https://developers.google.com/maps/faq)、[Mapsの料金集計](https://developers.google.com/maps/billing-and-pricing/overview)、[Firestoreの位置検索](https://firebase.google.com/docs/firestore/solutions/geoqueries)。

## 利用上限と通知

以下は初期設定候補であり、想定アクセスと実際の設定可否を確認して決定する。

| 対象                 | 仮案                                                  | 注意事項                                       |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Mapsロード           | 課金単位に対応した日次クォータが利用できれば300回／日 | 開発・管理画面・他プロジェクトの利用も考慮する |
| Mapsの代替制限       | 日次制限が提供されない場合は毎分10回                  | 毎分制限だけでは月の無料枠以内を保証できない   |
| Maps使用量通知       | 無料枠の70％・90％                                    | 対象指標と通知方法を設定時に確認する           |
| Firestore通知        | 読み取り35,000件／日                                  | 同じ課金単位を観測できる指標か確認する         |
| プロジェクト予算通知 | 月100円、50％・90％・100％                            | 支出の許容量ではなく異常検知用の通知案         |

予算通知は利用・課金を自動停止しない。クォータと課金の数値には差が生じる場合があり、請求情報にも遅延がある。Mapsの制限だけでFirestoreやHostingの超過課金を止めることはできない。

出典：[Google Maps Platformの費用管理](https://developers.google.com/maps/billing-and-pricing/manage-costs)。

## ローカル試作向けの補足（2026-11-03）

通常キーの課金条件とは別に、GoogleはMaps Demo Keyを提供している。対象の個人Googleアカウントで請求先登録なしに取得でき、地図・マーカーなどを試作できる。日次使用量に制限があり、上限到達時は翌日まで停止する。本番公開向けではない。前述の従量課金の試算は通常キーを使う場合のもの。

出典：[Maps Demo Key](https://developers.google.com/maps/documentation/javascript/demo-key)。ローカル画面の設定は[地図画面](../architecture/map.md)を参照する。

## 周辺コンビニ検索の追加（2026-11-03）

Nearby Searchは地図ロードと別のPlaces API Nearby Search Proの利用になる。今回取得するのはID・店名・住所・座標・提供元だけで、営業時間・評価・写真などは要求しない。公式グローバル料金表では月5,000検索が無料、最初の有料帯は1,000検索あたり32米ドル。無料枠は請求先に紐付く他プロジェクトと合わせて確認する。

初回は位置情報の結果を待って1回検索し、その後は「この周辺を検索」・現在地・手動再試行だけで呼び出す。地図移動、詳細開閉、Firestoreの更新や保存では検索しない。Placesの利用制限・通知を地図ロードとは別に設定する。Places API（New）の有効化とキー制限の設定はクラウド側で別途必要で、今回自動変更していない。

Firestoreでは表示したPlaces候補1件につき紐付け1件、紐付いていれば店舗1件を追加照会する。これは周辺店舗のgeohash検索の読み取りと別に見積もる。検索結果全体は端末の永続キャッシュやDBへ保存しない。管理者が選択して登録する店舗情報の保存・更新は別に扱う。

Maps Demo KeyはPlaceクラス・Places API（New）にも対応するが、試作用の日次上限があり、本番公開には使わない。

出典：[Google Maps料金表](https://developers.google.com/maps/billing-and-pricing/pricing)、[Maps Demo Key](https://developers.google.com/maps/documentation/javascript/demo-key)。公開前に適用料金と制限を再確認する。
