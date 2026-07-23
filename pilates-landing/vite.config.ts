import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import JavaScriptObfuscator from 'javascript-obfuscator'

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
  plugins: [react(), obfuscator()],
  build: {
    sourcemap: false,
  },
})
