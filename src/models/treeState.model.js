// models/treeState.model.js
//
// Stores a compact checkpoint of the IncrementalMerkleTree's internal state.
//
// Why not store all leaves?
//   An IMT only needs O(depth) nodes ("filledSubtrees") to reconstruct itself —
//   not the full list of leaves. This keeps the checkpoint document tiny even
//   when millions of leaves have been inserted.
//
// What is stored:
//   • zeroes      — the zero hash at each level (depth+1 values, constant)
//   • nodes       — sparse internal node map: { level, index, value }
//   • leafCount   — how many leaves have been inserted
//   • root        — the Merkle root at checkpoint time (for quick lookup)
//
// On startup the service loads the latest checkpoint, restores the IMT from
// these fields, then replays only the leaves inserted since that checkpoint.

'use strict';

const mongoose = require('mongoose');

const nodeEntrySchema = new mongoose.Schema({
    level: { type: Number, required: true },
    index: { type: Number, required: true },
    value: { type: String, required: true }   // bigint as hex string
}, { _id: false });

const treeStateSchema = new mongoose.Schema({
    version: { type: Number, required: true, unique: true, index: true },
    root: { type: String, required: true },
    leafCount: { type: Number, required: true },
    depth: { type: Number, required: true, default: 20 },

    // IMT internal state — O(depth) not O(N)
    zeroes: { type: [String], required: true },  // hex bigints
    nodes: { type: [nodeEntrySchema], required: true }, // sparse node map

    isRebuild: { type: Boolean, default: false },
    savedAt: { type: Date, default: Date.now },

    // ── On-chain anchor (FUTURE) ───────────────────────────────────────────
    // Populated by _submitRootToChain() once the smart contract is deployed
    submittedToChain: { type: Boolean, default: false },
    txHash: { type: String, default: null },
    chainName: { type: String, default: null },   // e.g. 'polygon', 'sepolia'
    submittedAt: { type: Date, default: null }
});

module.exports = mongoose.model('TreeState', treeStateSchema);