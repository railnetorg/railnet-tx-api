/**
 * Checks a transaction against the request you sent. Same checks and same results as verify.ts,
 * written with viem instead of by hand.
 * Each function rebuilds the transaction from the request alone and compares it with the response, byte for byte.
 *
 * - Pass the values you sent, never values read from the response.
 * - `conduit`, `token` and `vehicle` come from your own registry, pinned at onboarding, never from an API.
 * - `salt` is yours: 32 random bytes, sent in the request.
 * - Sign `to`, `data` and `value` only, and only after `true`.
 * - `true` means the transaction is the one you asked for. It does not judge the request itself:
 *   `minOutput`, the redeem `receiver` and the approve `amount` are your choices.
 *
 * One dependency: viem.
 */

import { type Address, type Hex, encodeAbiParameters, encodeFunctionData, keccak256, maxUint256, parseAbi } from 'viem'

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

const abi = parseAbi([
  'struct Asset { address asset; uint256 value; }',
  'struct Query { address owner; address receiver; Asset input; Asset output; uint8 mode; bytes32 salt; bytes data; }',
  'function approve(address spender, uint256 amount)',
  'function create(Query query, address receiver, bytes32 sourceSalt)',
  'function createRedeemFromConduitShares(uint256 conduitShares, Asset outputAsset, bytes32 sourceSalt, address receiver)',
])

const DEPOSIT = 0

function uint(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) > maxUint256) throw new Error('uint256')
  return BigInt(value)
}

// Lowercased, so a checksummed address and its lowercase form are the same request.
function address(value: unknown): Address {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('address')
  return value.toLowerCase() as Address
}

function bytes32(value: unknown): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) throw new Error('bytes32')
  return value as Hex
}

function same(tx: unknown, build: () => { to: Address; data: Hex }): boolean {
  try {
    const { to, data, value } = tx as Record<string, unknown>
    if (typeof to !== 'string' || typeof data !== 'string' || value !== '0') return false
    const expected = build()
    return to.toLowerCase() === expected.to && data.toLowerCase() === expected.data
  } catch {
    return false
  }
}

/** `token.approve(conduit, amount)`. */
export function verifyApprove(request: ApproveRequest, tx: unknown): boolean {
  return same(tx, () => ({
    to: address(request.token),
    data: encodeFunctionData({ abi, functionName: 'approve', args: [address(request.conduit), uint(request.amount)] }),
  }))
}

/** `conduit.create(query, sender, salt)`: a deposit of `amount` of `token`, for at least `minOutput` Vehicle shares. */
export function verifyDeposit(request: DepositRequest, tx: unknown): boolean {
  return same(tx, () => {
    const conduit = address(request.conduit)
    const sender = address(request.sender)
    const salt = bytes32(request.salt)
    const data = encodeFunctionData({
      abi,
      functionName: 'create',
      args: [
        {
          owner: conduit,
          receiver: conduit,
          input: { asset: address(request.token), value: uint(request.amount) },
          output: { asset: address(request.vehicle), value: uint(request.minOutput) },
          mode: DEPOSIT,
          // The Conduit binds the query to its sender with this hash.
          salt: keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [sender, salt])),
          data: '0x',
        },
        sender,
        salt,
      ],
    })
    return { to: conduit, data }
  })
}

/** `conduit.createRedeemFromConduitShares(shares, (token, minOutput), salt, receiver)`. */
export function verifyRedeem(request: RedeemRequest, tx: unknown): boolean {
  return same(tx, () => ({
    to: address(request.conduit),
    data: encodeFunctionData({
      abi,
      functionName: 'createRedeemFromConduitShares',
      args: [uint(request.shares), { asset: address(request.token), value: uint(request.minOutput) }, bytes32(request.salt), address(request.receiver)],
    }),
  }))
}
