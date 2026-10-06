require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const connectDB = require('../src/db/db');
const userModel = require('../src/models/user.model');
const musicModel = require('../src/models/music.model');
const albumModel = require('../src/models/album.model');

describe('Auth & Music APIs - Authentication, Authorization & Ownership Tests', () => {
    let server;
    let baseUrl;
    const testSuffix = Date.now();

    let userToken;
    let artist1Token;
    let artist2Token;
    let artist1Id;
    let artist2Id;
    let music1Id;
    let music2Id;

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
        // Clean up test data
        try {
            await userModel.deleteMany({ email: new RegExp(`test.*${testSuffix}@test\\.com`) });
            await musicModel.deleteMany({ title: new RegExp(`Test Track.*${testSuffix}`) });
            await albumModel.deleteMany({ title: new RegExp(`Test Album.*${testSuffix}`) });
            await mongoose.disconnect();
        } catch (err) {
            console.error('Cleanup error:', err);
        }
        await new Promise((resolve) => server.close(resolve));
    });

    test('1. Registration: prevents choosing "artist" role during registration', async () => {
        const res = await fetch(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: `artist_hacker_${testSuffix}`,
                email: `test_artist_hacker_${testSuffix}@test.com`,
                password: 'password123',
                role: 'artist'
            })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'Cannot register as an artist');
    });

    test('2. Registration: creates normal user with role "user" by default', async () => {
        const res = await fetch(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: `normal_user_${testSuffix}`,
                email: `test_normal_user_${testSuffix}@test.com`,
                password: 'password123'
            })
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.user.role, 'user');

        // Extract cookie token
        const cookieHeader = res.headers.get('set-cookie');
        if (cookieHeader) {
            const match = cookieHeader.match(/token=([^;]+)/);
            if (match) userToken = match[1];
        }
    });

    test('3. authUser: missing returns after 401 response - should not crash or send headers twice', async () => {
        const res = await fetch(`${baseUrl}/api/music/`, {
            method: 'GET'
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.message, 'Unauthorized');
    });

    test('4. authArtist: unauthenticated request returns 401', async () => {
        const res = await fetch(`${baseUrl}/api/music/album`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Unauthorized Album' })
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.message, 'Unauthorized');
    });

    test('5. Authorization: Normal user cannot access artist-only routes (403)', async () => {
        const res = await fetch(`${baseUrl}/api/music/album`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${userToken}`
            },
            body: JSON.stringify({ title: 'User Trying to Create Album' })
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.message, "You don't have access");
    });

    test('6. Authorization: Artist CAN access user routes (GET /api/music/ & GET /api/music/albums)', async () => {
        // Create an artist account directly in the database
        const artistUser1 = await userModel.create({
            username: `artist1_${testSuffix}`,
            email: `test_artist1_${testSuffix}@test.com`,
            password: 'hashedpassword',
            role: 'artist'
        });
        artist1Id = artistUser1._id;

        artist1Token = jwt.sign(
            { id: artistUser1._id.toString(), role: artistUser1.role },
            process.env.JWT_SECRET
        );

        // Artist accessing GET /api/music/ (previously failed with 403)
        const musicRes = await fetch(`${baseUrl}/api/music/`, {
            headers: { 'Cookie': `token=${artist1Token}` }
        });
        assert.equal(musicRes.status, 200);
        const musicData = await musicRes.json();
        assert.equal(musicData.message, 'Musics fetched successfully');

        // Artist accessing GET /api/music/albums
        const albumsRes = await fetch(`${baseUrl}/api/music/albums`, {
            headers: { 'Cookie': `token=${artist1Token}` }
        });
        assert.equal(albumsRes.status, 200);
        const albumsData = await albumsRes.json();
        assert.equal(albumsData.message, 'Albums fetched successfully');
    });

    test('7. Ownership check: Artist CANNOT add another artist\'s music to their album (403)', async () => {
        // Create Artist 2
        const artistUser2 = await userModel.create({
            username: `artist2_${testSuffix}`,
            email: `test_artist2_${testSuffix}@test.com`,
            password: 'hashedpassword',
            role: 'artist'
        });
        artist2Id = artistUser2._id;

        artist2Token = jwt.sign(
            { id: artistUser2._id.toString(), role: artistUser2.role },
            process.env.JWT_SECRET
        );

        // Create music belonging to Artist 1
        const music1 = await musicModel.create({
            title: `Test Track 1 ${testSuffix}`,
            uri: 'https://ik.imagekit.io/fake/music1.mp3',
            artist: artist1Id
        });
        music1Id = music1._id;

        // Create music belonging to Artist 2
        const music2 = await musicModel.create({
            title: `Test Track 2 ${testSuffix}`,
            uri: 'https://ik.imagekit.io/fake/music2.mp3',
            artist: artist2Id
        });
        music2Id = music2._id;

        // Artist 2 tries to create album containing Artist 1's music
        const stealRes = await fetch(`${baseUrl}/api/music/album`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${artist2Token}`
            },
            body: JSON.stringify({
                title: `Test Album Stolen ${testSuffix}`,
                musics: [music1Id.toString()]
            })
        });

        assert.equal(stealRes.status, 403);
        const stealData = await stealRes.json();
        assert.equal(stealData.message, "You don't have permission to add music that is not yours");
    });

    test('8. Ownership check: Artist CAN add their own music to their album (201)', async () => {
        const createAlbumRes = await fetch(`${baseUrl}/api/music/album`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${artist2Token}`
            },
            body: JSON.stringify({
                title: `Test Album Owned ${testSuffix}`,
                musics: [music2Id.toString()]
            })
        });

        assert.equal(createAlbumRes.status, 201);
        const albumData = await createAlbumRes.json();
        assert.equal(albumData.album.title, `Test Album Owned ${testSuffix}`);
        assert.equal(albumData.album.artist.toString(), artist2Id.toString());
        assert.deepEqual(albumData.album.musics.map(id => id.toString()), [music2Id.toString()]);
    });

    test('9. Album not found returns 404', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        const res = await fetch(`${baseUrl}/api/music/albums/${nonExistentId}`, {
            headers: { 'Cookie': `token=${userToken}` }
        });

        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.message, 'Album not found');
    });
});
