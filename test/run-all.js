#!/usr/bin/env node
// Master Test Runner - Runs all test batches

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const batches = [
  'batch1.test.js',
  'batch2.test.js',
  'batch3.test.js',
  'batch4.test.js',
  'batch5.test.js',
  'batch6.test.js',
  'batch7.test.js',
  'batch8.test.js'
];

async function runTest(testFile) {
  return new Promise((resolve) => {
    const testPath = join(__dirname, testFile);
    const proc = spawn('node', ['--experimental-vm-modules', testPath], {
      stdio: 'pipe'
    });
    
    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { output += data.toString(); });
    
    proc.on('close', (code) => {
      // Extract results line
      const match = output.match(/Results: (\d+) passed, (\d+) failed/);
      const passed = match ? parseInt(match[1]) : 0;
      const failed = match ? parseInt(match[2]) : 0;
      
      resolve({ testFile, code, passed, failed, output });
    });
  });
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       SOVEREIGN BUSINESS OS - FULL TEST SUITE              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  let totalPassed = 0;
  let totalFailed = 0;
  const results = [];
  
  for (const batch of batches) {
    const result = await runTest(batch);
    results.push(result);
    totalPassed += result.passed;
    totalFailed += result.failed;
    
    const status = result.failed === 0 ? '✅' : '❌';
    const batchName = batch.replace('.test.js', '').toUpperCase();
    console.log(`${status} ${batchName}: ${result.passed} passed, ${result.failed} failed`);
  }
  
  console.log('');
  console.log('─'.repeat(60));
  console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('─'.repeat(60));
  
  if (totalFailed === 0) {
    console.log('');
    console.log('🎉 ALL TESTS PASSED! 🎉');
    console.log('');
    console.log('Production-ready code delivered.');
  } else {
    console.log('');
    console.log('⚠️  Some tests failed. Review output above.');
    
    // Show failed tests
    for (const result of results) {
      if (result.failed > 0) {
        console.log('');
        console.log(`Failed in ${result.testFile}:`);
        const lines = result.output.split('\n');
        for (const line of lines) {
          if (line.includes('❌')) {
            console.log(`  ${line}`);
          }
        }
      }
    }
  }
  
  return totalFailed === 0;
}

runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
