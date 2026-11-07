import { readFileSync, writeFileSync } from 'node:fs'
import { format, resolveConfig } from 'prettier'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const lines = [
  '# 導入済みの依存関係',
  '',
  '[概要](../../README.md) · [文書一覧](../README.md) · [開発手順](README.md)',
  '',
  '2026-11-03に開発基盤を導入。次の一覧はpackage.jsonとインストール済みの直接依存から生成している。',
  '依存関係の導入と、店舗検索・ログインなどの業務機能の完成は区別する。',
  '',
  `- Node.js：\`${manifest.engines.node}\``,
  `- パッケージマネージャー：\`${manifest.packageManager}\``,
  '- `.nvmrc`・`.node-version`でNode.js 24系を指定。',
  '- 全直接依存を固定バージョンにし、pnpm-lock.yamlを保存。再現には `pnpm install --frozen-lockfile` を使う。',
  '- 更新後は `pnpm docs:dependencies` を実行し、この一覧も更新する。',
]

for (const [section, title] of [
  ['dependencies', '実行時依存'],
  ['devDependencies', '開発・検証依存'],
]) {
  lines.push(
    '',
    `## ${title}`,
    '',
    '| パッケージ | バージョン |',
    '| --- | --- |',
  )
  for (const name of Object.keys(manifest[section] ?? {}).sort()) {
    const { version } = JSON.parse(
      readFileSync(`node_modules/${name}/package.json`, 'utf8'),
    )
    if (version !== manifest[section][name]) {
      throw new Error(`${name}の導入バージョンがpackage.jsonと一致しません`)
    }
    lines.push(`| \`${name}\` | ${version} |`)
  }
}

lines.push(
  '',
  '## 組み込み状況',
  '',
  '- 起動基盤に接続済み：React、Vite、Tailwind、shadcn/uiの基本部品、TanStack Query・Router。',
  '- Firebase：Emulatorから店舗を取得し、メール・パスワード認証と管理者の登録編集を実装。firebase-adminは開発用シードにだけ使用し、ブラウザには含めない。',
  '- React Hook Form・Zod：Firebase設定と共有の店舗・フォームスキーマで使用。shadcn/uiのDialog内で登録編集フォームを実装。',
  '- 地図ラッパー：地図・現在地・地点選択、登録店舗とPlaces検索のピン・一覧・詳細を実装。geofire-commonはgeohash生成・半径3kmの周辺検索・距離順の表示に使用。',
  '- テスト・静的検査：基盤・店舗表示・シード・認証と権限・登録編集・取得上限・不正データ・Rulesを検証。',
  '',
)

lines.push(
  '## 推移依存の固定と監査記録',
  '',
  '- `@grpc/grpc-js` は `pnpm-workspace.yaml` の `overrides` で1.14.7に固定。Firebaseの推移依存に対する監査指摘を受け、修正版を使用する。',
  '- pnpmの公開後待機期間の例外は、npmから移行済みの固定バージョンに限定して `minimumReleaseAgeExclude` へ記録。一般の待機期間は無効化していない。',
  '- 直接依存を旧メジャーへ戻す `npm audit fix --force` は実行していない。',
  '- 2026-11-03の `npm audit --omit=dev` は指摘0件。開発依存を含む監査は高・重大0件、中30件、低2件が残る。',
  '- 指摘件数は当日の記録であり、以降の状態を保証しない。依存更新時と公開前に再確認する。',
  '- 検証方法と実行結果は[検証資料](testing.md)を参照する。',
  '',
)

const output = 'docs/development/dependencies.md'
writeFileSync(
  output,
  await format(lines.join('\n'), {
    ...(await resolveConfig(output)),
    filepath: output,
  }),
)
console.log('docs/development/dependencies.mdを更新しました。')
