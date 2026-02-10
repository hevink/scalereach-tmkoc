import { getAllModels, getModelInfo } from "./src/services/gemini.service";

console.log("Gemini Models Information");
console.log("=========================\n");

const models = getAllModels();

models.forEach((info) => {
  console.log(`Model: ${info.model}`);
  console.log(`  Max Output Tokens: ${info.maxOutputTokens.toLocaleString()}`);
  console.log(`  Context Window: ${info.contextWindow.toLocaleString()} tokens`);
  console.log(`  Input Capacity: ~${(info.contextWindow - info.maxOutputTokens).toLocaleString()} tokens`);
  console.log();
});

console.log("Usage Examples:");
console.log("===============\n");

console.log("1. Default (uses model's max tokens):");
console.log(`   await geminiService.generateText(prompt, { model: "gemini-2.5-flash-lite" })`);
console.log(`   → Will use 8,192 max output tokens\n`);

console.log("2. Custom token limit:");
console.log(`   await geminiService.generateText(prompt, { model: "gemini-2.5-pro", maxTokens: 4096 })`);
console.log(`   → Will use 4,096 max output tokens\n`);

console.log("3. For viral detection (uses model's max):");
console.log(`   await ViralDetectionService.detectViralClips(transcript, words, {`);
console.log(`     model: "gemini-2.5-pro"  // Uses 8,192 max tokens automatically`);
console.log(`   })\n`);
