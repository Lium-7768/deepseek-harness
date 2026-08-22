/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-mobile-gateway`.
 * @module @deepseek-ai/dsh-mobile-gateway/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-mobile-gateway'

/** Cordis companion plugin name. */
export const name = 'mobile-gateway-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the Gateway's HTTP server and in-memory pairing registry
 * are construction-private and own no independently observable Cordis event or
 * durable-data relation; integration tests cover their authenticated transport behavior.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
