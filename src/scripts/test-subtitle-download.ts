/**
 * Test script for subtitle download functionality
 * Run with: bun run src/scripts/test-subtitle-download.ts
 */

import {
  convertToSRT,
  convertToVTT,
  convertToText,
  convertToJSON,
} from "../utils/subtitle-converter";

// Sample caption words
const sampleWords = [
  { word: "Hello", start: 0.0, end: 0.5 },
  { word: "world", start: 0.5, end: 1.0 },
  { word: "this", start: 1.2, end: 1.5 },
  { word: "is", start: 1.5, end: 1.7 },
  { word: "a", start: 1.7, end: 1.8 },
  { word: "test", start: 1.8, end: 2.2 },
  { word: "of", start: 2.2, end: 2.4 },
  { word: "the", start: 2.4, end: 2.6 },
  { word: "subtitle", start: 2.6, end: 3.2 },
  { word: "converter", start: 3.2, end: 3.8 },
  { word: "functionality", start: 3.8, end: 4.5 },
];

console.log("=== Testing Subtitle Converter ===\n");

console.log("--- SRT Format ---");
const srtOutput = convertToSRT(sampleWords);
console.log(srtOutput);
console.log("\n");

console.log("--- VTT Format ---");
const vttOutput = convertToVTT(sampleWords);
console.log(vttOutput);
console.log("\n");

console.log("--- Text Format ---");
const textOutput = convertToText(sampleWords);
console.log(textOutput);
console.log("\n");

console.log("--- JSON Format ---");
const jsonOutput = convertToJSON(sampleWords);
console.log(jsonOutput);
console.log("\n");

console.log("✅ All conversions completed successfully!");
