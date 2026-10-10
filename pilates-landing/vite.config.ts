import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import JavaScriptObfuscator from 'javascript-obfuscator'
import { ADMIN_ROUTES } from './src/admin/routes'

const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/**
 * 관리자 포털(/admin/*) 지원:
 * - 빌드: 각 경로 폴더에 admin/index.html 복사본을 둔다 → GitHub Pages에서 새로고침·딥링크 동작
 *   (Pages에는 SPA 폴백이 없다). 관리자 페이지에만 CSP를 넣는다 (Pages는 헤더 설정 불가).
 * - 개발 서버: /admin/staff/ 같은 경로를 admin/index.html로 보낸다.
 */
function adminPortal(): Plugin {
  let outDir = 'dist'
  return {
    name: 'admin-portal',
    configResolved(config) {
      outDir = config.build.outDir
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? '').split('?')
        if (/^\/admin\/[\w-]+(\/[\w-]+)*\/?$/.test(path)) {
          req.url = '/admin/index.html' + (query ? `?${query}` : '')
        }
        next()
      })
    },
    transformIndexHtml(html, ctx) {
      if (ctx.server || !ctx.path.endsWith('/admin/index.html')) return html
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${ADMIN_CSP}" />`,
      )
    },
    writeBundle() {
      for (const route of Object.keys(ADMIN_ROUTES)) {
        if (!route) continue
        mkdirSync(`${outDir}/admin/${route}`, { recursive: true })
        copyFileSync(`${outDir}/admin/index.html`, `${outDir}/admin/${route}/index.html`)
      }
    },
  }
}

/**
 * 프로덕션 번들 난독화 — 경쟁사의 소스 분석을 어렵게 한다.
 * 문자열(카피·번역 포함)을 base64 배열로 감추고 식별자를 16진수로 바꾼다.
 * controlFlowFlattening은 성능 저하가 커서 끔.
 */
function obfuscator(): Plugin {
  return {
    name: 'obfuscator',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk' || !fileName.endsWith('.js')) continue
        // 관리자 전용 청크는 제외: 보안은 서버(RLS)가 담당하고, 난독화는 크기를 3배로 키워 아이폰 로딩만 늦춘다.
        if (output.name === 'admin') continue
        output.code = JavaScriptObfuscator.obfuscate(output.code, {
          compact: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 1,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 2,
          stringArrayWrappersType: 'function',
          splitStrings: true,
          splitStringsChunkLength: 12,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          disableConsoleOutput: true,
          selfDefending: false,
          sourceMap: false,
        }).getObfuscatedCode()
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), obfuscator(), adminPortal()],
  build: {
    sourcemap: false,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
      },
    },
  },
})
