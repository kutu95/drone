#!/usr/bin/env tsx
/**
 * Auto-fix common TypeScript build errors
 * This script attempts to automatically fix common patterns
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface BuildError {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
}

function parseBuildErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = output.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match: ./src/path/to/file.tsx:123:45
    const fileMatch = line.match(/^\.\/(src\/[^:]+):(\d+):(\d+)/);
    if (fileMatch) {
      const [, file, lineNum, colNum] = fileMatch;
      const nextLine = lines[i + 1] || '';
      const errorMatch = nextLine.match(/Type error: (.+)/);
      
      if (errorMatch) {
        errors.push({
          file,
          line: parseInt(lineNum),
          column: parseInt(colNum),
          message: errorMatch[1],
        });
      }
    }
  }
  
  return errors;
}

function fixError(error: BuildError): boolean {
  const filePath = join(process.cwd(), error.file);
  
  try {
    let content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const targetLine = lines[error.line - 1];
    
    if (!targetLine) return false;
    
    let fixed = false;
    let newContent = content;
    
    // Fix: "possibly 'undefined'" errors
    if (error.message.includes("possibly 'undefined'") || error.message.includes("possibly undefined")) {
      // Find the property access pattern
      const propertyMatch = targetLine.match(/(\w+)\.(\w+)(\s|\)|;|,|$)/);
      if (propertyMatch) {
        const [, obj, prop] = propertyMatch;
        // Replace obj.prop with obj?.prop or obj.prop || defaultValue
        const newLine = targetLine.replace(
          new RegExp(`\\b${obj}\\.${prop}\\b`),
          `${obj}?.${prop}`
        );
        if (newLine !== targetLine) {
          lines[error.line - 1] = newLine;
          newContent = lines.join('\n');
          fixed = true;
        }
      }
    }
    
    // Fix: "is not assignable" errors with unknown types
    if (error.message.includes("Type 'unknown' is not assignable")) {
      // Add type guard
      const conditionalMatch = targetLine.match(/(\w+)\s*&&\s*\(/);
      if (conditionalMatch) {
        const [, varName] = conditionalMatch;
        const newLine = targetLine.replace(
          new RegExp(`\\b${varName}\\s*&&`),
          `typeof ${varName} !== 'undefined' && ${varName} &&`
        );
        if (newLine !== targetLine) {
          lines[error.line - 1] = newLine;
          newContent = lines.join('\n');
          fixed = true;
        }
      }
    }
    
    // Fix: Set spread operator errors
    if (error.message.includes("can only be iterated through when using")) {
      // Replace [...set1, ...set2] with forEach pattern
      const spreadMatch = targetLine.match(/new Set\(\[\.\.\.(\w+),\s*\.\.\.(\w+)\]\)/);
      if (spreadMatch) {
        const [, set1, set2] = spreadMatch;
        const indent = targetLine.match(/^(\s*)/)?.[1] || '';
        const newLines = [
          targetLine.replace(/new Set\(\[\.\.\.\w+,\s*\.\.\.\w+\]\)/, `(() => {
${indent}  const newSet = new Set(${set1});
${indent}  ${set2}.forEach(item => newSet.add(item));
${indent}  return newSet;
${indent}})()`)
        ];
        lines.splice(error.line - 1, 1, ...newLines);
        newContent = lines.join('\n');
        fixed = true;
      }
    }
    
    if (fixed) {
      writeFileSync(filePath, newContent, 'utf-8');
      console.log(`✅ Fixed: ${error.file}:${error.line}`);
      return true;
    }
  } catch (err) {
    console.error(`❌ Error fixing ${error.file}:`, err);
  }
  
  return false;
}

function main() {
  console.log('🔄 Pulling latest changes...');
  try {
    execSync('git pull origin main', { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to pull:', err);
    process.exit(1);
  }
  
  console.log('\n🔨 Building...');
  let buildOutput: string;
  let buildSuccess = false;
  
  try {
    buildOutput = execSync('npm run build', { 
      encoding: 'utf-8',
      stdio: 'pipe'
    } as any).toString();
    buildSuccess = true;
  } catch (err: any) {
    buildOutput = err.stdout?.toString() || err.stderr?.toString() || err.message;
  }
  
  if (buildSuccess) {
    console.log('✅ Build successful!');
    return;
  }
  
  console.log('\n❌ Build failed. Analyzing errors...\n');
  const errors = parseBuildErrors(buildOutput);
  
  if (errors.length === 0) {
    console.log('Could not parse errors. Full output:');
    console.log(buildOutput);
    return;
  }
  
  console.log(`Found ${errors.length} error(s):\n`);
  errors.forEach((err, i) => {
    console.log(`${i + 1}. ${err.file}:${err.line}:${err.column}`);
    console.log(`   ${err.message}\n`);
  });
  
  console.log('\n🔧 Attempting automatic fixes...\n');
  let fixedCount = 0;
  
  for (const error of errors) {
    if (fixError(error)) {
      fixedCount++;
    }
  }
  
  if (fixedCount > 0) {
    console.log(`\n✅ Fixed ${fixedCount} error(s). Rebuilding...\n`);
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('\n✅ Build successful after fixes!');
    } catch (err) {
      console.log('\n⚠️  Still has errors. Please share the output for manual fixing.');
    }
  } else {
    console.log('\n⚠️  Could not automatically fix errors. Please share the errors above for manual fixing.');
  }
}

main();
