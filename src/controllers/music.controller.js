const mongoose = require("mongoose");
const musicModel = require("../models/music.model");
const albumModel = require("../models/album.model");
const { uploadFile } = require("../services/storage.service")
const jwt = require("jsonwebtoken");


async function createMusic(req, res) {
    const { title } = req.body;
    const file = req.file;

    if (!req.user?.id || !mongoose.Types.ObjectId.isValid(req.user.id)) {
        return res.status(400).json({ message: "Invalid artist ID" });
    }

    if (!title || typeof title !== "string" || title.trim() === "") {
        return res.status(400).json({ message: "Title is required" });
    }

    if (!file) {
        return res.status(400).json({ message: "Music file is required" });
    }

    const result = await uploadFile(
        file.buffer,
        file.originalname
    )

    const music = await musicModel.create({
        uri: result.url,
        title: title.trim(),
        artist: req.user.id,
    })

    res.status(201).json({
        message: "Music created successfully",
        music: {
            id: music._id,
            uri: music.uri,
            title: music.title,
            artist: music.artist,
        }
    })

}

async function createAlbum(req, res) {

    const { title, musics } = req.body;

    if (!req.user?.id || !mongoose.Types.ObjectId.isValid(req.user.id)) {
        return res.status(400).json({ message: "Invalid artist ID" });
    }

    if (!title || typeof title !== "string" || title.trim() === "") {
        return res.status(400).json({ message: "Title is required" });
    }

    if (musics !== undefined) {
        if (!Array.isArray(musics)) {
            return res.status(400).json({ message: "Musics must be an array" });
        }

        for (const id of musics) {
            if (!id || !mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ message: "Invalid music ID" });
            }
        }

        if (musics.length > 0) {
            const uniqueIds = [...new Set(musics.map(id => id.toString()))];
            const musicRecords = await musicModel.find({ _id: { $in: uniqueIds } });

            if (musicRecords.length !== uniqueIds.length) {
                return res.status(404).json({ message: "One or more music tracks not found" });
            }

            const notOwned = musicRecords.some(m => m.artist.toString() !== req.user.id.toString());
            if (notOwned) {
                return res.status(403).json({ message: "You don't have permission to add music that is not yours" });
            }
        }
    }

    const album = await albumModel.create({
        title,
        artist: req.user.id,
        musics: musics || [],
    })

    res.status(201).json({
        message: "Album created successfully",
        album: {
            id: album._id,
            title: album.title,
            artist: album.artist,
            musics: album.musics,
        }
    })



}

async function getAllMusics(req, res) {
    const musics = await musicModel
        .find()
        .populate("artist", "username email")

    res.status(200).json({
        message: "Musics fetched successfully",
        musics: musics,
    })

}

async function getAllAlbums(req, res) {

    const albums = await albumModel.find().select("title artist").populate("artist", "username email")

    res.status(200).json({
        message: "Albums fetched successfully",
        albums: albums,
    })

}

async function getAlbumById(req, res) {

    const albumId = req.params.albumId;

    if (!mongoose.Types.ObjectId.isValid(albumId)) {
        return res.status(400).json({ message: "Invalid album ID" });
    }

    const album = await albumModel.findById(albumId).populate("artist", "username email").populate("musics")

    if (!album) {
        return res.status(404).json({ message: "Album not found" });
    }

    return res.status(200).json({
        message: "Album fetched successfully",
        album: album,
    })

}


module.exports = { createMusic, createAlbum, getAllMusics, getAllAlbums, getAlbumById }