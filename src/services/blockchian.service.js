// services/blockchain.service.js
const { ethers } = require('ethers');
const CredentialVerifierABI = require('../abis/CredentialVerifier.json');

class BlockchainService {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.contractAddress = process.env.CONTRACT_ADDRESS;
        this.rpcUrl = process.env.ETHEREUM_RPC_URL;
        this.privateKey = process.env.PRIVATE_KEY;

        this.init();
    }

    init() {
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        this.signer = new ethers.Wallet(this.privateKey, this.provider);
        this.contract = new ethers.Contract(
            this.contractAddress,
            CredentialVerifierABI,
            this.signer
        );
    }

    /**
     * Add new batch root to blockchain
     * @param {string} root - Merkle root
     * @param {number} leafCount - Number of leaves
     * @returns {Promise<Object>} Transaction object
     */
    async addBatch(root, leafCount) {
        try {
            console.log(`📤 Submitting root to blockchain: ${root}`);

            const tx = await this.contract.addBatch(root, leafCount);
            console.log(`⏳ Transaction sent: ${tx.hash}`);

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log(`✅ Confirmed in block: ${receipt.blockNumber}`);

            return {
                hash: tx.hash,
                blockNumber: receipt.blockNumber,
                status: receipt.status
            };
        } catch (error) {
            console.error('Error submitting to blockchain:', error);
            throw new Error(`Blockchain submission failed: ${error.message}`);
        }
    }

    /**
     * Get current root from blockchain
     * @returns {Promise<Object>} Current root info
     */
    async getCurrentRoot() {
        try {
            const versionsCount = await this.contract.versionsLength();

            if (versionsCount === 0) {
                return {
                    root: null,
                    version: -1,
                    leafCount: 0
                };
            }

            const version = versionsCount - 1;
            const versionData = await this.contract.versions(version);

            return {
                root: versionData.root,
                version: version,
                leafCount: versionData.leafCount,
                timestamp: new Date(versionData.timestamp * 1000)
            };
        } catch (error) {
            console.error('Error getting current root:', error);
            throw error;
        }
    }

    /**
     * Get root by version from blockchain
     * @param {number} version - Version number
     * @returns {Promise<Object>} Root info
     */
    async getRootByVersion(version) {
        try {
            const versionData = await this.contract.versions(version);

            if (!versionData || versionData.root === '0x0000000000000000000000000000000000000000000000000000000000000000') {
                return null;
            }

            return {
                version,
                root: versionData.root,
                leafCount: versionData.leafCount,
                timestamp: new Date(versionData.timestamp * 1000)
            };
        } catch (error) {
            console.error(`Error getting root for version ${version}:`, error);
            return null;
        }
    }

    /**
     * Get all roots from blockchain
     * @returns {Promise<Array>} All roots
     */
    async getAllRoots() {
        try {
            const versionsCount = await this.contract.versionsLength();
            const roots = [];

            for (let i = 0; i < versionsCount; i++) {
                const root = await this.getRootByVersion(i);
                if (root) roots.push(root);
            }

            return roots;
        } catch (error) {
            console.error('Error getting all roots:', error);
            throw error;
        }
    }

    /**
     * Get transaction receipt
     * @param {string} txHash - Transaction hash
     * @returns {Promise<Object>} Receipt
     */
    async getTransactionReceipt(txHash) {
        try {
            const receipt = await this.provider.getTransactionReceipt(txHash);
            const tx = await this.provider.getTransaction(txHash);

            if (!receipt) {
                return { confirmations: 0, status: 'pending' };
            }

            const currentBlock = await this.provider.getBlockNumber();
            const confirmations = currentBlock - receipt.blockNumber + 1;

            return {
                ...receipt,
                confirmations,
                from: tx?.from,
                to: tx?.to
            };
        } catch (error) {
            console.error('Error getting receipt:', error);
            return null;
        }
    }
}

module.exports = new BlockchainService();