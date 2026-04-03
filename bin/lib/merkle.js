const path = require('path');
const fs = require('fs');
const { askQuestion } = require('./utils');

/**
 * Initialize Merkle tree structure in the project
 */
async function setupMerkleTree(appPath) {
    console.log('\n🌲 Setting up Merkle Tree...');

    const merkleDir = path.join(appPath, 'MerkleData');
    const dataDir = path.join(merkleDir, 'data');
    const backupsDir = path.join(merkleDir, 'backups');

    // Create Merkle directories
    if (!fs.existsSync(merkleDir)) {
        fs.mkdirSync(merkleDir, { recursive: true });
        console.log('✅ Created MerkleData directory');
    }

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('✅ Created Merkle data directory');
    }

    if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
        console.log('✅ Created Merkle backups directory');
    }

    // Create initial Merkle state file (empty tree)
    const initialStatePath = path.join(merkleDir, 'merkleState.json');

    if (!fs.existsSync(initialStatePath)) {
        const initialState = {
            version: 0,
            root: "0x0000000000000000000000000000000000000000000000000000000000000000",
            leafCount: 0,
            depth: 20,
            hashFunction: "keccak256",
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        fs.writeFileSync(initialStatePath, JSON.stringify(initialState, null, 2));
        console.log('✅ Created initial Merkle state (zero root)');
    } else {
        console.log('📌 Merkle state already exists');
    }

    // Create .env entries for Merkle tree
    const envPath = path.join(appPath, '../.env');
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');

        if (!envContent.includes('MERKLE_TREE_ENABLED')) {
            envContent += '\n# Merkle Tree Configuration\n';
            envContent += 'MERKLE_TREE_ENABLED=true\n';
            envContent += 'MERKLE_TREE_DEPTH=20\n';
            envContent += 'MERKLE_ZERO_ROOT=0x0000000000000000000000000000000000000000000000000000000000000000\n';
            envContent += 'MERKLE_DATA_DIR=./MerkleData\n';
            fs.writeFileSync(envPath, envContent);
            console.log('✅ Added Merkle configuration to .env');
        }
    }

    // Create Merkle tree service stub (will be used by the main app)
    const merkleServicePath = path.join(appPath, '../src/services/MerkleTreeService.js');
    const merkleServiceDir = path.dirname(merkleServicePath);

    if (!fs.existsSync(merkleServiceDir)) {
        fs.mkdirSync(merkleServiceDir, { recursive: true });
    }

    if (!fs.existsSync(merkleServicePath)) {
        const serviceTemplate = `// src/services/MerkleTreeService.js
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
            console.log(\`📌 Loaded Merkle state: version \${this.currentVersion}, root \${this.currentRoot}\`);
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
        console.log(\`Built tree with \${credentials.length} credentials\`);
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
`;

        fs.writeFileSync(merkleServicePath, serviceTemplate);
        console.log('✅ Created MerkleTreeService stub');
    }

    // Update package.json with Merkle dependencies
    const packageJsonPath = path.join(appPath, '../package.json');
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        if (!packageJson.dependencies['@zk-kit/incremental-merkle-tree']) {
            packageJson.dependencies['@zk-kit/incremental-merkle-tree'] = '^1.0.0';
            packageJson.dependencies['ethers'] = packageJson.dependencies['ethers'] || '^5.7.2';

            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log('✅ Added Merkle dependencies to package.json');
        }
    }

    console.log('✅ Merkle tree setup complete!');
    console.log(`   Zero root: ${"0x0000000000000000000000000000000000000000000000000000000000000000"}`);
    console.log(`   Max leaves: ${Math.pow(2, 20).toLocaleString()}`);
}

/**
 * Check if Merkle tree should be initialized
 */
async function shouldSetupMerkleTree() {
    const setupMerkle = await askQuestion('\n🌲 Initialize Merkle Tree (for credential proofs)? (y/n): ');
    return setupMerkle.toLowerCase() === 'y';
}

module.exports = { setupMerkleTree, shouldSetupMerkleTree };