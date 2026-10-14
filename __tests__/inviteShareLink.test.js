// Mobile invite share: never a sleepfitlearn:// link (useless to a child on
// the web or without the app). The backend's invite_url wins; otherwise the
// web app's /{locale}/family/accept?code= when a web URL is configured;
// otherwise no link (the code itself is still shared).
import { inviteShareLink } from "../src/lib/family/inviteShareLink";

test("backend invite_url is used as-is", () => {
  expect(inviteShareLink({ code: "ABCD-1234", inviteUrl: "https://x.example/accept?code=ABCD-1234", webAppUrl: "https://app.example", locale: "hi" }))
    .toBe("https://x.example/accept?code=ABCD-1234");
});

test("no invite_url → the web accept page in the user's language", () => {
  expect(inviteShareLink({ code: "ABCD-1234", inviteUrl: null, webAppUrl: "https://app.example/", locale: "hi" }))
    .toBe("https://app.example/hi/family/accept?code=ABCD-1234");
  expect(inviteShareLink({ code: "AB CD", inviteUrl: null, webAppUrl: "https://app.example", locale: "xx" }))
    .toBe("https://app.example/en/family/accept?code=AB%20CD");
});

test("no web URL configured → no link, and never sleepfitlearn://", () => {
  expect(inviteShareLink({ code: "ABCD-1234", inviteUrl: null, webAppUrl: "", locale: "en" })).toBeNull();
});
