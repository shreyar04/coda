require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const connectDB = require('../src/db/db');
const userModel = require('../src/models/user.model');
const musicModel = require('../src/models/music.model');

describe('Music Upload Safety & Validation Tests', () => {
    let server;
    let baseUrl;
    const testSuffix = Date.now();

    let userToken;
    let artistToken;
    let artistId;

    before(async () => {
        await connectDB();
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://localhost:${port}`;
                resolve();
            });
        });

        // Create standard user
        const userDoc = await userModel.create({
            username: `up_user_${testSuffix}`,
            email: `up_user_${testSuffix}@example.com`,
            password: 'hashedpassword123',
            role: 'user'
        });
        userToken = jwt.sign(
            { id: userDoc._id.toString(), role: userDoc.role },
            process.env.JWT_SECRET
        );

        // Create artist user
        const artistDoc = await userModel.create({
            username: `up_artist_${testSuffix}`,
            email: `up_artist_${testSuffix}@example.com`,
            password: 'hashedpassword123',
            role: 'artist'
        });
        artistId = artistDoc._id;
        artistToken = jwt.sign(
            { id: artistDoc._id.toString(), role: artistDoc.role },
            process.env.JWT_SECRET
        );
    });

    after(async () => {
        try {
            await userModel.deleteMany({ email: new RegExp(`.*${testSuffix}@example\\.com`) });
            await musicModel.deleteMany({ title: new RegExp(`.*${testSuffix}`) });
            await mongoose.disconnect();
        } catch (err) {
            console.error('Cleanup error:', err);
        }
        await new Promise((resolve) => server.close(resolve));
    });

    test('1. Rejects unauthenticated upload request (401)', async () => {
        const form = new FormData();
        form.append('title', `Song ${testSuffix}`);
        form.append('music', new Blob([Buffer.from('dummy audio')], { type: 'audio/mpeg' }), 'test.mp3');

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            body: form
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.message, 'Unauthorized');
    });

    test('2. Rejects non-artist user upload request (403)', async () => {
        const form = new FormData();
        form.append('title', `Song ${testSuffix}`);
        form.append('music', new Blob([Buffer.from('dummy audio')], { type: 'audio/mpeg' }), 'test.mp3');

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            headers: { 'Cookie': `token=${userToken}` },
            body: form
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.message, "You don't have access");
    });

    test('3. Rejects upload with missing title (400)', async () => {
        const form = new FormData();
        form.append('music', new Blob([Buffer.from('dummy audio')], { type: 'audio/mpeg' }), 'test.mp3');

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            headers: { 'Cookie': `token=${artistToken}` },
            body: form
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Title is required');
    });

    test('4. Rejects upload with missing music file (400)', async () => {
        const form = new FormData();
        form.append('title', `Song Without File ${testSuffix}`);

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            headers: { 'Cookie': `token=${artistToken}` },
            body: form
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Music file is required');
    });

    test('5. Rejects upload with empty (0-byte) music file (400)', async () => {
        const form = new FormData();
        form.append('title', `Empty Audio Song ${testSuffix}`);
        form.append('music', new Blob([Buffer.alloc(0)], { type: 'audio/mpeg' }), 'empty.mp3');

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            headers: { 'Cookie': `token=${artistToken}` },
            body: form
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Music file cannot be empty');
    });

    test('6. Rejects upload with unsupported MIME type like image/png (400)', async () => {
        const form = new FormData();
        form.append('title', `Image Upload Attempt ${testSuffix}`);
        form.append('music', new Blob([Buffer.from('fake image data')], { type: 'image/png' }), 'image.png');

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            headers: { 'Cookie': `token=${artistToken}` },
            body: form
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Invalid file type. Only audio files are allowed.');
    });

    test('7. Rejects upload with unsupported MIME type like text/plain (400)', async () => {
        const form = new FormData();
        form.append('title', `Text File Attempt ${testSuffix}`);
        form.append('music', new Blob([Buffer.from('hello world')], { type: 'text/plain' }), 'notes.txt');

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            headers: { 'Cookie': `token=${artistToken}` },
            body: form
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Invalid file type. Only audio files are allowed.');
    });

    test('8. Rejects upload exceeding 15MB file size limit (400)', async () => {
        // Create a buffer slightly larger than 15MB (15MB + 1KB)
        const oversizedBuffer = Buffer.alloc(15 * 1024 * 1024 + 1024);
        const form = new FormData();
        form.append('title', `Oversized Track ${testSuffix}`);
        form.append('music', new Blob([oversizedBuffer], { type: 'audio/mpeg' }), 'huge.mp3');

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            headers: { 'Cookie': `token=${artistToken}` },
            body: form
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.ok(data.message.includes('File size exceeds limit'));
    });

    test('9. Successfully uploads valid audio file with reasonable size (201)', async () => {
        const form = new FormData();
        form.append('title', `Valid Song ${testSuffix}`);
        form.append('music', new Blob([Buffer.from('valid audio stream data')], { type: 'audio/mpeg' }), 'sample.mp3');

        const res = await fetch(`${baseUrl}/api/music/upload`, {
            method: 'POST',
            headers: { 'Cookie': `token=${artistToken}` },
            body: form
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.message, 'Music created successfully');
        assert.ok(data.music.id);
        assert.equal(data.music.title, `Valid Song ${testSuffix}`);
        assert.equal(data.music.artist.toString(), artistId.toString());
        assert.ok(data.music.uri.startsWith('http'));
    });
});
