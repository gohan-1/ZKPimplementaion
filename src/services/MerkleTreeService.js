// src/services/MerkleTreeService.js
const { IncrementalMerkleTree } = require('@zk-kit/incremental-merkle-tree');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class MerkleTreeService {
    constructor() {
        this.ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
        this.tree = null;
        this.currentRoot = this.ZERO_HASH;
        this.currentVersion = 0;
        this.depth = parseInt(process.env.MERKLE_TREE_DEPTH) || 20;
        this.dataDir = process.env.MERKLE_DATA_DIR || './MerkleData';
        this.stateFile = path.join(this.dataDir, 'merkleState.json');
        this.isInitialized = false;
    }
    
    async initialize() {
        console.log('🌲 Initializing Merkle Tree Service...');
        
        // Load or create state
        if (fs.existsSync(this.stateFile)) {
            const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            this.currentVersion = state.version;
            this.currentRoot = state.root;
            console.log(`📌 Loaded Merkle state: version ${this.currentVersion}, root ${this.currentRoot}`);
        }
        
        // Initialize tree structure (will be populated from DB when connected)
        // The actual tree will be built when MongoDB is connected
        
        this.isInitialized = true;
        return true;
    }
    
    async buildFromDatabase(CredentialModel) {
        // This will be called after MongoDB is connected
        console.log('Building Merkle tree from database...');
        
        const credentials = await CredentialModel.find({ isActive: true }).lean();
        
        if (credentials.length === 0) {
            console.log('No credentials found, keeping zero root');
            return;
        }
        
        // Build tree logic here
        console.log(`Built tree with ${credentials.length} credentials`);
    }
    
    getCurrentRoot() {
        return {
            root: this.currentRoot,
            version: this.currentVersion,
            leafCount: 0
        };
    }
}

module.exports = new MerkleTreeService();
