// Check the Stagehand setup without the assistant: launch, navigate, observe, act, extract, screenshot, release.
//   pnpm smoke
import { activePage, closeSession, getSession } from "../lib/browser-session";

const session = await getSession();
console.log("live view:", session.initialLiveView.url);
try {
  const page = await activePage(session);
  await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
  console.log("navigate ->", await page.title());

  const shot = await page.screenshot({ type: "jpeg", quality: 50 });
  console.log(`screenshot -> ${Math.round(shot.byteLength / 1024)} KB`);

  const { stagehand } = session;
  const observed = await stagehand.observe("find the link to learn more");
  console.log("observe ->", observed.data);

  const acted = await stagehand.act(observed.data[0] ?? "click the 'Learn more' link");
  console.log("act ->", acted.data.success, acted.data.actionDescription, "→", await page.url());

  const extracted = await stagehand.extract("the page heading");
  console.log("extract ->", extracted.data);

  console.log("✅ Stagehand works");
} finally {
  await closeSession();
}
