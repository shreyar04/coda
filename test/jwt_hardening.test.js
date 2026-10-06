require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const connectDB = require('../src/db/db');
const userModel = require('../src/models/user.model');

describe('JWT Hardening & Cookie Security Tests', () => {
    let server;
    let baseUrl;
    const testSuffix = Date.now();

    const testPassword = 'securePassword123';
    let testUser;

    before(async () => {
        await connectDB();
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://localhost:${port}`;
                resolve();
            });
        });

        // Register a test user
        const res = await fetch(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: `jwt_user_${testSuffix}`,
                email: `jwt_user_${testSuffix}@example.com`,
                password: testPassword
            })
        });
        const data = await res.json();
        testUser = data.user;
    });

    after(async () => {
        try {
            await userModel.deleteMany({ email: new RegExp(`.*${testSuffix}@example\\.com`) });
            await mongoose.disconnect();
        } catch (err) {
            console.error('Cleanup error:', err);
        }
        await new Promise((resolve) => server.close(resolve));
    });

    test('1. Login sets secure cookie with HttpOnly, SameSite=Strict, and JWT with expiration', async () => {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: `jwt_user_${testSuffix}`,
                password: testPassword
            })
        });

        assert.equal(res.status, 200);
        const setCookie = res.headers.get('set-cookie');
        assert.ok(setCookie, 'Set-Cookie header should be present');

        // Check secure cookie flags
        assert.ok(setCookie.toLowerCase().includes('httponly'), 'Cookie should have HttpOnly flag');
        assert.ok(setCookie.toLowerCase().includes('samesite=strict'), 'Cookie should have SameSite=Strict');

        // Extract token and verify expiration
        const tokenMatch = setCookie.match(/token=([^;]+)/);
        assert.ok(tokenMatch, 'Token cookie should be present');
        const token = tokenMatch[1];

        const decoded = jwt.decode(token);
        assert.ok(decoded.exp, 'JWT must contain exp claim');
        assert.ok(decoded.iat, 'JWT must contain iat claim');
        // Expiration should be roughly 24 hours (86400 seconds) in the future
        const diffInSeconds = decoded.exp - decoded.iat;
        assert.equal(diffInSeconds, 24 * 60 * 60, 'Expiration should be 24 hours');
    });

    test('2. Authenticated route succeeds with valid JWT cookie', async () => {
        // Login to get fresh cookie
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: `jwt_user_${testSuffix}`,
                password: testPassword
            })
        });
        const cookie = loginRes.headers.get('set-cookie');

        const authRes = await fetch(`${baseUrl}/api/music/`, {
            headers: { 'Cookie': cookie }
        });

        assert.equal(authRes.status, 200);
        const data = await authRes.json();
        assert.equal(data.message, 'Musics fetched successfully');
    });

    test('3. Logout clears the cookie with matching security flags', async () => {
        const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
            method: 'POST'
        });

        assert.equal(logoutRes.status, 200);
        const setCookie = logoutRes.headers.get('set-cookie');
        assert.ok(setCookie, 'Logout should send Set-Cookie to clear cookie');

        // Verify cookie is expired/cleared
        assert.ok(
            setCookie.includes('Expires=Thu, 01 Jan 1970') || setCookie.includes('Max-Age=0'),
            'Cookie should be set to expire'
        );
        assert.ok(setCookie.toLowerCase().includes('httponly'), 'Clear cookie should have HttpOnly');
        assert.ok(setCookie.toLowerCase().includes('samesite=strict'), 'Clear cookie should have SameSite=Strict');
    });

    test('4. Rejects expired JWT token (401)', async () => {
        // Create an expired token (expiresIn: 0s or negative exp)
        const expiredToken = jwt.sign(
            { id: testUser.id, role: testUser.role },
            process.env.JWT_SECRET,
            { expiresIn: '0s' }
        );

        // Small delay to ensure expiration has passed
        await new Promise((r) => setTimeout(r, 100));

        const res = await fetch(`${baseUrl}/api/music/`, {
            headers: { 'Cookie': `token=${expiredToken}` }
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.message, 'Unauthorized');
    });

    test('5. Rejects JWT signed with invalid secret (401)', async () => {
        const tamperedToken = jwt.sign(
            { id: testUser.id, role: testUser.role },
            'wrong_secret_12345',
            { expiresIn: '24h' }
        );

        const res = await fetch(`${baseUrl}/api/music/`, {
            headers: { 'Cookie': `token=${tamperedToken}` }
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.message, 'Unauthorized');
    });

    test('6. Rejects malformed JWT token string (401)', async () => {
        const res = await fetch(`${baseUrl}/api/music/`, {
            headers: { 'Cookie': 'token=invalid.token.structure' }
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.message, 'Unauthorized');
    });
});
