// scripts/submitRoot.js
const merkleTreeService = require('../services/merkleTree.service');
const blockchainService = require('../services/blockchain.service');
const RootHistory = require('../models/treeSnapshot.model');

async function submitNewRoot() {
    try {
        // 1. Rebuild tree with latest credentials
        console.log('🌲 Rebuilding Merkle tree...');
        const treeData = await merkleTreeService.buildTreeFromDB();

        // 2. Save root locally
        const rootHistory = new RootHistory({
            version: treeData.version,
            root: treeData.root,
            leafCount: treeData.leafCount,
            createdBy: adminUserId
        });
        await rootHistory.save();

        // 3. Submit to blockchain
        console.log('⛓️ Submitting root to blockchain...');
        const tx = await blockchainService.addBatch(treeData.root, treeData.leafCount);

        // 4. Update with transaction hash
        rootHistory.txHash = tx.hash;
        rootHistory.deployedToChain = true;
        await rootHistory.save();

        // 5. Wait for confirmation
        console.log('⏳ Waiting for confirmation...');
        const receipt = await tx.wait();

        // 6. Update with block number
        rootHistory.blockNumber = receipt.blockNumber;
        rootHistory.confirmed = true;
        await rootHistory.save();

        console.log('✅ Root successfully deployed on-chain!');
        console.log(`   Version: ${treeData.version}`);
        console.log(`   Root: ${treeData.root}`);
        console.log(`   TX: ${tx.hash}`);
        console.log(`   Block: ${receipt.blockNumber}`);

        return {
            version: treeData.version,
            root: treeData.root,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber
        };
    } catch (error) {
        console.error('❌ Failed to submit root:', error);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    submitNewRoot()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = submitNewRoot;