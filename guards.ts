import { type Hex, isAddress, maxUint256, zeroAddress } from 'viem'

export function address(value: unknown, name: string) {
  if (typeof value !== 'string' || !isAddress(value)) throw new Error(`${name}: address expected`)
  if (value === zeroAddress) throw new Error(`${name}: zero address`)
  return value
}

export function uint256(value: unknown, name: string) {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) > maxUint256) {
    throw new Error(`${name}: uint256 decimal string expected`)
  }
  return BigInt(value)
}

export function bytes32(value: unknown, name: string) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) throw new Error(`${name}: 32-byte hex expected`)
  return value as Hex
}
