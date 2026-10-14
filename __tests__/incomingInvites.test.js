// The child's in-app "Invites for you" list: invites sent to their email are
// fetched without a code and reviewed / accepted / rejected by link id. A
// plain string is still a code, so the existing code flow is unchanged.
jest.mock("../src/lib/api/client", () => ({ apiGet: jest.fn(), apiPost: jest.fn(), apiPut: jest.fn(), apiDelete: jest.fn() }));

import { apiGet, apiPost } from "../src/lib/api/client";
import { acceptInvite, listIncomingInvites, previewInvite, rejectInvite } from "../src/lib/api/family";

beforeEach(() => jest.clearAllMocks());

test("listIncomingInvites reads invites/incoming and drops malformed rows", async () => {
  apiGet.mockResolvedValue({ invites: [{ link_id: "l1", parent_name: "Pat" }, null, { parent_name: "no id" }] });
  expect(await listIncomingInvites()).toEqual([{ link_id: "l1", parent_name: "Pat" }]);
  expect(apiGet).toHaveBeenCalledWith("family", "invites/incoming");
  apiGet.mockResolvedValue({});
  expect(await listIncomingInvites()).toEqual([]);
});

test("by link id → invites/incoming/{id}; by code (string) → invites/{code}", async () => {
  apiGet.mockResolvedValue({});
  apiPost.mockResolvedValue({});
  await previewInvite({ linkId: "l 1" });
  await acceptInvite({ linkId: "l1" }, { sleep: true }, "v0");
  await rejectInvite({ linkId: "l1" });
  await previewInvite(" ABCD-1234 ");
  expect(apiGet.mock.calls.map((c) => c[1])).toEqual(["invites/incoming/l%201", "invites/ABCD-1234"]);
  expect(apiPost.mock.calls.map((c) => c[1])).toEqual(["invites/incoming/l1/accept", "invites/incoming/l1/reject"]);
});

test("the list's text exists in every locale", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const inc = require(`../src/i18n/locales/${lang}.json`).Family.Incoming;
    expect(inc && inc.title && inc.from && inc.review).toBeTruthy();
    expect(inc.from).toContain("{name}");
  }
});
