# railnet-tx-api

Builds the transactions a user signs to deposit into a Railnet Conduit and to redeem from it.

It encodes calldata and nothing else: no chain read, no key, no state, no configuration. How
deposits and redeems work is in the docs:
[Integrate a Conduit](https://docs.railnet.org/developers/integrate-conduit).

```bash
bun install
bun index.ts
```

Tested on Bun 1.4.4. The port is `$PORT`, 3000 by default. `index.ts` is the whole integration.

## Routes

Every route is a `POST` with a JSON body of 4096 bytes at most, and returns one transaction,
`{ to, data, value }`. Amounts are decimal strings in the smallest unit: of the token for `amount`,
of the Conduit's shares for `shares`. Addresses are lowercase or EIP-55 checksummed. An invalid body
is a `400 { error }`.

| Route | Body | Transaction |
|---|---|---|
| `/approve` | `conduit`, `token`, `amount` | `token.approve(conduit, amount)` |
| `/deposit` | `conduit`, `vehicle`, `token`, `amount`, `sender`, `minOutput`, `salt`? | `conduit.create(query, sender, salt)` |
| `/redeem` | `conduit`, `token`, `shares`, `receiver`, `minOutput`, `salt`? | `conduit.createRedeemFromConduitShares(shares, (token, minOutput), salt, receiver)` |

- `vehicle` is `conduit.getVehicle()`, `token` is `conduit.asset()`.
- `sender` sends the deposit and receives the shares.
- `receiver` is paid by the redeem, whoever sends it. Set it to the account that sends the
  transaction.
- `minOutput` is a floor: in vehicle shares on a deposit, in the token before the Conduit's fees on
  a redeem. `"0"` sets none.
- `salt` is 32 bytes of lowercase hex, drawn at random when omitted, and returned. The same request
  with the same salt returns the same bytes.

## Check what you sign

Do not trust this service, or any copy of it. Before a user signs, decode `data` and check:

1. `to` is the token (approve) or the Conduit (deposit, redeem) from your own registry.
2. The selector is `0x095ea7b3` (approve), `0x50bb3af4` (create) or `0x4c717f8d`
   (createRedeemFromConduitShares).
3. Every argument is the one you sent, with one exception: on a deposit, `query.salt` is
   `keccak256(abi.encode(sender, salt))`. On a deposit, `query.owner` and `query.receiver` are the
   Conduit, and the `receiver` argument is the sender.
4. `value` is `"0"`.

Then simulate it.

## Tests

`bun test`. The deposit and redeem vectors are the inputs of two Ethereum mainnet transactions,
reproduced byte for byte:

- deposit `0xd09f50435e0834cb7c2a3e44f6d010d91635d2049ad80741932ff8c3e121cb7b`
- redeem `0xfa57cefc561926f7f90936d006438e14d0d03be41c784b3279322d55898ce5f0`
