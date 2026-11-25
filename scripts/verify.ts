/**
 * Checks a transaction against the request you sent.
 * Each function rebuilds the transaction from the request alone and compares it with the response, byte for byte.
 *
 * - Pass the values you sent, never values read from the response.
 * - `conduit`, `token` and `vehicle` come from your own registry, pinned at onboarding, never from an API.
 * - `salt` is yours: 32 random bytes, sent in the request.
 * - Sign `to`, `data` and `value` only, and only after `true`.
 * - `true` means the transaction is the one you asked for. It does not judge the request itself:
 *   `minOutput`, the redeem `receiver` and the approve `amount` are your choices.
 *
 * `verifyDeposit` takes your own Keccak-256 (the Ethereum hash, not NIST SHA3-256), 0x-prefixed hex in and out:
 * the `keccak256` of ethers or viem fits as it is.
 *
 * No dependency. Needs BigInt (ES2020).
 */

export type Keccak256 = (data: `0x${string}`) => string

export type ApproveRequest = { conduit: string; token: string; amount: string }

export type DepositRequest = {
  conduit: string
  vehicle: string
  token: string
  sender: string
  amount: string
  minOutput: string
  salt: string
}

export type RedeemRequest = {
  conduit: string
  token: string
  receiver: string
  shares: string
  minOutput: string
  salt: string
}

const MAX_UINT256 = (1n << 256n) - 1n

const pad = (hex: string) => hex.padStart(64, '0')
const word = (value: bigint) => pad(value.toString(16))

function uint(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) > MAX_UINT256) throw new Error('uint256')
  return word(BigInt(value))
}

function address(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('address')
  return value.slice(2).toLowerCase()
}

function bytes32(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) throw new Error('bytes32')
  return value.slice(2)
}

function same(tx: unknown, build: () => { to: string; data: string }): boolean {
  try {
    const { to, data, value } = tx as Record<string, unknown>
    if (typeof to !== 'string' || typeof data !== 'string' || value !== '0') return false
    const expected = build()
    return to.toLowerCase() === `0x${expected.to}` && data.toLowerCase() === `0x${expected.data}`
  } catch {
    return false
  }
}

/** `token.approve(conduit, amount)`. */
export function verifyApprove(request: ApproveRequest, tx: unknown): boolean {
  return same(tx, () => ({
    to: address(request.token),
    data: `095ea7b3${pad(address(request.conduit))}${uint(request.amount)}`,
  }))
}

/** `conduit.create(query, sender, salt)`: a deposit of `amount` of `token`, for at least `minOutput` Vehicle shares. */
export function verifyDeposit(request: DepositRequest, tx: unknown, keccak256: Keccak256): boolean {
  return same(tx, () => {
    const conduit = pad(address(request.conduit))
    const sender = pad(address(request.sender))
    const salt = bytes32(request.salt)
    const words = [
      word(0x60n),
      sender,
      salt,
      conduit,
      conduit,
      pad(address(request.token)),
      uint(request.amount),
      pad(address(request.vehicle)),
      uint(request.minOutput),
      word(0n),
      bytes32(keccak256(`0x${sender}${salt}`).toLowerCase()),
      word(0x120n),
      word(0n),
    ]
    return { to: address(request.conduit), data: `50bb3af4${words.join('')}` }
  })
}

/** `conduit.createRedeemFromConduitShares(shares, (token, minOutput), salt, receiver)`. */
export function verifyRedeem(request: RedeemRequest, tx: unknown): boolean {
  return same(tx, () => ({
    to: address(request.conduit),
    data: `4c717f8d${uint(request.shares)}${pad(address(request.token))}${uint(request.minOutput)}${bytes32(request.salt)}${pad(address(request.receiver))}`,
  }))
}
