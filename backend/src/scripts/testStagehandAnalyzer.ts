#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LinkedInProfileStagehandAnalyzer } from "../linkedin/stagehand/LinkedInProfileStagehandAnalyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log("🔍 Testing Stagehand Analyzer Integration\n");

  // Read profile HTML from command line arg or use debug file
  const args = process.argv.slice(2);
  const htmlPath = args[0]
    ? resolve(process.cwd(), args[0])
    : resolve(__dirname, "../../../debug-profile.html");
  console.log(`📄 Reading HTML from: ${htmlPath}`);

  let html: string;
  try {
    html = await readFile(htmlPath, "utf-8");
    console.log(`✓ Loaded HTML (${html.length} characters)\n`);
  } catch (error) {
    console.error("❌ Failed to read debug HTML file:", error);
    process.exit(1);
  }

  // Initialize analyzer
  const analyzer = new LinkedInProfileStagehandAnalyzer();
  console.log("✓ Analyzer initialized\n");

  // Analyze the HTML
  console.log("🔬 Analyzing profile...\n");
  const analysis = analyzer.analyzeHtml(html);

  // Display results
  console.log("=".repeat(60));
  console.log("📊 EXTRACTION RESULTS");
  console.log("=".repeat(60));

  // Main profile fields
  console.log("\n🧑 Profile Fields:");
  analysis.fields.forEach((field) => {
    const confidenceBar = "█".repeat(Math.round(field.confidence * 10));
    const status = field.value ? "✓" : "✗";
    console.log(`  ${status} ${field.field.padEnd(20)} = ${field.value || "<missing>"}`);
    console.log(`    Confidence: ${confidenceBar} ${(field.confidence * 100).toFixed(0)}%`);
    console.log(`    Selector: ${field.matchedSelector || "<no match>"}`);
    if (field.tier) {
      console.log(`    Tier: ${field.tier} (index ${field.tierIndex})`);
    }
    console.log();
  });

  // Experience summary
  console.log(`\n💼 Experiences: ${analysis.experiences.length} found`);
  if (analysis.experiences.length > 0) {
    console.log("\nFirst 3 experiences:");
    analysis.experiences.slice(0, 3).forEach((exp, idx) => {
      const currentBadge = exp.isCurrent ? " [CURRENT]" : "";
      console.log(`\n  ${idx + 1}.${currentBadge}`);
      console.log(`    Title: ${exp.fields.title.value || "<missing>"}`);
      console.log(`    Company: ${exp.fields.company.value || "<missing>"}`);
      console.log(`    Company URL: ${exp.fields.companyUrl.value || "<missing>"}`);
      console.log(`    Date Range: ${exp.fields.dateRange.value || "<missing>"}`);
      console.log(`    Location: ${exp.fields.location.value || "<missing>"}`);
    });

    if (analysis.currentExperienceIndex !== undefined) {
      console.log(`\n  ⭐ Current position index: ${analysis.currentExperienceIndex}`);
    }
  }

  // Warnings
  console.log("\n⚠️  Warnings:");
  if (analysis.metadata.warnings.length === 0) {
    console.log("  None - all fields extracted successfully!");
  } else {
    analysis.metadata.warnings.forEach((warning) => {
      console.log(`  • ${warning}`);
    });
  }

  // Metadata
  console.log("\n📋 Metadata:");
  console.log(`  HTML Length: ${analysis.metadata.htmlLength.toLocaleString()} bytes`);
  console.log(`  Generated At: ${analysis.metadata.generatedAt}`);
  console.log(`  Document Title: ${analysis.documentTitle || "<none>"}`);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ SUMMARY");
  console.log("=".repeat(60));

  const extractedFields = analysis.fields.filter((f) => f.value).length;
  const totalFields = analysis.fields.length;
  const successRate = ((extractedFields / totalFields) * 100).toFixed(1);

  console.log(`  Fields Extracted: ${extractedFields}/${totalFields} (${successRate}%)`);
  console.log(`  Experiences Found: ${analysis.experiences.length}`);
  console.log(`  Warnings: ${analysis.metadata.warnings.length}`);

  const hasName = analysis.fields.find((f) => f.field === "fullName")?.value;
  const hasCompany = analysis.fields.find((f) => f.field === "currentCompany")?.value;
  const hasTitle = analysis.fields.find((f) => f.field === "currentTitle")?.value;

  console.log("\n  Critical Fields:");
  console.log(`    Name: ${hasName ? "✓" : "✗"}`);
  console.log(`    Current Company: ${hasCompany ? "✓" : "✗"}`);
  console.log(`    Current Title: ${hasTitle ? "✓" : "✗"}`);

  if (hasName && hasCompany && hasTitle) {
    console.log("\n🎉 SUCCESS! All critical fields extracted.");
  } else {
    console.log("\n⚠️  WARNING: Some critical fields are missing.");
  }

  console.log();
}

main().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
