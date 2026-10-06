require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/db/db');

describe('Centralized Error Handling & 404 Handler Tests', () => {
    let server;
    let baseUrl;

    before(async () => {
        await connectDB();
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://localhost:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        try {
            await mongoose.disconnect();
        } catch (err) {
            console.error('Cleanup error:', err);
        }
        await new Promise((resolve) => server.close(resolve));
    });

    // 404 Not Found Handler tests
    test('1. Returns consistent 404 JSON response for unknown GET route', async () => {
        const res = await fetch(`${baseUrl}/api/nonexistent-route-12345`);
        assert.equal(res.status, 404);
        assert.ok(res.headers.get('content-type').includes('application/json'));
        const data = await res.json();
        assert.equal(data.message, 'Route not found');
    });

    test('2. Returns consistent 404 JSON response for unknown POST route', async () => {
        const res = await fetch(`${baseUrl}/api/auth/unknown-endpoint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        assert.equal(res.status, 404);
        assert.ok(res.headers.get('content-type').includes('application/json'));
        const data = await res.json();
        assert.equal(data.message, 'Route not found');
    });

    // Centralized JSON Parse Error handling
    test('3. Centralized error handler catches malformed JSON body and returns 400 JSON', async () => {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"broken_json: unclosed'
        });
        assert.equal(res.status, 400);
        assert.ok(res.headers.get('content-type').includes('application/json'));
        const data = await res.json();
        assert.equal(data.message, 'Invalid JSON format in request body');
    });

    // Verify preservation of successful routes
    test('4. Existing valid routes still return successful responses as expected', async () => {
        const res = await fetch(`${baseUrl}/api/auth/logout`, {
            method: 'POST'
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, 'User logged out successfully');
    });
});
