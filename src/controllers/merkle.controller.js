const merkleService = require('../services/merkle.service');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const Credential = require('../models/credential.model');
const TreeSnapshot = require('../models/treeSnapshot.model');


const getProofForVerification = async (req, res) => {
    try {
        const { userID, issuerID } = req.params;

        // Get credential from database
        const credential = await Credential.findOne({
            userID: parseInt(userID),
            issuerID: parseInt(issuerID),
            isActive: true
        });

        if (!credential) {
            return res.status(404).json({
                success: false,
                message: 'Credential not found'
            });
        }

        // Get current tree snapshot
        const snapshot = await TreeSnapshot.findOne().sort({ version: -1 });

        if (!snapshot || snapshot.leafCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Merkle tree is empty'
            });
        }

        // Load tree from snapshot
        const tree = StandardMerkleTree.load(snapshot.treeJson);

        // Find leaf in tree
        const leafValue = [
            credential.userID.toString(),
            credential.issuerID.toString(),
            credential.credentialHash
        ];

        let leafIndex = -1;
        for (const [i, v] of tree.entries()) {
            if (v[0] === leafValue[0] && v[1] === leafValue[1] && v[2] === leafValue[2]) {
                leafIndex = i;
                break;
            }
        }

        if (leafIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Credential not found in current tree'
            });
        }

        // Generate proof
        const proof = tree.getProof(leafIndex);

        // Get current root info
        const currentRoot = await merkleService.getCurrentRoot();

        res.json({
            success: true,
            data: {
                proof: proof,
                leaf: tree.leafHash(leafValue),
                leafIndex: leafIndex,
                version: snapshot.version,
                root: currentRoot.root,
                credentialData: {
                    userID: credential.userID,
                    issuerID: credential.issuerID,
                    credentialHash: credential.credentialHash,
                    claimValue: credential.claimValue,
                    requiredValue: credential.requiredValue,
                    operator: credential.operator
                }
            }
        });
    } catch (error) {
        console.error('Error getting proof:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const getCurrentRoot = async (req, res) => {
    try {
        const rootInfo = await merkleService.getCurrentRoot();

        res.json({
            success: true,
            data: rootInfo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const rebuildTree = async (req, res) => {
    try {
        const result = await merkleService.buildTreeFromDB();

        res.json({
            success: true,
            message: 'Merkle tree rebuilt successfully',
            data: result
        });
    } catch (error) {
        console.error('Error rebuilding tree:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



const addProofToTree = async (req, res) => {
    try {
        const { proof } = req.body;

        // Validate required field
        if (!proof) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: proof'
            });
        }

        console.log('📝 Adding ZKP proof to Merkle tree...');
        console.log(`   Proof PI_A: ${proof.pi_a?.[0]?.substring(0, 20)}...`);

        // Use existing addZKPProof method - pass empty metadata
        const result = await merkleService.addZKPProof(
            proof,
            [],  // No public signals
            {}   // No metadata
        );

        res.json({
            success: true,
            message: 'ZKP proof hash added to Merkle tree',
            data: {
                commitment: result.commitment,
                nullifier: result.nullifier,
                leafIndex: result.leafIndex,
                leafHash: result.leafHash,
                merkleProof: result.proof,
                root: result.root,
                version: result.version,
                leafCount: result.leafCount
            }
        });

    } catch (error) {
        console.error('Error adding proof to tree:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const getProofByCommitment = async (req, res) => {
    try {
        const { commitment } = req.params;

        const VerifiedProof = require('../../models/VerifiedProof.model');
        const proofRecord = await VerifiedProof.findOne({ proofHash: commitment });

        if (!proofRecord) {
            return res.status(404).json({
                success: false,
                message: `Proof with commitment ${commitment} not found`
            });
        }

        res.json({
            success: true,
            data: {
                commitment: proofRecord.proofHash,
                nullifier: proofRecord.nullifier,
                merkleVersion: proofRecord.merkleVersion,
                merkleLeafIndex: proofRecord.merkleLeafIndex,
                merkleProof: proofRecord.merkleProof,
                root: proofRecord.root,
                timestamp: proofRecord.timestamp,
                originalProof: proofRecord.originalProof
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const submitRootToChain = async (req, res) => {
    try {
        const { version } = req.params;

        // Get root from database
        const snapshot = await TreeSnapshot.findOne({ version: parseInt(version) });

        if (!snapshot) {
            return res.status(404).json({
                success: false,
                message: `Version ${version} not found`
            });
        }

        // Call blockchain service to submit root
        const result = await merkleService.submitRootToChain(
            snapshot.version,
            snapshot.root,
            snapshot.leafCount
        );

        res.json({
            success: true,
            message: 'Root submitted to blockchain',
            data: result
        });
    } catch (error) {
        console.error('Error submitting root:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const getSubmissionStatus = async (req, res) => {
    try {
        const { txHash } = req.params;
        const status = await merkleService.getSubmissionStatus(txHash);

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const syncRootsFromChain = async (req, res) => {
    try {
        const roots = await merkleService.syncRootsFromChain();

        res.json({
            success: true,
            message: `Synced ${roots.length} roots from blockchain`,
            data: roots
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const getRootByVersion = async (req, res) => {
    try {
        const { version } = req.params;
        const snapshot = await TreeSnapshot.findOne({ version: parseInt(version) });

        if (!snapshot) {
            return res.status(404).json({
                success: false,
                message: `Version ${version} not found`
            });
        }

        res.json({
            success: true,
            data: {
                version: snapshot.version,
                root: snapshot.root,
                leafCount: snapshot.leafCount,
                createdAt: snapshot.createdAt,
                submittedToChain: snapshot.submittedToChain,
                txHash: snapshot.txHash
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    getProofForVerification,
    getCurrentRoot,
    rebuildTree,
    addProofToTree,
    submitRootToChain,
    getSubmissionStatus,
    syncRootsFromChain,
    getProofByCommitment,
    getRootByVersion
};