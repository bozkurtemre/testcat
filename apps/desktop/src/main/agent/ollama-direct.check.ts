// Durable Ollama Direct check. Run: pnpm --filter @testcat/desktop exec tsx src/main/agent/ollama-direct.check.ts
import assert from "node:assert/strict";
import {
  buildSimulatorRefTapArgs,
  buildSimulatorTypeFocusTapArgs,
  buildDirectFollowUpPrompt,
  buildInitialDevicePrompt,
  circlingVerdict,
  compactDirectMessages,
  completeGateVerdict,
  normalizeDirectActionArgs,
  normalizeUiTargetedActionArgs,
  parseDescribeRootSize,
  parseDirectPlannerDecision,
  parseOllamaAction,
  parseOllamaPlannerDecision,
  repeatedDirectActionKey,
  validateTestcatSimArgs,
} from "./ollama-direct";

assert.deepStrictEqual(
  parseOllamaAction(
    JSON.stringify({
      action: "run_testcat_sim",
      args: ["describe-ui", "--udid", "U"],
      note: "inspect current screen",
    }),
  ),
  {
    action: "run_testcat_sim",
    args: ["describe-ui", "--udid", "U"],
    note: "inspect current screen",
  },
);

assert.deepStrictEqual(
  parseOllamaAction(
    JSON.stringify({
      action: "tap",
      args: [
        "--udid",
        "U",
        "--x",
        "228",
        "--y",
        "618",
        "--width",
        "440",
        "--height",
        "956",
      ],
      note: "Tap Allow.",
    }),
  ),
  {
    action: "run_testcat_sim",
    args: [
      "tap",
      "--udid",
      "U",
      "--x",
      "228",
      "--y",
      "618",
      "--width",
      "440",
      "--height",
      "956",
    ],
    note: "Tap Allow.",
  },
);

assert.deepStrictEqual(
  parseOllamaAction(
    '{"action":"run_testcat_sim","args":["describe-ui","--udid","U","--note":"Inspect after tap."]}',
  ),
  {
    action: "run_testcat_sim",
    args: ["describe-ui", "--udid", "U"],
    note: "Inspect after tap.",
  },
);

assert.deepStrictEqual(
  parseOllamaAction(
    '{"action":"run_testcat_sim","args":["type","--udid","U","--text","John Doe","note":"Enter the cardholder name."]}',
  ),
  {
    action: "run_testcat_sim",
    args: ["type", "--udid", "U", "--text", "John Doe"],
    note: "Enter the cardholder name.",
  },
);

assert.deepStrictEqual(
  parseOllamaAction(
    '{"action":"run_testcat_sim","args":["describe-ui","--udid","U","note":"Describe UI after entering verification code"}',
  ),
  {
    action: "run_testcat_sim",
    args: ["describe-ui", "--udid", "U"],
    note: "Describe UI after entering verification code",
  },
);

assert.deepStrictEqual(
  parseOllamaAction(
    JSON.stringify({
      action: "run_testcat_sim",
      args: [
        "type",
        "--udid",
        "U",
        "--text",
        "111111",
        "--x",
        "200",
        "--y",
        "806",
        "--width",
        "440",
        "--height",
        "956",
      ],
      note: "Type verification code.",
    }),
  ),
  {
    action: "run_testcat_sim",
    args: ["type", "--udid", "U", "--text", "111111"],
    note: "Type verification code.",
  },
);

assert.deepStrictEqual(
  parseOllamaAction(
    '{"action":"run_testcat_sim","args":["tap","--udid","U","--x","208","--y","632","--width","288","--height","48"],"note":"Tap allow."]}',
  ),
  {
    action: "run_testcat_sim",
    args: [
      "tap",
      "--udid",
      "U",
      "--x",
      "208",
      "--y",
      "632",
      "--width",
      "288",
      "--height",
      "48",
    ],
    note: "Tap allow.",
  },
);

const missingGestureSizeAction = parseOllamaAction(
  '{"action":"run_testcat_sim","args":["tap","--udid","U","--x","278","--y","562.6666666666667"],"note":"Tap Ask App Not to Track"}',
);
assert.equal(missingGestureSizeAction.action, "run_testcat_sim");
if (missingGestureSizeAction.action === "run_testcat_sim") {
  assert.deepStrictEqual(
    normalizeDirectActionArgs(missingGestureSizeAction.args, "REAL-UDID", {
      width: 438,
      height: 954,
    }),
    [
      "tap",
      "--udid",
      "REAL-UDID",
      "--x",
      "278",
      "--y",
      "562.6666666666667",
      "--width",
      "438",
      "--height",
      "954",
    ],
  );
}

const missingUdidObservationAction = parseOllamaAction(
  '{"action":"run_testcat_sim","args":["describe-ui"]}',
);
assert.equal(missingUdidObservationAction.action, "run_testcat_sim");
if (missingUdidObservationAction.action === "run_testcat_sim") {
  assert.deepStrictEqual(
    normalizeDirectActionArgs(missingUdidObservationAction.args, "REAL-UDID", {
      width: 438,
      height: 954,
    }),
    ["describe-ui", "--udid", "REAL-UDID"],
  );
}

assert.deepStrictEqual(
  parseOllamaAction(
    JSON.stringify({
      action: "complete",
      status: "passed",
      summary: "Verified dashboard.",
    }),
  ),
  {
    action: "complete",
    status: "passed",
    summary: "Verified dashboard.",
  },
);

assert.throws(
  () => parseOllamaAction('{"action":"shell","cmd":"rm -rf /"}'),
  /unsupported action/,
);
assert.throws(
  () => validateTestcatSimArgs(["list", ";", "rm", "-rf", "/"]),
  /shell syntax/,
);
assert.throws(
  () => validateTestcatSimArgs(["xcrun", "simctl", "list"]),
  /not allowed/,
);
assert.deepStrictEqual(
  validateTestcatSimArgs(["chrome", "layout", "--udid", "U"]),
  ["chrome", "layout", "--udid", "U"],
);
assert.deepStrictEqual(validateTestcatSimArgs(["prepare", "--udid", "U"]), [
  "prepare",
  "--udid",
  "U",
]);
assert.deepStrictEqual(
  validateTestcatSimArgs(["launch", "--udid", "U", "--bundle-id", "io.testcat"]),
  ["launch", "--udid", "U", "--bundle-id", "io.testcat"],
);
assert.deepStrictEqual(
  validateTestcatSimArgs(["click", "--udid", "U", "--ref", "@e1"]),
  ["click", "--udid", "U", "--ref", "@e1"],
);
assert.deepStrictEqual(
  validateTestcatSimArgs([
    "fill",
    "--udid",
    "U",
    "--ref",
    "@e2",
    "--text",
    "user@example.com",
  ]),
  ["fill", "--udid", "U", "--ref", "@e2", "--text", "user@example.com"],
);
assert.throws(
  () => validateTestcatSimArgs(["describe-ui", "--udid", "U", "--width", "400"]),
  /describe-ui does not accept --width/,
);
assert.throws(
  () => validateTestcatSimArgs(["describe-ui", "--udid", "U", "--note", "inspect"]),
  /describe-ui does not accept --note/,
);
assert.deepStrictEqual(
  validateTestcatSimArgs(["describe-ui", "--udid", "U", "--x", "120", "--y", "340"]),
  ["describe-ui", "--udid", "U", "--x", "120", "--y", "340"],
);
assert.throws(
  () => validateTestcatSimArgs(["screenshot", "--udid", "U"]),
  /--output/,
);
assert.throws(
  () => validateTestcatSimArgs(["tap", "--udid", "U", "checkboxButton"]),
  /--x/,
);
assert.deepStrictEqual(
  validateTestcatSimArgs(["type", "--udid", "U", "--text", "A > B | C"]),
  ["type", "--udid", "U", "--text", "A > B | C"],
);
assert.throws(
  () =>
    validateTestcatSimArgs([
      "type",
      "--udid",
      "U",
      "--text",
      "test-id-sim-1@teknasyon.com",
      "--x",
      "220",
      "--y",
      "400",
      "--width",
      "440",
      "--height",
      "956",
    ]),
  /type does not accept --x/,
);
assert.deepStrictEqual(
  validateTestcatSimArgs(
    ["complete", "--status", "failed", "--summary", "Device 1 failed | Device 2 failed"],
    { allowComplete: true },
  ),
  ["complete", "--status", "failed", "--summary", "Device 1 failed | Device 2 failed"],
);
assert.throws(
  () =>
    validateTestcatSimArgs([
      "tap",
      "--udid",
      "U",
      "--x",
      "120|rm",
      "--y",
      "340",
      "--width",
      "393",
      "--height",
      "852",
    ]),
  /shell syntax/,
);
assert.deepStrictEqual(
  validateTestcatSimArgs([
    "tap",
    "--udid",
    "U",
    "--x",
    "120",
    "--y",
    "340",
    "--width",
    "393",
    "--height",
    "852",
  ]),
  [
    "tap",
    "--udid",
    "U",
    "--x",
    "120",
    "--y",
    "340",
    "--width",
    "393",
    "--height",
    "852",
  ],
);
assert.equal(
  repeatedDirectActionKey([
    "tap",
    "--udid",
    "U",
    "--x",
    "120",
    "--y",
    "340",
    "--width",
    "393",
    "--height",
    "852",
  ]),
  '["tap","--udid","U","--x","120","--y","340","--width","393","--height","852"]',
);
assert.equal(repeatedDirectActionKey(["describe-ui", "--udid", "U"]), null);
assert.deepStrictEqual(
  normalizeDirectActionArgs(
    ["describe-ui", "--udid", "run-id-that-is-not-a-device"],
    "REAL-UDID",
    { width: 400, height: 872 },
  ),
  ["describe-ui", "--udid", "REAL-UDID"],
);
assert.deepStrictEqual(
  normalizeDirectActionArgs(
    [
      "tap",
      "--udid",
      "run-id-that-is-not-a-device",
      "--x",
      "193",
      "--y",
      "768",
      "--width",
      "370",
      "--height",
      "56",
    ],
    "REAL-UDID",
    { width: 400, height: 872 },
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "193",
    "--y",
    "768",
    "--width",
    "400",
    "--height",
    "872",
  ],
);

assert.deepStrictEqual(
  parseOllamaPlannerDecision(
    JSON.stringify({
      simulatorCount: 2,
      parallel: true,
      reason: "Scenario asks for two simulators.",
    }),
    8,
  ),
  {
    simulatorCount: 2,
    parallel: true,
    reason: "Scenario asks for two simulators.",
  },
);
assert.equal(
  parseOllamaPlannerDecision('{"simulatorCount":12,"parallel":true,"reason":"many"}', 8)
    .simulatorCount,
  4,
);
assert.equal(
  parseOllamaPlannerDecision('{"simulatorCount":4,"parallel":true,"reason":"many"}', 2)
    .simulatorCount,
  2,
);
assert.equal(
  parseOllamaPlannerDecision('{"simulatorCount":"3","reason":"string count"}', 8)
    .simulatorCount,
  3,
);
assert.equal(
  parseOllamaPlannerDecision('{"simulator_count":2,"reason":"snake case"}', 8)
    .simulatorCount,
  2,
);
assert.throws(
  () => parseOllamaPlannerDecision('{"parallel":true,"reason":"missing count"}'),
  /simulatorCount/,
);
assert.deepStrictEqual(
  parseDirectPlannerDecision(
    JSON.stringify({
      simulatorCount: 2,
      parallel: true,
      reason: "Scenario mentions two users.",
    }),
    8,
  ),
  {
    simulatorCount: 1,
    parallel: false,
    reason:
      "Direct runner uses one simulator because it cannot coordinate shared state across independent device loops yet. Planner requested 2: Scenario mentions two users.",
  },
);

const consentFollowUp = buildDirectFollowUpPrompt(
  "iPhone 17 Pro",
  JSON.stringify({
    children: [
      { identifier: "checkboxButton", label: "checkboxEmptyIcon", role: "AXButton" },
      { identifier: "welcomeContinueButton", label: "Continue", role: "AXButton" },
    ],
  }),
);
assert.match(consentFollowUp, /unchecked checkbox/i);
assert.match(consentFollowUp, /Tap the checkbox\/toggle control itself first/i);
assert.doesNotMatch(
  buildDirectFollowUpPrompt(
    "iPhone 17 Pro",
    JSON.stringify({ children: [{ identifier: "welcomeContinueButton", label: "Continue" }] }),
  ),
  /unchecked checkbox/i,
);
const segmentedFollowUp = buildDirectFollowUpPrompt(
  "iPhone 17 Pro",
  JSON.stringify({
    children: [
      {
        identifier: "sectionSegmentedControl",
        children: [
          {
            role: "AXRadioButton",
            subrole: "AXTabButton",
            label: "Countries",
            value: "0",
            frame: { x: 16, y: 102.33333333333333, width: 136, height: 41 },
          },
          {
            role: "AXRadioButton",
            subrole: "AXTabButton",
            label: "Regions",
            value: "1",
            frame: { x: 152, y: 102.33333333333333, width: 136, height: 41 },
          },
          {
            role: "AXRadioButton",
            subrole: "AXTabButton",
            label: "Global",
            value: "0",
            frame: { x: 288, y: 102.33333333333333, width: 136, height: 41 },
          },
        ],
      },
    ],
  }),
);
assert.match(segmentedFollowUp, /Countries center=\(84,122\.8\)/);
assert.match(segmentedFollowUp, /Regions center=\(220,122\.8\) selected/);
assert.match(segmentedFollowUp, /country-specific purchases such as Italy/i);
assert.match(
  buildDirectFollowUpPrompt(
    "iPhone 17 Pro",
    JSON.stringify({
      children: [
        {
          identifier: "countryLabel",
          label: "Italy",
          frame: { x: 64, y: 185.66666666666666, width: 28.666666666666671, height: 17 },
        },
      ],
    }),
    "Select country Italy and buy a plan.",
  ),
  /Italy center=\(78\.3,194\.2\)/,
);
assert.deepStrictEqual(
  normalizeUiTargetedActionArgs(
    [
      "tap",
      "--udid",
      "REAL-UDID",
      "--x",
      "208",
      "--y",
      "122.8",
      "--width",
      "438",
      "--height",
      "954",
    ],
    JSON.stringify({
      children: [
        {
          identifier: "sectionSegmentedControl",
          children: [
            {
              role: "AXRadioButton",
              subrole: "AXTabButton",
              label: "Countries",
              value: "0",
              frame: { x: 16, y: 102.33333333333333, width: 136, height: 41 },
            },
            {
              role: "AXRadioButton",
              subrole: "AXTabButton",
              label: "Regions",
              value: "1",
              frame: { x: 152, y: 102.33333333333333, width: 136, height: 41 },
            },
          ],
        },
      ],
    }),
    "Tap the Countries segment to select country-specific plans.",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "84",
    "--y",
    "122.8",
    "--width",
    "438",
    "--height",
    "954",
  ],
);
assert.deepStrictEqual(
  normalizeUiTargetedActionArgs(
    [
      "tap",
      "--udid",
      "REAL-UDID",
      "--x",
      "44.7",
      "--y",
      "816",
      "--width",
      "438",
      "--height",
      "954",
    ],
    JSON.stringify({
      children: [
        {
          identifier: "checkboxButton",
          label: "checkboxEmptyIcon",
          role: "AXButton",
          frame: { x: 34.666666666666657, y: 806, width: 20, height: 20 },
        },
        {
          identifier: "welcomeContinueButton",
          label: "Continue",
          role: "AXButton",
          frame: { x: 18.666666666666657, y: 858, width: 402.66666666666674, height: 48 },
        },
      ],
    }),
    "Tap the 'Agree and Continue' button to proceed past onboarding.",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "220",
    "--y",
    "882",
    "--width",
    "438",
    "--height",
    "954",
  ],
);
assert.deepStrictEqual(
  normalizeUiTargetedActionArgs(
    [
      "tap",
      "--udid",
      "REAL-UDID",
      "--x",
      "220",
      "--y",
      "816",
      "--width",
      "438",
      "--height",
      "954",
    ],
    JSON.stringify({
      children: [
        {
          identifier: "checkboxButton",
          label: "selected",
          role: "AXButton",
          frame: { x: 34.666666666666657, y: 806, width: 20, height: 20 },
        },
        {
          identifier: "welcomeContinueButton",
          label: "Continue",
          role: "AXButton",
          frame: { x: 18.666666666666657, y: 858, width: 402.66666666666674, height: 48 },
        },
      ],
    }),
    "Tapping the confirmation button after checking the agreement box.",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "220",
    "--y",
    "882",
    "--width",
    "438",
    "--height",
    "954",
  ],
);
assert.deepStrictEqual(
  normalizeUiTargetedActionArgs(
    [
      "tap",
      "--udid",
      "REAL-UDID",
      "--x",
      "84",
      "--y",
      "122.8",
      "--width",
      "438",
      "--height",
      "954",
    ],
    JSON.stringify({
      children: [
        {
          identifier: "sectionSegmentedControl",
          children: [
            {
              role: "AXRadioButton",
              subrole: "AXTabButton",
              label: "Countries",
              value: "1",
              frame: { x: 16, y: 102.33333333333333, width: 136, height: 41 },
            },
          ],
        },
        {
          identifier: "countryLabel",
          label: "Italy",
          frame: { x: 64, y: 185.66666666666666, width: 28.666666666666671, height: 17 },
        },
      ],
    }),
    "Tap the Countries segment to ensure country selection is active.",
    "Select country Italy and buy a plan.",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "78.3",
    "--y",
    "194.2",
    "--width",
    "438",
    "--height",
    "954",
  ],
);
assert.deepStrictEqual(
  normalizeUiTargetedActionArgs(
    [
      "tap",
      "--udid",
      "REAL-UDID",
      "--x",
      "84",
      "--y",
      "122.8",
      "--width",
      "438",
      "--height",
      "954",
    ],
    JSON.stringify({
      children: [
        {
          identifier: "sectionSegmentedControl",
          children: [
            {
              role: "AXRadioButton",
              subrole: "AXTabButton",
              label: "Countries",
              value: "1",
              frame: { x: 16, y: 102.33333333333333, width: 136, height: 41 },
            },
          ],
        },
        {
          identifier: "countryLabel",
          label: "Italy",
          frame: { x: 64, y: 185.66666666666666, width: 28.666666666666671, height: 17 },
        },
      ],
    }),
    "Tap the Countries segment to ensure country selection is active.",
    "Select the country for the plan to be purchased.",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "78.3",
    "--y",
    "194.2",
    "--width",
    "438",
    "--height",
    "954",
  ],
);
assert.deepStrictEqual(
  normalizeUiTargetedActionArgs(
    [
      "tap",
      "--udid",
      "REAL-UDID",
      "--x",
      "347",
      "--y",
      "806",
      "--width",
      "438",
      "--height",
      "954",
    ],
    JSON.stringify({
      children: [
        {
          identifier: "checkboxButton",
          label: "selected",
          role: "AXButton",
          frame: { x: 34.666666666666657, y: 806, width: 20, height: 20 },
        },
        {
          identifier: "welcomeContinueButton",
          label: "Continue",
          role: "AXButton",
          frame: { x: 18.666666666666657, y: 858, width: 402.66666666666674, height: 48 },
        },
      ],
    }),
    "Tap the checkbox to agree and continue.",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "220",
    "--y",
    "882",
    "--width",
    "438",
    "--height",
    "954",
  ],
);
assert.deepStrictEqual(
  normalizeUiTargetedActionArgs(
    [
      "tap",
      "--udid",
      "REAL-UDID",
      "--x",
      "220",
      "--y",
      "578",
      "--width",
      "438",
      "--height",
      "954",
    ],
    JSON.stringify({
      children: [
        {
          identifier: "startEsimSetupButton",
          label: null,
          role: "AXButton",
          frame: { x: 16, y: 481.66666666666669, width: 408, height: 56 },
        },
      ],
    }),
    "Tap the Start eSIM Setup button to proceed after payment confirmation.",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "220",
    "--y",
    "509.7",
    "--width",
    "438",
    "--height",
    "954",
  ],
);

const paymentFormUi = JSON.stringify({
  children: [
    {
      identifier: "bottomSheetAddCardTitleLabel",
      label: "Enter Your Card Info",
      role: "AXStaticText",
      frame: { x: 16, y: 564, width: 408, height: 22 },
    },
    {
      identifier: "profileTextField",
      label: "Card Number",
      role: "AXTextField",
      focused: false,
      frame: { x: 16, y: 602, width: 408, height: 44 },
    },
    {
      identifier: "profileTextField",
      label: "Cardholder Name",
      role: "AXTextField",
      focused: false,
      frame: { x: 16, y: 654, width: 408, height: 44 },
    },
    {
      identifier: "profileTextField",
      label: "Month",
      role: "AXTextField",
      focused: false,
      frame: { x: 16, y: 706, width: 126, height: 44 },
    },
    {
      identifier: "profileTextField",
      label: "Year",
      role: "AXTextField",
      focused: false,
      frame: { x: 157, y: 706, width: 126, height: 44 },
    },
    {
      identifier: "profileTextField",
      label: "CVV",
      role: "AXTextField",
      focused: false,
      frame: { x: 298, y: 706, width: 126, height: 44 },
    },
  ],
});
assert.deepStrictEqual(
  buildSimulatorRefTapArgs(
    [
      "fill",
      "--udid",
      "REAL-UDID",
      "--ref",
      "profileTextField",
      "--text",
      "4111111111111111",
    ],
    paymentFormUi,
    "Fill in the card number.",
    { width: 438, height: 954 },
    "REAL-UDID",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "220",
    "--y",
    "624",
    "--width",
    "438",
    "--height",
    "954",
  ],
);
assert.deepStrictEqual(
  buildSimulatorTypeFocusTapArgs(
    ["type", "--udid", "REAL-UDID", "--text", "737"],
    paymentFormUi,
    "Entering CVV.",
    { width: 438, height: 954 },
    "REAL-UDID",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "361",
    "--y",
    "728",
    "--width",
    "438",
    "--height",
    "954",
  ],
);
assert.match(
  buildDirectFollowUpPrompt("iPhone 17 Pro", paymentFormUi),
  /Payment-form hint/,
);
assert.equal(
  buildSimulatorTypeFocusTapArgs(
    ["type", "--udid", "REAL-UDID", "--text", "4111111111111111"],
    JSON.stringify({
      children: [
        {
          identifier: "addCardButton",
          label: "Add Card",
          role: "AXButton",
          focused: false,
          frame: { x: 16, y: 858, width: 408, height: 48 },
        },
      ],
    }),
    "Entering the credit card number.",
    { width: 438, height: 954 },
    "REAL-UDID",
  ),
  null,
);
const otpUi = JSON.stringify({
  children: [
    {
      identifier: "pinTextField",
      role: "AXTextField",
      focused: false,
      frame: { x: 20.666666666666657, y: 339, width: 53.333333333333343, height: 52 },
      value: null,
    },
  ],
});
assert.equal(
  buildSimulatorTypeFocusTapArgs(
    ["type", "--udid", "REAL-UDID", "--text", "user@example.com"],
    otpUi,
    "Type the email address into the text field.",
    { width: 438, height: 954 },
    "REAL-UDID",
  ),
  null,
);
assert.deepStrictEqual(
  buildSimulatorTypeFocusTapArgs(
    ["type", "--udid", "REAL-UDID", "--text", "111111"],
    otpUi,
    "Enter the verification code.",
    { width: 438, height: 954 },
    "REAL-UDID",
  ),
  [
    "tap",
    "--udid",
    "REAL-UDID",
    "--x",
    "47.3",
    "--y",
    "365",
    "--width",
    "438",
    "--height",
    "954",
  ],
);

const initialPrompt = buildInitialDevicePrompt({
  runId: "run-123",
  buildPath: "/tmp/App.app",
  profileSystemPrompt: "Use {test-id}-sim-{sim-index}@teknasyon.com.",
  profileSkills: [],
  scenario: "Create the test accounts.",
  lastSuccessGuide: "Source run: previous direct pass",
  assignedSimulators: [
    {
      udid: "44444444-4444-4444-8444-444444444444",
      name: "iPhone 17",
      state: "Booted",
      runtime: "iOS 26.5",
      isBooted: true,
      kind: "simulator",
    },
  ],
  device: {
    udid: "U",
    name: "iPhone 17 Pro",
    state: "Booted",
    runtime: "iOS 26.5",
    isBooted: true,
  },
  simIndex: 2,
  layout: "{}",
  ui: "{}",
});
// Runner injects only a short unique id + defers account naming to the profile.
assert.match(initialPrompt, /Unique id for any test accounts this run: run-123/);
assert.match(initialPrompt, /do not use the full run id/);
// It must NOT inject a hardcoded full-run-id @teknasyon account (that overrode
// the profile's own ≤8-char rule and produced malformed emails).
assert.equal(/run-123-sim-2@teknasyon/.test(initialPrompt), false);
assert.match(initialPrompt, /LAST SUCCESSFUL RUN GUIDE/);
assert.match(initialPrompt, /previous direct pass/);
assert.match(initialPrompt, /Assigned simulator/);
assert.match(initialPrompt, /44444444-4444-4444-8444-444444444444/);

const compacted = compactDirectMessages([
  { role: "system", content: "system rules" },
  { role: "user", content: "initial context" },
  { role: "assistant", content: "old action 1" },
  { role: "user", content: "old result 1" },
  { role: "assistant", content: "old action 2" },
  { role: "user", content: "old result 2" },
  { role: "assistant", content: "recent action 1" },
  { role: "user", content: "recent result 1" },
  { role: "assistant", content: "recent action 2" },
  { role: "user", content: "recent result 2" },
  { role: "assistant", content: "recent action 3" },
  { role: "user", content: "recent result 3" },
]);
assert.equal(compacted[0]?.content, "system rules");
assert.equal(compacted[1]?.content, "initial context");
assert.match(compacted[2]?.content ?? "", /compacted/);
assert.equal(compacted.length, 7);
assert.equal(compacted.at(-1)?.content, "recent result 3");
assert(!compacted.some((message) => message.content === "old action 1"));

// Circling guard (windowed screen diversity). Calibrated against real stuck
// gemma runs: window 12, <=5 distinct screens, floor 24 observations.
const circle = (
  distinctInWindow: number,
  totalObservations: number,
  alreadyWarned = false,
  windowFilled = 12,
) => circlingVerdict({ windowFilled, distinctInWindow, totalObservations, alreadyWarned });
// Diverse window → progressing, never trips.
assert.equal(circle(9, 30), "ok");
// Window not full yet → ok even with few distinct screens (early in the run).
assert.equal(circle(2, 6, false, 6), "ok");
// Circling before the floor → warn once, then stay quiet so the nudge isn't spammed.
assert.equal(circle(5, 20, false), "warn");
assert.equal(circle(5, 21, true), "ok");
// Circling past the floor → fail (the stuck run is stopped).
assert.equal(circle(5, 24, true), "fail");
assert.equal(circle(3, 40, false), "fail");
// Hard-stuck tier: 1-2 distinct screens (parked on one alert) fails at the
// earlier floor of 18 instead of waiting for 24.
assert.equal(circle(2, 12, false), "warn");
assert.equal(circle(2, 17, true), "ok");
assert.equal(circle(1, 18, true), "fail");
assert.equal(circle(2, 18, true), "fail");
assert.equal(circle(3, 18, true), "ok"); // 3 distinct → normal floor still applies

// Complete gate: a passed claim needs real evidence of effort (observed live:
// ornith:35b claimed a 7-case pass after one describe and zero actions).
const gate = (
  status: "passed" | "failed",
  mutatingActions: number,
  observations: number,
  rejections = 0,
) => completeGateVerdict({ status, mutatingActions, observations, rejections });
// Giving up is always allowed — even with zero work done.
assert.equal(gate("failed", 0, 1), "accept");
// Hollow pass → rejected (model is told to actually run the scenario).
assert.equal(gate("passed", 0, 1), "reject");
assert.equal(gate("passed", 2, 10), "reject"); // actions below floor
assert.equal(gate("passed", 5, 2), "reject"); // observations below floor
// Earned pass → accepted.
assert.equal(gate("passed", 3, 3), "accept");
assert.equal(gate("passed", 12, 20), "accept");
// Persistent hollow claims fail the run honestly instead of passing falsely.
assert.equal(gate("passed", 0, 1, 1), "reject");
assert.equal(gate("passed", 0, 1, 2), "fail-run");

// Gesture width/height must come from the describe root frame — it shrinks to
// the alert window when a system alert is up (420×912 vs 440×956 on iPhone
// Air), which is exactly where the stuck runs mis-scaled their taps.
assert.deepStrictEqual(
  parseDescribeRootSize(
    JSON.stringify({
      frame: { x: 0, y: 0, width: 420.3333, height: 911.6667 },
      children: [],
    }),
  ),
  { width: 420, height: 912 },
);
assert.equal(parseDescribeRootSize(JSON.stringify({ children: [] })), null);
assert.equal(parseDescribeRootSize("not json"), null);
// Synthesized taps prefer the root frame of the ui output the coordinates came
// from over the caller's (possibly stale chrome-layout) screen size.
const alertUi = JSON.stringify({
  frame: { x: 0, y: 0, width: 420, height: 912 },
  children: [
    {
      identifier: "pinTextField",
      role: "AXTextField",
      focused: false,
      frame: { x: 20, y: 339, width: 54, height: 52 },
      value: null,
    },
  ],
});
const rootSizedTap = buildSimulatorTypeFocusTapArgs(
  ["type", "--udid", "REAL-UDID", "--text", "111111"],
  alertUi,
  "Enter the verification code.",
  { width: 438, height: 954 },
  "REAL-UDID",
);
assert(rootSizedTap !== null);
assert.equal(rootSizedTap[rootSizedTap.indexOf("--width") + 1], "420");
assert.equal(rootSizedTap[rootSizedTap.indexOf("--height") + 1], "912");

// The per-build app map is injected into the initial device prompt when present.
const promptWithMap = buildInitialDevicePrompt({
  runId: "run-1",
  buildPath: "/tmp/App.app",
  profileSystemPrompt: "",
  profileSkills: [],
  scenario: "Open settings.",
  appMap: "Home then gear icon then Settings.",
  device: { udid: "U", name: "iPhone", state: "Booted", runtime: "iOS 18", isBooted: true },
  simIndex: 1,
  layout: "{}",
  ui: "{}",
});
assert.match(promptWithMap, /APP MAP/);
assert.match(promptWithMap, /Home then gear icon then Settings\./);

console.log("ollama direct check: OK");
