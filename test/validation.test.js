require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const connectDB = require('../src/db/db');
const userModel = require('../src/models/user.model');

describe('Input and ObjectId Validation Tests', () => {
    let server;
    let baseUrl;
    const testSuffix = Date.now();

    let validUser;
    let validUserToken;
    let validArtist;
    let validArtistToken;

    before(async () => {
        await connectDB();
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://localhost:${port}`;
                resolve();
            });
        });

        // Seed a valid user for login & auth tests
        const regRes = await fetch(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: `valuser_${testSuffix}`,
                email: `valuser_${testSuffix}@example.com`,
                password: 'validpassword123'
            })
        });
        const regData = await regRes.json();
        validUser = regData.user;
        const cookie = regRes.headers.get('set-cookie');
        if (cookie) {
            const match = cookie.match(/token=([^;]+)/);
            if (match) validUserToken = match[1];
        }

        // Seed an artist
        const artistDoc = await userModel.create({
            username: `valartist_${testSuffix}`,
            email: `valartist_${testSuffix}@example.com`,
            password: 'hashedpassword',
            role: 'artist'
        });
        validArtist = artistDoc;
        validArtistToken = jwt.sign(
            { id: artistDoc._id.toString(), role: artistDoc.role },
            process.env.JWT_SECRET
        );
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

    // --- REGISTRATION VALIDATION ---
    describe('Registration Input Validation', () => {
        test('rejects registration with missing username', async () => {
            const res = await fetch(`${baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: `no_user_${testSuffix}@example.com`,
                    password: 'password123'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Username is required');
        });

        test('rejects registration with username shorter than 3 characters', async () => {
            const res = await fetch(`${baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'ab',
                    email: `short_user_${testSuffix}@example.com`,
                    password: 'password123'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Username must be at least 3 characters long');
        });

        test('rejects registration with missing email', async () => {
            const res = await fetch(`${baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `no_email_${testSuffix}`,
                    password: 'password123'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Email is required');
        });

        test('rejects registration with invalid email format', async () => {
            const res = await fetch(`${baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `bad_email_${testSuffix}`,
                    email: 'not-a-valid-email',
                    password: 'password123'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Invalid email format');
        });

        test('rejects registration with missing password', async () => {
            const res = await fetch(`${baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `no_pass_${testSuffix}`,
                    email: `no_pass_${testSuffix}@example.com`
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Password is required');
        });

        test('rejects registration with password shorter than 6 characters', async () => {
            const res = await fetch(`${baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `short_pass_${testSuffix}`,
                    email: `short_pass_${testSuffix}@example.com`,
                    password: '12345'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Password must be at least 6 characters long');
        });

        test('rejects registration with invalid role', async () => {
            const res = await fetch(`${baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `admin_try_${testSuffix}`,
                    email: `admin_try_${testSuffix}@example.com`,
                    password: 'password123',
                    role: 'admin'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Invalid role');
        });
    });

    // --- LOGIN VALIDATION ---
    describe('Login Input Validation', () => {
        test('rejects login with missing username and email', async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password: 'validpassword123'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Username or email is required');
        });

        test('rejects login with invalid email format', async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'invalid-email-string',
                    password: 'validpassword123'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Invalid email format');
        });

        test('rejects login with missing password', async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `valuser_${testSuffix}`
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Password is required');
        });

        test('rejects login with invalid role', async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `valuser_${testSuffix}`,
                    password: 'validpassword123',
                    role: 'superadmin'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Invalid role');
        });

        test('allows login with valid username and password', async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `valuser_${testSuffix}`,
                    password: 'validpassword123'
                })
            });
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.message, 'User logged in successfully');
            assert.equal(data.user.username, `valuser_${testSuffix}`);
        });

        test('allows login with valid email and password', async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: `valuser_${testSuffix}@example.com`,
                    password: 'validpassword123'
                })
            });
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.message, 'User logged in successfully');
            assert.equal(data.user.email, `valuser_${testSuffix}@example.com`);
        });
    });

    // --- MONGODB OBJECTID VALIDATION ---
    describe('MongoDB ObjectId Validation', () => {
        test('rejects album fetch with malformed album ObjectId (400)', async () => {
            const res = await fetch(`${baseUrl}/api/music/albums/invalid-object-id`, {
                headers: { 'Cookie': `token=${validUserToken}` }
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Invalid album ID');
        });

        test('rejects album creation with non-array musics (400)', async () => {
            const res = await fetch(`${baseUrl}/api/music/album`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `token=${validArtistToken}`
                },
                body: JSON.stringify({
                    title: 'Album Bad Musics',
                    musics: 'not-an-array'
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Musics must be an array');
        });

        test('rejects album creation with malformed ObjectId in musics array (400)', async () => {
            const res = await fetch(`${baseUrl}/api/music/album`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `token=${validArtistToken}`
                },
                body: JSON.stringify({
                    title: 'Album Bad Music ID',
                    musics: ['not-a-valid-object-id']
                })
            });
            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.message, 'Invalid music ID');
        });

        test('rejects authArtist token with invalid user ObjectId (401)', async () => {
            const invalidIdToken = jwt.sign(
                { id: 'not_valid_object_id', role: 'artist' },
                process.env.JWT_SECRET
            );

            const res = await fetch(`${baseUrl}/api/music/album`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `token=${invalidIdToken}`
                },
                body: JSON.stringify({ title: 'Test Album' })
            });
            assert.equal(res.status, 401);
            const data = await res.json();
            assert.equal(data.message, 'Unauthorized');
        });

        test('rejects authUser token with invalid user ObjectId (401)', async () => {
            const invalidIdToken = jwt.sign(
                { id: 'not_valid_object_id', role: 'user' },
                process.env.JWT_SECRET
            );

            const res = await fetch(`${baseUrl}/api/music/`, {
                headers: { 'Cookie': `token=${invalidIdToken}` }
            });
            assert.equal(res.status, 401);
            const data = await res.json();
            assert.equal(data.message, 'Unauthorized');
        });
    });
});
