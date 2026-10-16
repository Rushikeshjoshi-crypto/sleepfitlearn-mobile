// The heart rate log popup's "Measure with camera" used the plain text-link
// style (no background, no border, muted colour), so it didn't look like an
// option. It's a real button now (ModernButton, outlined) with a camera icon.
const fs = require("fs");
const path = require("path");

test("heart rate popup: Measure with camera is a ModernButton", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/screens/PersonalScreen.tsx"), "utf8");
  expect(src).toMatch(/<ModernButton\s+title=\{`📷 \$\{t\("HeartCamera:measureButton"\)\}`\}\s+variant="outline"/);
  expect(src).not.toMatch(/secondaryButtonText}>❤️ \{t\("HeartCamera:measureButton"\)\}/);
});
