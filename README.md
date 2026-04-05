# Merkle Tree v2 — Incremental Poseidon IMT

## Architecture

```
INSERT  →  keccak256(proof)  →  IMT.insert(BigInt)  →  O(depth=20) Poseidon hashes
                                        ↓
                               new root computed
                                        ↓
                    ┌───────────────────┴───────────────────┐
                    ↓                                       ↓
             VerifiedProof (MongoDB)               TreeState checkpoint
             proofHash, siblings[],                every 100 inserts
             pathIndices[], root                   O(depth) internal state
                                                          ↓
                                               [FUTURE] On-chain root anchor
```

## Why Poseidon?

Poseidon is a ZK-friendly hash function. It runs inside arithmetic circuits
efficiently — hashing two field elements costs ~200 constraints vs ~27,000 for
keccak256. Since you're already using Groth16, your verifier circuit can include
Poseidon for "is this leaf in the tree?" at very low cost.

keccak256 is still used to hash the raw Groth16 proof object → bytes32 proofHash.
The Poseidon hash is only used *inside the Merkle tree* (parent = poseidon2(left, right)).

## Startup behaviour

```
Cold start (no checkpoint):  replay all VerifiedProof records — O(N × depth)
Normal restart:              restore latest checkpoint, replay N new leaves — O(N_new × depth)
Checkpoint interval:         every 100 inserts
```

## Install

```bash
npm install @zk-kit/imt poseidon-lite ethers mongoose
```

## Environment variables

```env
# Required now
MONGODB_URI=mongodb://localhost:27017/zkp_db

# Required when on-chain is enabled (FUTURE)
ONCHAIN_ENABLED=false
RPC_URL=https://rpc.ankr.com/polygon
PRIVATE_KEY=0x...
MERKLE_CONTRACT_ADDRESS=0x...
```

## Verification modes

### 1. DB-assisted (most common)
```json
POST /merkle/verify/by-proof-hash
{ "proofHash": "0x..." }
```
Looks up sibling path in DB, recomputes root with Poseidon, compares to current root.

### 2. Raw proof (convenient)
```json
POST /merkle/verify/by-raw-proof
{ "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...] } }
```
Hashes the proof first, then same as above.

### 3. Trustless (no DB needed)
```json
POST /merkle/verify/with-path
{
  "proofHash": "0x...",
  "merkleProof": { "siblings": ["0x...", ...], "pathIndices": [0, 1, 0, ...] },
  "root": "0x..."
}
```
Pure Poseidon recompute. Works offline. This is what you'd use with the on-chain root.

## On-chain flow (FUTURE)

1. Deploy `MerkleRoot.sol`:
   ```solidity
   function submitRoot(uint256 version, bytes32 root) external onlyOwner
   function getRoot(uint256 version) external view returns (bytes32)
   ```
2. Set `ONCHAIN_ENABLED=true` in the service constructor
3. Uncomment `_submitRootToChain()` call in `_insertLeaf()`
4. Implement `_submitRootToChain()` and `_getRootFromChain()` stubs
5. For verification, pass `expectedRoot: "onchain"` to fetch the root from chain

## Tree capacity

| Depth | Max leaves     | RAM (filledSubtrees) |
|-------|---------------|----------------------|
| 20    | 1,048,576     | 21 BigInts           |
| 24    | 16,777,216    | 25 BigInts           |
| 32    | 4,294,967,296 | 33 BigInts           |

RAM is O(depth) regardless of how many leaves you insert.
