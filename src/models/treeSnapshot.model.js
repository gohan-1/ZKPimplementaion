// models/treeSnapshot.model.js
const mongoose = require('mongoose');

const treeSnapshotSchema = new mongoose.Schema({
    version: { type: Number, required: true, unique: true, index: true },
    root: { type: String, required: true },
    leafCount: { type: Number, required: true },
    treeJson: { type: mongoose.Schema.Types.Mixed, required: true }, // StandardMerkleTree.dump()
    values: { type: [[mongoose.Schema.Types.Mixed]] },             // raw leaf arrays
    addedLeaf: { type: mongoose.Schema.Types.Mixed },
    rebuiltFromDB: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TreeSnapshot', treeSnapshotSchema);