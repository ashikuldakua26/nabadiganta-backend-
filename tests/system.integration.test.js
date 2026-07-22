process.env.NODE_ENV = process.env.NODE_ENV || "test";
require("dotenv").config();
const mongoose = require("mongoose");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../app");

if (!process.env.MONGODB_URI) {
  console.warn("Skipping integration tests because MONGODB_URI is not set.");
  process.exit(0);
}

test.before(async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });
});

test.after(async () => {
  await mongoose.disconnect();
});

test("GET /api/system/health returns ok", async () => {
  const response = await request(app).get("/api/system/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("GET /api/system/ready returns status", async () => {
  const response = await request(app).get("/api/system/ready");
  assert.equal([200, 503].includes(response.status), true);
  assert.ok(response.body.status);
});

test("GET /api/admin/meta rejects unauthorized requests", async () => {
  const response = await request(app).get("/api/admin/meta");
  assert.equal(response.status, 401);
  assert.equal(response.body.message, "Unauthorized: token missing");
});

test("GET /api/branch-manager/panel rejects unauthorized requests", async () => {
  const response = await request(app).get("/api/branch-manager/panel");
  assert.equal(response.status, 401);
  assert.equal(response.body.message, "Unauthorized: token missing");
});

test("POST /api/auth/logout rejects unauthorized requests", async () => {
  const response = await request(app).post("/api/auth/logout").send({});
  assert.equal(response.status, 401);
  assert.equal(response.body.message, "Unauthorized: token missing");
});

test("POST /api/auth/login rejects missing credentials", async () => {
  const response = await request(app).post("/api/auth/login").send({});
  assert.equal(response.status, 400);
  assert.equal(response.body.message, "phone and pin are required");
});

test("POST /api/auth/seed-defaults returns default credentials", async () => {
  const response = await request(app).post("/api/auth/seed-defaults").send({});
  assert.equal([200, 201].includes(response.status), true);
  assert.ok(response.body.message);
  if (response.status === 201) {
    assert.ok(response.body.defaults.admin);
    assert.equal(response.body.defaults.admin.phone, "01349828721");
  }
});

test("POST /api/auth/login succeeds with seeded admin", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ phone: "01349828721", pin: "1234" });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user.role, "admin");
});

test("POST /api/auth/login succeeds with seeded superadmin", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ phone: "01349828722", pin: "1234" });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user.role, "superadmin");
});

test("GET /api/admin/meta succeeds with super admin token", async () => {
  const loginResponse = await request(app)
    .post("/api/auth/login")
    .send({ phone: "01349828722", pin: "1234" });

  assert.equal(loginResponse.status, 200);
  const token = loginResponse.body.token;
  assert.ok(token);

  const response = await request(app)
    .get("/api/admin/meta")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.organization, "string");
});
