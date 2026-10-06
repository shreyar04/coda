require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const connectDB = require('../src/db/db');
const userModel = require('../src/models/user.model');
const musicModel = require('../src/models/music.model');

describe('Music Listing API - Pagination and Search Tests', () => {
    let server;
    let baseUrl;
    const testSuffix = Date.now();

    let userToken;
    let artistId;
    const createdMusicIds = [];

    before(async () => {
        await connectDB();
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://localhost:${port}`;
                resolve();
            });
        });

        // Create user for auth
        const userDoc = await userModel.create({
            username: `pg_user_${testSuffix}`,
            email: `pg_user_${testSuffix}@example.com`,
            password: 'hashedpassword123',
            role: 'user'
        });
        userToken = jwt.sign(
            { id: userDoc._id.toString(), role: userDoc.role },
            process.env.JWT_SECRET
        );

        // Create artist
        const artistDoc = await userModel.create({
            username: `pg_artist_${testSuffix}`,
            email: `pg_artist_${testSuffix}@example.com`,
            password: 'hashedpassword123',
            role: 'artist'
        });
        artistId = artistDoc._id;

        // Seed 5 distinct tracks for search & pagination
        const tracks = [
            { title: `Alpha Symphony Track ${testSuffix}`, uri: 'https://example.com/1.mp3', artist: artistId },
            { title: `Beta Symphony Track ${testSuffix}`, uri: 'https://example.com/2.mp3', artist: artistId },
            { title: `Gamma Rock Anthem ${testSuffix}`, uri: 'https://example.com/3.mp3', artist: artistId },
            { title: `Delta Rock Anthem ${testSuffix}`, uri: 'https://example.com/4.mp3', artist: artistId },
            { title: `Epsilon Special (Acoustic) Track ${testSuffix}`, uri: 'https://example.com/5.mp3', artist: artistId },
        ];

        for (const t of tracks) {
            const m = await musicModel.create(t);
            createdMusicIds.push(m._id);
        }
    });

    after(async () => {
        try {
            await userModel.deleteMany({ email: new RegExp(`.*${testSuffix}@example\\.com`) });
            await musicModel.deleteMany({ _id: { $in: createdMusicIds } });
            await mongoose.disconnect();
        } catch (err) {
            console.error('Cleanup error:', err);
        }
        await new Promise((resolve) => server.close(resolve));
    });

    // 1. Existing Behavior Preserved
    test('1. Preserves existing behavior when no query parameters are provided', async () => {
        const res = await fetch(`${baseUrl}/api/music/`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, 'Musics fetched successfully');
        assert.ok(Array.isArray(data.musics));
        // All created tracks should be returned
        const found = data.musics.filter(m => m.title.includes(testSuffix.toString()));
        assert.equal(found.length, 5);
        // Verify population of artist
        assert.ok(found[0].artist);
        assert.ok(found[0].artist.username);
        // No pagination fields when neither page nor limit is requested
        assert.equal(data.page, undefined);
        assert.equal(data.limit, undefined);
    });

    // 2. Case-Insensitive Title Search
    test('2. Case-insensitive search: finds tracks with lowercase search term', async () => {
        const res = await fetch(`${baseUrl}/api/music/?search=symphony`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        const found = data.musics.filter(m => m.title.includes(testSuffix.toString()));
        assert.equal(found.length, 2);
        assert.ok(found.every(m => m.title.toLowerCase().includes('symphony')));
    });

    test('3. Case-insensitive search: finds tracks with uppercase search term', async () => {
        const res = await fetch(`${baseUrl}/api/music/?search=ROCK`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        const found = data.musics.filter(m => m.title.includes(testSuffix.toString()));
        assert.equal(found.length, 2);
        assert.ok(found.every(m => m.title.toLowerCase().includes('rock')));
    });

    test('4. Case-insensitive search: handles special characters safely', async () => {
        const res = await fetch(`${baseUrl}/api/music/?search=(Acoustic)`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        const found = data.musics.filter(m => m.title.includes(testSuffix.toString()));
        assert.equal(found.length, 1);
        assert.ok(found[0].title.includes('(Acoustic)'));
    });

    test('5. Search returns empty array when no tracks match', async () => {
        const res = await fetch(`${baseUrl}/api/music/?search=nonexistent_xyz_title_123`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.musics.length, 0);
    });

    // 3. Pagination
    test('6. Pagination: limits results to specified limit with pagination metadata', async () => {
        const res = await fetch(`${baseUrl}/api/music/?page=1&limit=2`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.musics.length, 2);
        assert.equal(data.page, 1);
        assert.equal(data.limit, 2);
        assert.ok(typeof data.total === 'number');
        assert.ok(typeof data.totalPages === 'number');
        assert.ok(data.totalPages >= 3);
    });

    test('7. Pagination: page 2 returns the next distinct set of tracks', async () => {
        const res1 = await fetch(`${baseUrl}/api/music/?search=${testSuffix}&page=1&limit=2`, {
            headers: { 'Cookie': `token=${userToken}` }
        });
        const data1 = await res1.json();

        const res2 = await fetch(`${baseUrl}/api/music/?search=${testSuffix}&page=2&limit=2`, {
            headers: { 'Cookie': `token=${userToken}` }
        });
        const data2 = await res2.json();

        assert.equal(data1.musics.length, 2);
        assert.equal(data2.musics.length, 2);
        assert.equal(data1.page, 1);
        assert.equal(data2.page, 2);
        assert.equal(data1.total, 5);
        assert.equal(data1.totalPages, 3);

        const idsPage1 = data1.musics.map(m => m._id.toString());
        const idsPage2 = data2.musics.map(m => m._id.toString());
        // Verify no overlap between page 1 and page 2
        assert.ok(idsPage1.every(id => !idsPage2.includes(id)));
    });

    // 4. Combined Search & Pagination
    test('8. Combined search and pagination: returns paginated subset of matching tracks', async () => {
        const res = await fetch(`${baseUrl}/api/music/?search=Symphony%20Track%20${testSuffix}&page=1&limit=1`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.musics.length, 1);
        assert.equal(data.total, 2);
        assert.equal(data.totalPages, 2);
        assert.equal(data.page, 1);
        assert.equal(data.limit, 1);
    });

    // 5. Invalid query parameters
    test('9. Rejects invalid page parameter (0 or negative) with 400', async () => {
        const res = await fetch(`${baseUrl}/api/music/?page=0`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Invalid page parameter');
    });

    test('10. Rejects invalid non-numeric page parameter with 400', async () => {
        const res = await fetch(`${baseUrl}/api/music/?page=abc`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Invalid page parameter');
    });

    test('11. Rejects invalid limit parameter with 400', async () => {
        const res = await fetch(`${baseUrl}/api/music/?limit=-5`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Invalid limit parameter');
    });
});
