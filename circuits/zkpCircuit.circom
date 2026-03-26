pragma circom 2.2.3;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// template IsZero() {
//     signal input in;
//     signal output out;
    
//     signal inv;
//     inv <== in != 0 ? 1/in : 0;
//     out <== 1 - in * inv;
// }

template AND(n) {
    signal input in[n];
    signal output out;
    
    // Calculate sum using linear combination
    signal sum;
    sum <== 0;
    
    // Use a different approach - create a new signal for each addition
    signal sums[n];
    sums[0] <== in[0];
    for (var i = 1; i < n; i++) {
        sums[i] <== sums[i-1] + in[i];
    }
    
    // Check if sum equals n
    component eq = IsEqual();
    eq.in[0] <== sums[n-1];
    eq.in[1] <== n;
    out <== eq.out;
}

template VerifySignature() {
    signal input message;
    signal input pubKeyX;
    signal input pubKeyY;
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;
    signal output isValid;
    
    isValid <== 1;  // Placeholder
}

template MinimalCredentialProof() {
    signal input userID;
    signal input issuerID;
    signal input credentialHash;
    signal input claimValue;
    signal input requiredValue;
    signal input operator;
    
    signal input signatureR8x;
    signal input signatureR8y;
    signal input signatureS;
    signal input issuerPublicKeyX;
    signal input issuerPublicKeyY;
    
    signal output isValid;
    signal output nullifier;
    
    // 1. Signature verification
    component verifier = VerifySignature();
    verifier.message <== credentialHash;
    verifier.pubKeyX <== issuerPublicKeyX;
    verifier.pubKeyY <== issuerPublicKeyY;
    verifier.sigR8x <== signatureR8x;
    verifier.sigR8y <== signatureR8y;
    verifier.sigS <== signatureS;
    
    // 2. Credential binding
    component hashUser = Poseidon(2);
    hashUser.inputs[0] <== userID;
    hashUser.inputs[1] <== issuerID;
    
    component credentialCheck = IsEqual();
    credentialCheck.in[0] <== hashUser.out;
    credentialCheck.in[1] <== credentialHash;
    
    // 3. Comparison results
    component eq = IsEqual();
    eq.in[0] <== claimValue;
    eq.in[1] <== requiredValue;
    
    component gt = GreaterThan(32);
    gt.in[0] <== claimValue;
    gt.in[1] <== requiredValue;
    
    component lt = LessThan(32);
    lt.in[0] <== claimValue;
    lt.in[1] <== requiredValue;
    
    // 4. Select based on operator using arithmetic
    // Check operator values
    component isOp0 = IsEqual();
    isOp0.in[0] <== operator;
    isOp0.in[1] <== 0;
    
    component isOp1 = IsEqual();
    isOp1.in[0] <== operator;
    isOp1.in[1] <== 1;
    
    component isOp2 = IsEqual();
    isOp2.in[0] <== operator;
    isOp2.in[1] <== 2;
    
    // Ensure operator is valid (0, 1, or 2)
    signal opSum <== isOp0.out + isOp1.out + isOp2.out;
    opSum === 1;
    
    // Combine results using linear combination
    // claimValid = (isOp0 * eqResult) + (isOp1 * gtResult) + (isOp2 * ltResult)
    signal claimValid0 <== isOp0.out * eq.out;
    signal claimValid1 <== isOp1.out * gt.out;
    signal claimValid2 <== isOp2.out * lt.out;
    signal claimValid <== claimValid0 + claimValid1 + claimValid2;
    
    // 5. Combine all checks
    component allValid = AND(3);
    allValid.in[0] <== verifier.isValid;
    allValid.in[1] <== credentialCheck.out;
    allValid.in[2] <== claimValid;
    isValid <== allValid.out;
    
    // 6. Nullifier
    component nullifierGen = Poseidon(2);
    nullifierGen.inputs[0] <== userID;
    nullifierGen.inputs[1] <== credentialHash;
    nullifier <== nullifierGen.out;
}

component main = MinimalCredentialProof();