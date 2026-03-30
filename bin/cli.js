#!/usr/bin/env node

const path = require('path');
const { validateArgs, setupBaseDirectory } = require('./lib/setup');
const { setupProject } = require('./lib/setup');
const { handleCircom } = require('./lib/circom');
const { installDependencies } = require('./lib/deps');
const { cleanupFiles } = require('./lib/deps');
const { generateKeysPrompt } = require('./lib/keys');
const { hasYarn, askQuestion } = require('./lib/utils');

const { spawn } = require('child_process');

async function main() {
  validateArgs();

  const folderName = process.argv[2];
  const appPath = path.join(process.cwd(), folderName);

  setupBaseDirectory(appPath, folderName);

  await setupProject(appPath);
  await handleCircom(appPath);

  const srcPath = path.join(appPath, '../');
  process.chdir(srcPath);

  const useYarn = hasYarn();
  await installDependencies(srcPath, useYarn);

  console.log('\n' + '='.repeat(50));
  const generateNow = await askQuestion(
    'Do you want to generate signing keys? (y/n): '
  );

  if (generateNow.toLowerCase() === 'y') {
    await generateKeysPrompt(appPath);
  }

  cleanupFiles(srcPath, useYarn);
  console.log('✅ Project setup complete!');

  // <-- START SERVER HERE
  startServer(useYarn);

  console.log('✅ Project setup complete!');
}

function startServer(useYarn) {
  const isNodemon =
    process.env.NODEMON === 'true' ||
    process.argv.some(arg => arg.includes('nodemon'));

  if (isNodemon) return;

  const env = process.env.NODE_ENV || 'development';
  console.log(`Starting server in ${env} mode...`);

  let command = useYarn ? 'yarn' : 'npm';
  let args =
    env === 'development'
      ? useYarn ? ['devs'] : ['run', 'devs']
      : useYarn ? ['start'] : ['run', 'start'];

  const server = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  server.on('close', code => {
    console.log(`Server exited with code ${code}`);
  });
}

main();