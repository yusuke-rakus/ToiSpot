# フロントエンドと状態管理

[概要](../../README.md) · [文書一覧](../README.md)

## TanStack Queryの担当と取得方針

QueryはFirebaseの代替ではなく、取得結果をReact画面で扱うために使う。Firestoreへの問い合わせと保存はFirebase SDKを使うデータアクセス層にまとめ、コンポーネントから直接呼ぶ経路とQuery経由の取得を混在させない。

- 検索条件と店舗IDをquery keyに含め、地図と一覧が同じ取得結果を参照する。
- 地図を動かしている間の座標と、検索ボタンで確定した検索条件を分ける。移動中の座標をそのままquery keyにして連続取得しない。
- 保存成功後に、該当する詳細と検索結果のキャッシュを更新・無効化し、表示に必要な情報を再取得する。
- 認証状態はFirebase Authenticationの通知をContextなどで受け取り、Queryの取得結果だけでログイン状態を判断しない。
- 初期版はメモリ内キャッシュを基本とし、管理用データを端末に永続化する機能は入れない。

標準設定では、古くなったデータがマウント・画面復帰・再接続時に自動取得され、失敗時の再試行も行われる。無料枠を意識し、店舗データの初期設定案は `staleTime: 5分`、`gcTime: 15分`、`refetchOnMount: false`、`refetchOnWindowFocus: false`、`refetchOnReconnect: false`、`retry: false`、定期取得なしとする。保存操作も自動再試行せず、失敗を明示する。値は鮮度要件と実測で調整する。

同じ条件での「再検索」は明示的に再取得できるようにする。キャッシュ済みであることは、店舗の設備情報が最新であることを保証しない。

出典：[TanStack Queryの標準動作](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)。

## TanStack Routerの担当と状態の分担

- 現在は公開地図と管理者操作を同じ`/`に置き、ログイン状態で登録編集の操作を追加する。将来の画面分割やURL検索条件はRouterで扱う。
- 地図中心・検索範囲・絞り込み条件など、URLに持たせる項目はQ-06で決める。URL入力値を検証し、不正な座標や区分をそのままDB検索へ渡さない。
- Routerのloaderからデータが必要な場合も、Queryのキャッシュを利用する。同じFirestoreデータをRouterとQueryで独立に取得・管理しない。
- 初期版はデータ取得を伴うリンクの自動プリロードを無効にし、閲覧前のFirestore読み取りを避ける。
- 管理画面のルートガードは画面制御に使い、書き込み権限は引き続きSecurity Rulesで保証する。
- Hostingでは静的アセットを配信しつつSPAへのフォールバックを設定し、管理画面などのURLを直接開いても表示できるようにする。

状態の分担は、保存済み店舗データをQuery、URLに反映する検索条件をRouter、入力中の値をフォームライブラリ、一時的な開閉状態をReactのローカル状態とする。

実装ではAuthの通知を`AdminProvider`で受け、ブラウザに保持したセッションと非公開設定の権限照合を管理する。フォームはReact Hook Form＋Zod、保存はQuery mutation＋Firestore transactionを使用する。保存成功後は一覧を再取得し、地図を維持したまま選択を更新する。管理者用のメール設定をQueryの公開店舗キャッシュへ混ぜない。

出典：[TanStack Routerの検索パラメータ](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)、[外部データキャッシュとの連携](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading)。

## shadcn/uiとTailwind CSSの方針

- Vite向けの公式手順を基本とし、Tailwind CSS 4系では `@tailwindcss/vite` による統合を推奨する。
- 必要なコンポーネントだけを追加し、取り込んだソースをプロジェクト内で管理する。開発基盤はRadixベースのshadcn/uiと暫定テーマで初期化する。製品としての色・フォント・角丸などのプリセットは画面設計時に確定する。
- 色・余白などはCSS変数と共通トークンにまとめ、ページごとに異なる見た目を作らない。
- 貸出可否を色だけで表現せず、文言・アイコンを併用する。フォームのラベル、エラーとの関連付け、キーボード操作、ダイアログのフォーカスも検証する。
- Tailwind CSS 4系はモダンブラウザ向け。対応端末・OS・ブラウザの最低条件をQ-13で決める。

出典：[shadcn/uiのVite導入](https://ui.shadcn.com/docs/installation/vite)、[Tailwind CSSのVite統合](https://tailwindcss.com/docs/installation/using-vite)、[ブラウザ互換性](https://tailwindcss.com/docs/compatibility)。

## テーマと画面の説明文

- ヘッダーのアイコンから「ライト・ダーク・システム」を選択する。初期値はシステムとし、OSの配色変更に追従する。手動選択後はその設定を優先し、システムを選び直すとOS連動に戻る。
- `ThemeProvider`と`useTheme()`で選択値・実際の配色・変更関数を共有する。shadcn/uiのVite向け方式を基本とし、追加ライブラリは使わない。
- 選択値だけをlocalStorageの`toilet-map-theme`に保存する。未保存・不正値はシステムとし、保存が拒否されてもタブ内で切り替えられる。別タブの変更・削除・全消去にも追従する。管理用データは保存しない。
- `index.html`の起動スクリプトでReactやCSSの読み込み前に配色を適用し、初回表示のちらつきを防ぐ。HTMLの`.dark`と`color-scheme`を同期し、ダイアログや通知にも同じ配色を適用する。
- 操作の繰り返し説明やAPIの技術説明は画面から省き、店舗情報・確認状態・必要な通知・入力ルール・出典を残す。最大20件という検索条件は維持し、常設の上限説明は表示しない。

出典：[shadcn/uiのVite向けダークモード](https://ui.shadcn.com/docs/dark-mode/vite)。
