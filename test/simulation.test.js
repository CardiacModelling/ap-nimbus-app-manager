"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

const REQUEST_PAYLOAD = {
  modelId: 1,
  pacingFrequency: 0.5,
  plasmaPoints: [0, 3, 10, 30, 100]
};

const EXPECTED_VOLTAGE_RESULTS = [
  {
    c: "Concentration(uM)",
    uv: "UpstrokeVelocity(mV/ms)",
    pv: "PeakVm(mV)",
    a50: "APD50(ms)",
    a90: "APD90(ms)",
    da90: ["delta_APD90(%)"]
  },
  {
    c: "0",
    uv: "350.596",
    pv: "47.8243",
    a50: "184.455",
    a90: "216.892",
    da90: ["0"]
  },
  {
    c: "0.001",
    uv: "351.022",
    pv: "47.8407",
    a50: "184.7",
    a90: "217.155",
    da90: ["0.121071"]
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertAlmostEqual(actual, expected, tolerance, label) {
  const actualNumber = Number.parseFloat(actual);
  const expectedNumber = Number.parseFloat(expected);
  assert.ok(Number.isFinite(actualNumber), `${label} actual value is not numeric: ${actual}`);
  assert.ok(Number.isFinite(expectedNumber), `${label} expected value is not numeric: ${expected}`);
  const difference = Math.abs(actualNumber - expectedNumber);
  assert.ok(
    difference <= tolerance,
    `${label} differs by ${difference}, tolerance is ${tolerance}. actual=${actualNumber}, expected=${expectedNumber}`
  );
}

async function requestJson(requestUrl, options, context) {
  const response = await fetch(requestUrl, options);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${context} failed with HTTP ${response.status}: ${raw}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${context} did not return valid JSON: ${raw}`);
  }
}

async function waitForServerReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const payload = await requestJson(`${BASE_URL}/`, { method: "GET" }, "Server readiness check");
      if (payload && (payload.error || payload.success)) {
        return;
      }
    } catch (error) {
      // Ignore until timeout while server starts.
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for app-manager to become ready on port 8080.");
}

async function pollVoltageResults(simulationId, timeoutMs) {
  const start = Date.now();
  let lastPayload;

  while (Date.now() - start < timeoutMs) {
    const payload = await requestJson(
      `${BASE_URL}/api/collection/${simulationId}/voltage_results`,
      { method: "GET" },
      "voltage_results query"
    );
    lastPayload = payload;

    if (payload && Array.isArray(payload.success) && payload.success.length >= EXPECTED_VOLTAGE_RESULTS.length) {
      return payload;
    }

    await sleep(1000);
  }

  throw new Error(
    `Timed out waiting for voltage_results for simulation ${simulationId}. Last payload: ${JSON.stringify(lastPayload)}`
  );
}

test("posts inline request payload and validates voltage_results", { timeout: 120000 }, async () => {

  await waitForServerReady(30000);

  const requestBody = JSON.stringify(REQUEST_PAYLOAD);
  const postPayload = await requestJson(
    `${BASE_URL}/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: requestBody
    },
    "Simulation start"
  );
  assert.ok(postPayload.success, `Expected success object in POST response. Got: ${JSON.stringify(postPayload)}`);
  assert.ok(postPayload.success.id, `Expected simulation id in POST response. Got: ${JSON.stringify(postPayload)}`);

  const simulationId = postPayload.success.id;

  const voltageResultsPayload = await pollVoltageResults(simulationId, 60000);
  const actualVoltageResults = voltageResultsPayload.success;
  assert.ok(Array.isArray(actualVoltageResults), "Expected an array in voltage_results response");

  assert.equal(
    actualVoltageResults.length,
    EXPECTED_VOLTAGE_RESULTS.length,
    "actual and expected voltage_results lengths should match"
  );

  assert.deepStrictEqual(
    actualVoltageResults[0],
    EXPECTED_VOLTAGE_RESULTS[0],
    "voltage_results header row does not match expected values"
  );

  for (let i = 1; i < EXPECTED_VOLTAGE_RESULTS.length; i += 1) {
    const actualRow = actualVoltageResults[i];
    const expectedRow = EXPECTED_VOLTAGE_RESULTS[i];

    assert.equal(actualRow.c, expectedRow.c, `row ${i} c`);
    assertAlmostEqual(actualRow.uv, expectedRow.uv, 5, `row ${i} uv`);
    assertAlmostEqual(actualRow.pv, expectedRow.pv, 1, `row ${i} pv`);
    assertAlmostEqual(actualRow.a50, expectedRow.a50, 5, `row ${i} a50`);
    assertAlmostEqual(actualRow.a90, expectedRow.a90, 5, `row ${i} a90`);

    assert.equal(actualRow.da90.length, expectedRow.da90.length, `row ${i} da90 length should match`);
    for (let j = 0; j < expectedRow.da90.length; j += 1) {
      assertAlmostEqual(actualRow.da90[j], expectedRow.da90[j], 0.5, `row ${i} da90[${j}]`);
    }
  }
});
