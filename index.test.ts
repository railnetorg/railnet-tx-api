import { afterAll, expect, test } from 'bun:test'
import app from './index'

const server = Bun.serve({ ...app, port: 0 })
afterAll(() => server.stop())

const conduit = '0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d9'
const vehicle = '0xce532ed9019010657840a1484895ec00d5693a48'
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'

const deposit = {
  conduit,
  vehicle,
  token: usdc,
  amount: '1000000',
  sender: '0xde6308e382dca8b725bc66a0575304840e08d9a8',
  minOutput: '833746125109265740',
  salt: '0xfd998ee5f4a1caddeefa25ce83121601e5326a0c70fe6601c3a95f71a67770c4',
}

const redeem = {
  conduit,
  token: usdc,
  shares: '498798408652837363',
  receiver: '0xfe2f597f40da9c6abf6dea0b9cefe376a6117c7a',
  minOutput: '498008',
  salt: '0x1483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c070035',
}

async function post(path: string, body: unknown) {
  const response = await fetch(new URL(path, server.url), { method: 'POST', body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() }
}

test('deposit returns the input of mainnet tx 0xd09f5043…cb7b, so the Query layout, owner = receiver = conduit and the sender-bound salt match what Conduit.create accepts', async () => {
  expect(await post('/deposit', deposit)).toEqual({
    status: 200,
    body: {
      to: conduit,
      data: '0x50bb3af40000000000000000000000000000000000000000000000000000000000000060000000000000000000000000de6308e382dca8b725bc66a0575304840e08d9a8fd998ee5f4a1caddeefa25ce83121601e5326a0c70fe6601c3a95f71a67770c40000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d90000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d9000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000ce532ed9019010657840a1484895ec00d5693a480000000000000000000000000000000000000000000000000b920faef3ff054c0000000000000000000000000000000000000000000000000000000000000000a33d32c6331dd73760fa94e36f17cb757dd0f74cfac71e8386176cff485b2b7700000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000',
      value: '0',
      salt: deposit.salt,
    },
  })
})

test('redeem returns the input of mainnet tx 0xfa57cefc…e5f0, so the argument order matches createRedeemFromConduitShares and the request\'s receiver is the one paid', async () => {
  expect(await post('/redeem', redeem)).toEqual({
    status: 200,
    body: {
      to: conduit,
      data: '0x4c717f8d00000000000000000000000000000000000000000000000006ec16828a4851f3000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000799581483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c070035000000000000000000000000fe2f597f40da9c6abf6dea0b9cefe376a6117c7a',
      value: '0',
      salt: redeem.salt,
    },
  })
})

test('approve targets the token and names the conduit as spender for the exact amount, so no other address gets an allowance', async () => {
  expect(await post('/approve', { conduit, token: usdc, amount: '1000000' })).toEqual({
    status: 200,
    body: {
      to: usdc,
      data: '0x095ea7b30000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d900000000000000000000000000000000000000000000000000000000000f4240',
      value: '0',
    },
  })
})

test.each([
  ['/deposit', deposit],
  ['/redeem', redeem],
])('%s without a salt draws one per request, encodes it and returns it, so two requests are two queries and the caller can retry the same one', async (path, body) => {
  const { salt, ...withoutSalt } = body
  const first = await post(path, withoutSalt)
  const second = await post(path, withoutSalt)
  expect(first.status).toBe(200)
  expect(first.body.salt).toMatch(/^0x[0-9a-f]{64}$/)
  expect(first.body.data).toContain(first.body.salt.slice(2))
  expect(second.body.data).toContain(second.body.salt.slice(2))
  expect(second.body.salt).not.toBe(first.body.salt)
  expect((await post(path, { ...withoutSalt, salt: first.body.salt })).body.data).toBe(first.body.data)
  expect((await post(path, { ...withoutSalt, salt: null })).body.salt).toMatch(/^0x[0-9a-f]{64}$/)
})

test.each([
  ['an address that is not one', '/deposit', { ...deposit, conduit: '0x123' }, 'conduit: address expected'],
  ['an address sent as an array', '/deposit', { ...deposit, conduit: [conduit] }, 'conduit: address expected'],
  ['a vehicle that is not an address', '/deposit', { ...deposit, vehicle: '0x123' }, 'vehicle: address expected'],
  ['a deposit token that is not an address', '/deposit', { ...deposit, token: 'usdc' }, 'token: address expected'],
  ['a missing sender', '/deposit', { ...deposit, sender: undefined }, 'sender: address expected'],
  ['a zero sender, which Conduit.create reverts as InvalidReceiver', '/deposit', { ...deposit, sender: `0x${'0'.repeat(40)}` }, 'sender: zero address'],
  ['a zero receiver, which Conduit.create reverts as InvalidReceiver', '/redeem', { ...redeem, receiver: `0x${'0'.repeat(40)}` }, 'receiver: zero address'],
  ['a redeem token that is not an address', '/redeem', { ...redeem, token: '0x123' }, 'token: address expected'],
  ['an amount sent as a JSON number', '/deposit', { ...deposit, amount: 1000000 }, 'amount: uint256 decimal string expected'],
  ['a missing floor', '/deposit', { ...deposit, minOutput: undefined }, 'minOutput: uint256 decimal string expected'],
  ['a salt shorter than 32 bytes', '/deposit', { ...deposit, salt: '0x1234' }, 'salt: 32-byte hex expected'],
  ['shares sent as a JSON number', '/redeem', { ...redeem, shares: 498798408652837363 }, 'shares: uint256 decimal string expected'],
  ['a salt that is not hex', '/redeem', { ...redeem, salt: `0x${'z'.repeat(64)}` }, 'salt: 32-byte hex expected'],
  ['a salt sent as an array', '/deposit', { ...deposit, salt: [deposit.salt] }, 'salt: 32-byte hex expected'],
  ['a salt with bytes before 0x', '/deposit', { ...deposit, salt: `00${deposit.salt}` }, 'salt: 32-byte hex expected'],
  ['a salt longer than 32 bytes', '/deposit', { ...deposit, salt: `${deposit.salt}00` }, 'salt: 32-byte hex expected'],
  [
    'a salt in uppercase hex',
    '/redeem',
    { ...redeem, salt: '0x1483AFB0A95E65F56386F4FB6DE2D64F3802D6382A5EBEC628C6EF544C070035' },
    'salt: 32-byte hex expected',
  ],
  ['an empty salt on a deposit', '/deposit', { ...deposit, salt: '' }, 'salt: 32-byte hex expected'],
  ['an empty salt on a redeem', '/redeem', { ...redeem, salt: '' }, 'salt: 32-byte hex expected'],
  ['an empty amount', '/deposit', { ...deposit, amount: '' }, 'amount: uint256 decimal string expected'],
  ['a hex amount', '/deposit', { ...deposit, amount: '0x10' }, 'amount: uint256 decimal string expected'],
  ['a receiver that is not an address', '/redeem', { ...redeem, receiver: 'me' }, 'receiver: address expected'],
  ['a redeem conduit that is not an address', '/redeem', { ...redeem, conduit: '0x123' }, 'conduit: address expected'],
  ['a redeem without a floor', '/redeem', { ...redeem, minOutput: undefined }, 'minOutput: uint256 decimal string expected'],
  [
    'a token whose checksum is wrong',
    '/approve',
    { conduit, token: '0xa0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1' },
    'token: address expected',
  ],
  ['a spender that is not an address', '/approve', { conduit: '0x123', token: usdc, amount: '1' }, 'conduit: address expected'],
  [
    'an amount of 2^256',
    '/approve',
    { conduit, token: usdc, amount: '115792089237316195423570985008687907853269984665640564039457584007913129639936' },
    'amount: uint256 decimal string expected',
  ],
  ['a null body', '/deposit', null, 'body: JSON object expected'],
])('%s is a 400, so a malformed request never becomes calldata', async (_case, path, body, error) => {
  expect(await post(path, body)).toEqual({ status: 400, body: { error } })
})

test('an amount of 2^256 - 1 is accepted, so the uint256 bound rejects nothing valid', async () => {
  const amount = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
  expect(await post('/approve', { conduit, token: usdc, amount })).toEqual({
    status: 200,
    body: {
      to: usdc,
      data: '0x095ea7b30000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d9ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      value: '0',
    },
  })
})

test('a body that is not JSON is a 400 with an error, so a client always gets JSON back for a bad request', async () => {
  const response = await fetch(new URL('/deposit', server.url), { method: 'POST', body: '{"conduit":' })
  expect(response.status).toBe(400)
  expect((await response.json()).error).toStartWith('JSON Parse error')
})

test('a body of 4096 bytes is answered and one of 4097 is a 413, so the service never parses a larger payload', async () => {
  const empty = JSON.stringify({ ...deposit, padding: '' }).length
  const sized = (bytes: number) => JSON.stringify({ ...deposit, padding: 'a'.repeat(bytes - empty) })
  const url = new URL('/deposit', server.url)
  expect((await fetch(url, { method: 'POST', body: sized(4096) })).status).toBe(200)
  expect((await fetch(url, { method: 'POST', body: sized(4097) })).status).toBe(413)
})

test.each(['/approve', '/deposit', '/redeem'])('%s answers POST only, so no other method returns a transaction', async (path) => {
  const url = new URL(path, server.url)
  expect((await fetch(url)).status).toBe(404)
  expect((await fetch(url, { method: 'PUT', body: '{}' })).status).toBe(404)
})

test('any other path is a 404, so only the three routes answer', async () => {
  expect((await fetch(new URL('/bun:info', server.url))).status).toBe(404)
  expect(await post('/unknown', deposit)).toEqual({ status: 404, body: { error: 'not found' } })
})
