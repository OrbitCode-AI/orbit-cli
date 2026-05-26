/**
 * Tests for the backend zone selection logic. The CLI defaults to
 * staging (api.llama.space + staging.orbitcode.ai) and only switches
 * to prod (api.myth.work + orbitcode.ai) when --prod is passed.
 *
 * Per spec section "Sample session" and "Backend changes required":
 *   --prod → api.myth.work / orbitcode.ai
 *   default → api.llama.space / staging.orbitcode.ai
 *   --api or ORBIT_API_URL → override
 *   ORBIT_AUTH_URL → override auth side independently
 */

import { describe, expect, it } from 'vitest'
import { resolveBackend } from './index.js'

describe('resolveBackend', () => {
  it('defaults to staging when --prod is not set', () => {
    const { apiUrl, authOrigin } = resolveBackend({ env: {} })
    expect(apiUrl).toBe('https://api.llama.space')
    expect(authOrigin).toBe('https://staging.orbitcode.ai')
  })

  it('switches to prod when --prod is set', () => {
    const { apiUrl, authOrigin } = resolveBackend({ prod: true, env: {} })
    expect(apiUrl).toBe('https://api.myth.work')
    expect(authOrigin).toBe('https://orbitcode.ai')
  })

  it('lets --api override the API URL', () => {
    const { apiUrl, authOrigin } = resolveBackend({
      apiUrl: 'http://localhost:8787',
      env: {},
    })
    expect(apiUrl).toBe('http://localhost:8787')
    // Auth still defaults to staging (no --prod).
    expect(authOrigin).toBe('https://staging.orbitcode.ai')
  })

  it('lets ORBIT_API_URL override the API URL', () => {
    const { apiUrl } = resolveBackend({ env: { ORBIT_API_URL: 'http://test:9999' } })
    expect(apiUrl).toBe('http://test:9999')
  })

  it('--api flag wins over ORBIT_API_URL', () => {
    const { apiUrl } = resolveBackend({
      apiUrl: 'http://flag:1111',
      env: { ORBIT_API_URL: 'http://env:2222' },
    })
    expect(apiUrl).toBe('http://flag:1111')
  })

  it('lets ORBIT_AUTH_URL override the auth origin independently', () => {
    const { apiUrl, authOrigin } = resolveBackend({
      prod: true,
      env: { ORBIT_AUTH_URL: 'http://local-auth' },
    })
    expect(apiUrl).toBe('https://api.myth.work')
    expect(authOrigin).toBe('http://local-auth')
  })
})
