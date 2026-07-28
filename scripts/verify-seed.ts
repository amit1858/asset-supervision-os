/* Quick determinism / story sanity check. Run with: npm run seed:verify */
import { buildDataset } from "../src/data/generate";
import { analyzeK201 } from "../src/data/k201-analysis";
import { computeRots } from "../src/engines/rots";

const a = buildDataset();
const b = buildDataset();
console.log("deterministic:", JSON.stringify(a) === JSON.stringify(b));

const an = analyzeK201(a);
console.log("K-201 latest vibration mm/s:", an.latest.vibration);
console.log("K-201 latest bearing DE °C:", an.latest.bearingTempDe);
console.log("risk score:", an.risk.riskScore, "health:", an.risk.healthScore);
console.log("confidence:", an.risk.confidence.toFixed(3));
console.log("projected days to critical:", an.risk.projectedDaysToCritical);
console.log("disposition:", an.risk.recommendedDisposition, "severity:", an.risk.severity);
console.log(
  "recent OEE:",
  (an.recentOee.oee * 100).toFixed(1) + "%",
  "A", (an.recentOee.availability * 100).toFixed(1),
  "P", (an.recentOee.performance * 100).toFixed(1),
  "Q", (an.recentOee.quality * 100).toFixed(1),
);
console.log("total exposure USD:", Math.round(an.totalExposureUsd).toLocaleString("en-US"));

const rots = computeRots({
  interactions: a.aiInteractions,
  recommendations: a.recommendations,
  decisions: a.humanDecisions,
  outcomes: a.operationalOutcomes,
});
console.log("ROTS actualProvider:", rots.actualProvider, "actualCostUsd:", rots.actualCostUsd, "acceptanceRate:", rots.acceptanceRate);
console.log("estimatedInferenceCostUsd:", rots.estimatedInferenceCostUsd, "scenarios:", rots.estimatedScenarios.map((s) => `${s.provider}:${s.costUsd}`).join(", "));
console.log("valueAtStake:", rots.valueAtStakeUsd, "projectedEnabled:", rots.projectedValueEnabledUsd, "realised:", rots.realisedValueUsd, "realisedAvailable:", rots.realisedAvailable);
console.log("counts:", {
  assets: a.assets.length,
  readings: a.sensorReadings.length,
  runs: a.productionRuns.length,
  recs: a.recommendations.length,
  interactions: a.aiInteractions.length,
});
