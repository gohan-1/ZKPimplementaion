// utils/validation.util.js

/**
 * Validate user ID
 * @param {number} userID - User ID to validate
 * @returns {boolean}
 */
function isValidUserID(userID) {
    return Number.isInteger(userID) && userID >= 0 && userID <= Number.MAX_SAFE_INTEGER;
}

/**
 * Validate operator
 * @param {number} operator - Operator to validate
 * @returns {boolean}
 */
function isValidOperator(operator) {
    return [0, 1, 2].includes(operator);
}

/**
 * Validate claim value
 * @param {number} value - Value to validate
 * @returns {boolean}
 */
function isValidClaimValue(value) {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Validate batch ID
 * @param {number} batchId - Batch ID to validate
 * @returns {boolean}
 */
function isValidBatchId(batchId) {
    return Number.isInteger(batchId) && batchId >= 0;
}

/**
 * Validate page params
 * @param {number} page - Page number
 * @param {number} limit - Limit per page
 * @returns {Object}
 */
function validatePagination(page, limit) {
    const validPage = Math.max(1, parseInt(page) || 1);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));
    return { page: validPage, limit: validLimit };
}

module.exports = {
    isValidUserID,
    isValidOperator,
    isValidClaimValue,
    isValidBatchId,
    validatePagination,
}; 