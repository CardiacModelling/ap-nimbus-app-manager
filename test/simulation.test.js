"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

/**
 * Waits for the given number of milliseconds.
 *
 * @param {number} ms Milliseconds to wait before resolving.
 * @returns {Promise<void>} A promise that resolves after the delay.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Asserts that two numeric values are within a given tolerance.
 *
 * @param {string|number} actual The measured value from the API response.
 * @param {string|number} expected The expected reference value.
 * @param {number} tolerance The maximum allowed absolute difference.
 * @param {string} label A label used to identify assertion failures.
 */
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

/**
 * Fetches JSON from the API and throws with context on HTTP or parse failures.
 *
 * @param {string} requestUrl The URL to request.
 * @param {RequestInit} options Fetch options for the request.
 * @param {string} context A short description used in error messages.
 * @returns {Promise<any>} The parsed JSON payload.
 */
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

/**
 * Polls the root endpoint until the app-manager server is ready to accept requests.
 *
 * @param {number} timeoutMs Maximum time to wait before failing.
 * @returns {Promise<void>} Resolves once the service responds with a valid payload.
 */
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

/**
 * Polls a simulation result endpoint until the payload satisfies the readiness check.
 *
 * @param {string} simulationId The simulation identifier returned from the POST request.
 * @param {string} operation The collection operation to query, such as `STDOUT` or `voltage_results`.
 * @param {(payload: any) => boolean} isReady Predicate that determines when the payload is usable.
 * @param {number} timeoutMs Maximum time to wait before failing.
 * @returns {Promise<any>} The first payload that satisfies `isReady`.
 */
async function pollResults(simulationId, operation, isReady, timeoutMs) {
  const start = Date.now();
  let lastPayload;

  while (Date.now() - start < timeoutMs) {
    const payload = await requestJson(
      `${BASE_URL}/api/collection/${simulationId}/${operation}`,
      { method: "GET" },
      `${operation} query`
    );
    lastPayload = payload;

    if (isReady(payload)) {
      return payload;
    }

    await sleep(1000);
  }

  throw new Error(
    `Timed out waiting for ${operation} for simulation ${simulationId}. Last payload: ${JSON.stringify(lastPayload)}`
  );
}

// Test the simulation endpoint by posting a request and validating the output.
test("posts request payload and validates output", { timeout: 120000 }, async () => {

  await waitForServerReady(30000);

  const REQUEST_PAYLOAD = {
    modelId: 1,
    pacingFrequency: 0.5,
    plasmaPoints: [0, 3, 10, 30, 100]
  };

  const EXPECTED_STDOUT = /^ApPredict args : --pacing-freq 0\.5 --plasma-concs 0 3 10 30 100 --model 1$/m;

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

  const voltageResultsPayload = await pollResults(
    simulationId,
    "voltage_results",
    (p) => p && Array.isArray(p.success) && p.success.length >= EXPECTED_VOLTAGE_RESULTS.length,
    60000
  );

  const stdoutPayload = await pollResults(
    simulationId,
    "STDOUT",
    (p) => p && p.success && p.content,
    30000
  );

  assert.ok(
    EXPECTED_STDOUT.test(stdoutPayload.content),
    `Expected ApPredict args string not found in STDOUT. Got: ${stdoutPayload.content}`
  );

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

    assert.equal(actualRow.c, expectedRow.c, `voltage_results ${i} c`);
    assertAlmostEqual(actualRow.uv, expectedRow.uv, 5, `voltage_results ${i} uv`);
    assertAlmostEqual(actualRow.pv, expectedRow.pv, 1, `voltage_results ${i} pv`);
    assertAlmostEqual(actualRow.a50, expectedRow.a50, 5, `voltage_results ${i} a50`);
    assertAlmostEqual(actualRow.a90, expectedRow.a90, 5, `voltage_results ${i} a90`);

    assert.equal(actualRow.da90.length, expectedRow.da90.length, `voltage_results ${i} da90 length should match`);
    for (let j = 0; j < expectedRow.da90.length; j += 1) {
      assertAlmostEqual(actualRow.da90[j], expectedRow.da90[j], 0.2, `voltage_results ${i} da90[${j}]`);
    }
  }
});
