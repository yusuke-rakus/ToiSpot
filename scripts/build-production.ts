import { build, loadEnv } from 'vite'
import { validateProductionConfig } from '../src/lib/firebase-config.ts'

const env = loadEnv('production', process.cwd(), 'VITE_')
validateProductionConfig(env)
// 検査済みの値を優先させ、Viteが同じ値をビルドへ埋め込むようにする。
Object.assign(process.env, env)
process.env.NODE_ENV = 'production'
await build({ mode: 'production' })
