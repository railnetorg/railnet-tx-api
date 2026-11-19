import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, toHex } from 'viem'
import { address, bytes32, uint256 } from './guards'

const abi = parseAbi([
  'struct Asset { address asset; uint256 value; }',
  'struct Query { address owner; address receiver; Asset input; Asset output; uint8 mode; bytes32 salt; bytes data; }',
  'function approve(address spender, uint256 amount)',
  'function create(Query query, address receiver, bytes32 sourceSalt)',
  'function createRedeemFromConduitShares(uint256 conduitShares, Asset outputAsset, bytes32 sourceSalt, address receiver)',
])

const DEPOSIT = 0
type Body = Record<string, unknown>

const randomSalt = () => toHex(crypto.getRandomValues(new Uint8Array(32)))

function approve(body: Body) {
  const conduit = address(body.conduit, 'conduit')
  const token = address(body.token, 'token')
  const amount = uint256(body.amount, 'amount')

  const data = encodeFunctionData({ abi, functionName: 'approve', args: [conduit, amount] })

  return { to: token, data, value: '0' }
}

function deposit(body: Body) {
  const conduit = address(body.conduit, 'conduit')
  const vehicle = address(body.vehicle, 'vehicle')
  const token = address(body.token, 'token')
  const sender = address(body.sender, 'sender')
  const amount = uint256(body.amount, 'amount')
  const minOutput = uint256(body.minOutput, 'minOutput')
  const salt = bytes32(body.salt ?? randomSalt(), 'salt')

  // The Conduit reverts InvalidQuerySalt unless query.salt is this hash of msg.sender and the salt argument.
  const querySalt = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [sender, salt]))

  const data = encodeFunctionData({
    abi,
    functionName: 'create',
    args: [
      {
        // Both must be the Conduit, or it reverts InvalidQueryOwnerOrReceiver.
        owner: conduit,
        receiver: conduit,
        input: { asset: token, value: amount },
        // A floor in vehicle shares.
        output: { asset: vehicle, value: minOutput },
        mode: DEPOSIT,
        salt: querySalt,
        data: '0x',
      },
      sender,
      salt,
    ],
  })

  return { to: conduit, data, value: '0', salt }
}

function redeem(body: Body) {
  const conduit = address(body.conduit, 'conduit')
  const token = address(body.token, 'token')
  const receiver = address(body.receiver, 'receiver')
  const shares = uint256(body.shares, 'shares')
  const minOutput = uint256(body.minOutput, 'minOutput')
  const salt = bytes32(body.salt ?? randomSalt(), 'salt')

  // Nothing binds a redeem to its sender: on a Conduit with transfers enabled, the receiver is paid whoever sends it.
  // minOutput is a floor in the token, before the Conduit's fees.
  const data = encodeFunctionData({
    abi,
    functionName: 'createRedeemFromConduitShares',
    args: [shares, { asset: token, value: minOutput }, salt, receiver],
  })

  return { to: conduit, data, value: '0', salt }
}

async function respond(request: Request, build: (body: Body) => object) {
  try {
    const body = await request.json()
    if (body === null) throw new Error('body: JSON object expected')
    return Response.json(build(body))
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 })
  }
}

export default {
  development: false,
  maxRequestBodySize: 4096,
  routes: {
    '/approve': { POST: (request: Request) => respond(request, approve) },
    '/deposit': { POST: (request: Request) => respond(request, deposit) },
    '/redeem': { POST: (request: Request) => respond(request, redeem) },
  },
  fetch: () => Response.json({ error: 'not found' }, { status: 404 }),
}
