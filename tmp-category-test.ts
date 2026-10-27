import { CATEGORY_PATTERNS } from "./packages/shared/src/constants";

const tests = [
  "POWER SUPPLY",
  "power supplies",
  "REDUNDANT POWER SUPPLY",
  "DUAL POWER SUPPLY",
  "PROCESSOR",
  "CIRCUIT CARD ASSEMBLY",
  "59--ANTENNA",
  "61--CABLE ASSEMBLY,SPECIAL",
  "59--SOLENOID,ELECTRICAL",
  "25 servers",
];

console.log("Loaded patterns:", CATEGORY_PATTERNS.length);

for (const input of tests) {
  const categories = CATEGORY_PATTERNS
    .filter(({ patterns }) => patterns.test(input))
    .map(({ category }) => category);

  console.log(`${input} => ${categories.length ? categories.join(", ") : "NO MATCH"}`);
}
