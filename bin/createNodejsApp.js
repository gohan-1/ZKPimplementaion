#!/usr/bin/env node
const util = require('util');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const exec = util.promisify(require('child_process').exec);
async function runCmd(command) {
  try {
    const { stdout, stderr } = await exec(command);
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
  } catch (error) {
    console.log(error);
  }
}

async function hasYarn() {
  try {
    execSync('yarnpkg --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Validate args
if (process.argv.length < 3) {
  console.log('Please specify the target project directory.');
  process.exit(1);
}

const ownPath = process.cwd();
const folderName = process.argv[2];
const appPath = path.join(ownPath, folderName);


// Check if directory exists but don't delete it
try {
  console.log(`Checking if directory ${appPath} exists...`);

  if (fs.existsSync(appPath)) {
    console.log(`Directory ${folderName} already exists. Will preserve existing files and only create missing ones.`);
  } else {
    fs.mkdirSync(appPath);
    console.log(`Created directory: ${appPath}`);
  }
} catch (err) {
  console.log('Error creating directory:', err);
  process.exit(1);
}



async function setup() {
  try {
    // console.log(`Cloning repo ${repo}...`);
    // await runCmd(`git clone --depth 1 ${repo} ${folderName}`);

    process.chdir(appPath);

    // ✅ Create ZKPFiles only if it doesn't exist
    const zkpDir = path.join(appPath, 'ZKPFiles');
    if (!fs.existsSync(zkpDir)) {
      fs.mkdirSync(zkpDir, { recursive: true });
      console.log('Created ZKPFiles directory');
    } else {
      console.log('ZKPFiles directory already exists, preserving...');
    }

    // ✅ Create tau_files only if it doesn't exist
    const tauDir = path.join(appPath, 'tau_files');
    if (!fs.existsSync(tauDir)) {
      fs.mkdirSync(tauDir, { recursive: true });
      console.log('Created TAU Files directory');
    } else {
      console.log('TAU Files directory already exists, preserving...');
    }

    const VerDir = path.join(appPath, 'VerifierData');
    if (!fs.existsSync(VerDir)) {
      fs.mkdirSync(VerDir, { recursive: true });
      console.log('Created verifer Data Files directory');
    } else {
      console.log('verifer Data Files directory already exists, preserving...');
    }

    // Run circom compilation - check if files already exist to avoid recompilation
    console.log('Checking circom compilation status...');
    const r1csFile = path.join(zkpDir, 'zkpCircuit.r1cs');
    const wasmFile = path.join(zkpDir, 'zkpCircuit_js', 'zkpCircuit.wasm');

    if (fs.existsSync(r1csFile) && fs.existsSync(wasmFile)) {
      console.log('Circom compilation files already exist, skipping compilation...');
    } else {
      console.log('Running circom compilation...');
      const circomCommand = 'circom ../circuits/zkpCircuit.circom --r1cs --wasm --sym -o ./ZKPFiles -l ../node_modules';
      try {
        await runCmd(circomCommand);
        console.log('Circom compilation completed successfully!');
      } catch (error) {
        console.log('Circom compilation failed:', error);
        console.log('Make sure circom is installed and the zkpCircuit.circom file exists');
      }
    }

    console.log('Before change:', process.cwd());

    const srcPath = path.join(appPath, '../');
    process.chdir(srcPath);

    console.log('After change:', process.cwd());




    const useYarn = await hasYarn();
    console.log('Installing dependencies...');
    if (useYarn) {
      await runCmd('yarn install');
    } else {
      await runCmd('npm install');
    }

    fs.copyFileSync(path.join(srcPath, '.env.example'), path.join(srcPath, '.env'));

    // Clean up unnecessary files
    // await runCmd('npx rimraf ./.git');
    const gitPath = path.join(appPath, '.git');
    if (fs.existsSync(gitPath)) {
      console.log('Git repository exists, you could run git commands here');
    } else {
      console.log('No .git folder, skipping git commands');
    }

    const filesToRemove = ['CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md',];
    filesToRemove.forEach(f => fs.existsSync(path.join(srcPath, f)) && fs.unlinkSync(path.join(srcPath, f)));
    if (!useYarn && fs.existsSync(path.join(srcPath, 'yarn.lock'))) fs.unlinkSync(path.join(srcPath, 'yarn.lock'));
    // if (fs.existsSync(path.join(srcPath, 'bin'))) fs.rmdirSync(path.join(srcPath, 'bin'));

    console.log('Project setup complete!');

    const isRunningUnderNodemon = process.env.NODEMON === 'true' ||
      process.argv.some(arg => arg.includes('nodemon'));

    // Then in the server start section:
    // --- Start server depending on NODE_ENV ---
    if (!isRunningUnderNodemon) {
      const env = process.env.NODE_ENV || 'development';
      console.log(`Starting server in ${env} mode...`);

      let command, args;
      if (env === 'development') {
        command = useYarn ? 'yarn' : 'npm';
        args = useYarn ? ['devs'] : ['run', 'devs'];
      } else {
        command = useYarn ? 'yarn' : 'npm';
        args = useYarn ? ['start'] : ['run', 'start'];
      }


      const serverProcess = spawn(command, args, { stdio: 'inherit', env: process.env });

      serverProcess.on('close', (code) => {
        console.log(`Server process exited with code ${code}`);
      });
    }

  } catch (error) {
    console.log(error);
  }
}

setup();