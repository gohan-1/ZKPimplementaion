// models/verifiedProof.model.js
const mongoose = require('mongoose');

const verifiedProofSchema = new mongoose.Schema({
    proofHash: { type: String, required: true, unique: true, index: true },
    originalProof: { type: mongoose.Schema.Types.Mixed }, // Groth16 object (optional)
    leafValue: { type: [String], required: true },    // [proofHash, timestamp]
    merkleVersion: { type: Number, required: true },
    merkleLeafIndex: { type: Number, required: true },
    merkleProof: { type: [String], required: true },    // sibling hashes path
    root: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VerifiedProof', verifiedProofSchema);