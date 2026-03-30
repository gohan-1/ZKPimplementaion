const path = require('path');
const fs = require('fs');
const { runCmd } = require('./utils');

async function handleCircom(appPath) {
    const zkpDir = path.join(appPath, 'ZKPFiles');

    const r1cs = path.join(zkpDir, 'zkpCircuit.r1cs');
    const wasm = path.join(zkpDir, 'zkpCircuit_js', 'zkpCircuit.wasm');

    if (fs.existsSync(r1cs) && fs.existsSync(wasm)) {
        console.log('Skipping circom compilation...');
        return;
    }

    console.log('current')
    console.log(process.cwd())

    const cmd =
        'circom ./circuits/zkpCircuit.circom --r1cs --wasm --sym -o ./Project_v1/ZKPFiles -l ./node_modules';

    try {
        await runCmd(cmd);
        console.log('Circom compilation done');
    } catch (err) {
        console.log('Circom failed:', err);
    }
}

module.exports = { handleCircom };