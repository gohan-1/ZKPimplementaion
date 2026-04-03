// validations/credential.validation.js
const Joi = require('joi');
const { OPERATORS } = require('../utils/constants');

const createCredential = {
    body: Joi.object().keys({
        userID: Joi.number().integer().positive().required(),
        issuerID: Joi.number().integer().positive().required(),
        claimValue: Joi.number().required(),
        requiredValue: Joi.number().required(),
        operator: Joi.number().valid(...Object.values(OPERATORS)).required(),
        expiresAt: Joi.date().greater('now').optional(),
        metadata: Joi.object().optional(),
    }),
};

const getCredentialWithProof = {
    params: Joi.object().keys({
        userID: Joi.number().integer().positive().required(),
        issuerID: Joi.number().integer().positive().required(),
    }),
};

const revokeCredential = {
    params: Joi.object().keys({
        id: Joi.string().required(),
    }),
    body: Joi.object().keys({
        reason: Joi.string().max(500).required(),
    }),
};

const getUserCredentials = {
    params: Joi.object().keys({
        userID: Joi.number().integer().positive().required(),
    }),
    query: Joi.object().keys({
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(100).optional(),
        includeRevoked: Joi.boolean().optional(),
    }),
};

const verifyProof = {
    body: Joi.object().keys({
        leaf: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
        proof: Joi.array().items(Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/)).required(),
    }),
};

module.exports = {
    createCredential,
    getCredentialWithProof,
    revokeCredential,
    getUserCredentials,
    verifyProof,
};