# 導入済みの依存関係

[概要](../../README.md) · [文書一覧](../README.md) · [開発手順](README.md)

2026-11-03に開発基盤を導入。次の一覧はpackage.jsonとインストール済みの直接依存から生成している。
依存関係の導入と、店舗検索・ログインなどの業務機能の完成は区別する。

- Node.js：`>=24.12.0 <25`
- パッケージマネージャー：`pnpm@12.16.1`
- `.nvmrc`・`.node-version`でNode.js 24系を指定。
- 全直接依存を固定バージョンにし、pnpm-lock.yamlを保存。再現には `pnpm install --frozen-lockfile` を使う。
- 更新後は `pnpm docs:dependencies` を実行し、この一覧も更新する。

## 実行時依存

| パッケージ                   | バージョン |
| ---------------------------- | ---------- |
| `@fontsource-variable/geist` | 5.3.0      |
| `@hookform/resolvers`        | 7.0.1      |
| `@tanstack/react-query`      | 5.105.3    |
| `@tanstack/react-router`     | 1.170.46   |
| `@vis.gl/react-google-maps`  | 1.10.2     |
| `class-variance-authority`   | 0.7.1      |
| `clsx`                       | 2.1.1      |
| `cn`                         | 0.5.2      |
| `firebase`                   | 13.2.0     |
| `geofire-common`             | 6.0.0      |
| `lucide-react`               | 1.66.0     |
| `radix-ui`                   | 1.8.1      |
| `react`                      | 19.3.1     |
| `react-dom`                  | 19.3.1     |
| `react-hook-form`            | 7.91.0     |
| `tailwind-merge`             | 3.7.0      |
| `tailwindcss`                | 4.3.4      |
| `tw-animate-css`             | 1.4.0      |
| `zod`                        | 4.6.7      |

## 開発・検証依存

| パッケージ                     | バージョン |
| ------------------------------ | ---------- |
| `@eslint/js`                   | 10.0.1     |
| `@firebase/rules-unit-testing` | 6.0.0      |
| `@playwright/test`             | 1.64.1     |
| `@tailwindcss/vite`            | 4.3.4      |
| `@testing-library/jest-dom`    | 7.0.1      |
| `@testing-library/react`       | 16.3.3     |
| `@testing-library/user-event`  | 14.6.8     |
| `@types/google.maps`           | 3.66.9     |
| `@types/node`                  | 24.19.2    |
| `@types/react`                 | 19.3.0     |
| `@types/react-dom`             | 19.3.0     |
| `@vitejs/plugin-react`         | 6.2.1      |
| `eslint`                       | 10.14.0    |
| `eslint-config-prettier`       | 10.1.8     |
| `eslint-plugin-react-hooks`    | 7.1.1      |
| `firebase-admin`               | 14.5.0     |
| `firebase-tools`               | 15.34.2    |
| `globals`                      | 17.14.0    |
| `jsdom`                        | 30.1.3     |
| `prettier`                     | 3.9.10     |
| `shadcn`                       | 4.23.0     |
| `typescript`                   | 6.0.3      |
| `typescript-eslint`            | 8.72.1     |
| `vite`                         | 8.3.5      |
| `vitest`                       | 5.1.0      |

## 組み込み状況

- 起動基盤に接続済み：React、Vite、Tailwind、shadcn/uiの基本部品、TanStack Query・Router。
- Firebase：Emulatorから店舗を取得し、Google模擬認証と管理者の登録編集を実装。firebase-adminは開発用シードにだけ使用し、ブラウザには含めない。
- React Hook Form・Zod：Firebase設定と共有の店舗・フォームスキーマで使用。shadcn/uiのDialog内で登録編集フォームを実装。
- 地図ラッパー：地図・現在地・コンビニ選択、登録店舗とPlaces検索のピン・一覧・詳細を実装。geofire-commonはgeohash生成・半径3kmの周辺検索・距離順の表示に使用。
- テスト・静的検査：基盤・店舗表示・シード・認証と権限・登録編集・取得上限・不正データ・Rulesを検証。

## 推移依存の固定と監査記録

- `@grpc/grpc-js` は `pnpm-workspace.yaml` の `overrides` で1.14.7に固定。Firebaseの推移依存に対する監査指摘を受け、修正版を使用する。
- pnpmの公開後待機期間の例外は、npmから移行済みの固定バージョンに限定して `minimumReleaseAgeExclude` へ記録。一般の待機期間は無効化していない。
- 直接依存を旧メジャーへ戻す `npm audit fix --force` は実行していない。
- 2026-11-03の `npm audit --omit=dev` は指摘0件。開発依存を含む監査は高・重大0件、中30件、低2件が残る。
- 指摘件数は当日の記録であり、以降の状態を保証しない。依存更新時と公開前に再確認する。
- 検証方法と実行結果は[検証資料](testing.md)を参照する。
