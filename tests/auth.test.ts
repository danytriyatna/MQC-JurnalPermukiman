import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { authorizeStaffCredentials } from "../src/auth";
import {
  requireStaffSession,
  requireStaffOrInspectionToken,
} from "../src/lib/auth/guard";
import { createInspectionToken } from "../src/lib/auth/token";
import { proxy } from "../src/proxy";
import { GET as exportGET } from "../src/app/api/manuscripts/export/route";
import { client } from "../src/db";
import { createStaffSessionCookieHeader } from "./helpers/authTestHelper";

describe("NextAuth v5 Staff Authentication, Route Guards, & Proxy Suite", () => {
  let staffCookie: string;
  let staffUserId: string;
  let staffEmail: string;

  before(async () => {
    const session = await createStaffSessionCookieHeader();
    staffCookie = session.cookieHeader;
    staffUserId = session.userId;
    staffEmail = session.email;
  });

  after(async () => {
    await client.end();
  });

  it("authorizeStaffCredentials authenticates seeded staff user via PostgreSQL & bcryptjs", async () => {
    const user = await authorizeStaffCredentials({
      email: staffEmail,
      password: "adminadmin",
    });
    assert.ok(user, "Kredensial valid harus menghasilkan profil pengguna");
    assert.equal(user.id, staffUserId);
    assert.equal(user.email, staffEmail);
    assert.equal(user.role, "staff");

    const caseInsensitive = await authorizeStaffCredentials({
      email: `  ${staffEmail.toUpperCase()}  `,
      password: "adminadmin",
    });
    assert.ok(caseInsensitive, "Login email harus bersifat case-insensitive");
    assert.equal(caseInsensitive.id, staffUserId);
  });

  it("authorizeStaffCredentials rejects wrong password, unknown email, and malformed input", async () => {
    assert.equal(
      await authorizeStaffCredentials({ email: staffEmail, password: "wrong-password" }),
      null,
    );
    assert.equal(
      await authorizeStaffCredentials({ email: "nobody@example.com", password: "adminadmin" }),
      null,
    );
    assert.equal(
      await authorizeStaffCredentials({ email: "not-an-email", password: "" }),
      null,
    );
  });

  it("requireStaffSession enforces HTTP 401 without valid NextAuth cookie and accepts signed cookie", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/manuscripts");
    const unauthRes = await requireStaffSession(unauthReq);
    assert.ok(unauthRes.errorResponse);
    assert.equal(unauthRes.errorResponse.status, 401);

    const tamperedReq = new NextRequest("http://localhost:3000/api/manuscripts", {
      headers: { Cookie: "authjs.session-token=tampered.invalid.token" },
    });
    const tamperedRes = await requireStaffSession(tamperedReq);
    assert.ok(tamperedRes.errorResponse);
    assert.equal(tamperedRes.errorResponse.status, 401);

    const authReq = new NextRequest("http://localhost:3000/api/manuscripts", {
      headers: { Cookie: staffCookie },
    });
    const authRes = await requireStaffSession(authReq);
    assert.ok(authRes.session);
    assert.equal(authRes.session.userId, staffUserId);
  });

  it("requireStaffOrInspectionToken accepts matching ?token= and rejects mismatched/forged tokens", async () => {
    const manuscriptId = "11111111-1111-1111-1111-111111111111";
    const otherManuscriptId = "22222222-2222-2222-2222-222222222222";
    const validToken = await createInspectionToken(manuscriptId);

    const validReq = new NextRequest(
      `http://localhost:3000/api/manuscripts/${manuscriptId}/original?token=${validToken}`,
    );
    const validAuth = await requireStaffOrInspectionToken(validReq, manuscriptId);
    assert.equal(validAuth.access, "inspection_token");

    const crossIdReq = new NextRequest(
      `http://localhost:3000/api/manuscripts/${otherManuscriptId}/original?token=${validToken}`,
    );
    const crossIdAuth = await requireStaffOrInspectionToken(crossIdReq, otherManuscriptId);
    assert.ok(crossIdAuth.errorResponse);
    assert.equal(crossIdAuth.errorResponse.status, 401);

    const noAuthReq = new NextRequest(
      `http://localhost:3000/api/manuscripts/${manuscriptId}/original`,
    );
    const noAuthRes = await requireStaffOrInspectionToken(noAuthReq, manuscriptId);
    assert.ok(noAuthRes.errorResponse);
    assert.equal(noAuthRes.errorResponse.status, 401);
  });

  it("GET /api/manuscripts/export rejects anonymous request (401) and serves CSV to staff", async () => {
    const unauthRes = await exportGET(
      new NextRequest("http://localhost:3000/api/manuscripts/export"),
    );
    assert.equal(unauthRes.status, 401);

    const authRes = await exportGET(
      new NextRequest("http://localhost:3000/api/manuscripts/export", {
        headers: { Cookie: staffCookie },
      }),
    );
    assert.equal(authRes.status, 200);
    assert.ok(authRes.headers.get("content-type")?.includes("text/csv"));
  });

  it("proxy blocks unauthenticated /dashboard & forged ?token=, while allowing valid staff or detail token", async () => {
    const resDashUnauth = await proxy(new NextRequest("http://localhost:3000/dashboard"));
    assert.equal(resDashUnauth.status, 307);
    assert.ok(resDashUnauth.headers.get("location")?.endsWith("/login"));

    const resUploadSpoofedToken = await proxy(
      new NextRequest("http://localhost:3000/manuscripts/upload?token=forged"),
    );
    assert.equal(resUploadSpoofedToken.status, 307);
    assert.ok(resUploadSpoofedToken.headers.get("location")?.endsWith("/login"));

    const manuscriptId = "11111111-1111-1111-1111-111111111111";
    const resDetailSpoofed = await proxy(
      new NextRequest(`http://localhost:3000/manuscripts/${manuscriptId}?token=fake.jwt.token`),
    );
    assert.equal(resDetailSpoofed.status, 307);

    const validToken = await createInspectionToken(manuscriptId);
    const resDetailValid = await proxy(
      new NextRequest(`http://localhost:3000/manuscripts/${manuscriptId}?token=${validToken}`),
    );
    assert.equal(resDetailValid.status, 200);

    const resDashStaff = await proxy(
      new NextRequest("http://localhost:3000/dashboard", {
        headers: { Cookie: staffCookie },
      }),
    );
    assert.equal(resDashStaff.status, 200);

    const resLoginRedirect = await proxy(
      new NextRequest("http://localhost:3000/login", {
        headers: { Cookie: staffCookie },
      }),
    );
    assert.equal(resLoginRedirect.status, 307);
    assert.ok(resLoginRedirect.headers.get("location")?.endsWith("/dashboard"));
  });
});
