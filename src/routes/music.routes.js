const express = require('express');
const musicController = require("../controllers/music.controller")
const authMiddleware = require("../middlewares/auth.middleware")
const multer = require('multer');

const allowedAudioMimeTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',
    'audio/vorbis',
    'audio/aac',
    'audio/flac',
    'audio/x-flac',
    'audio/mp4',
    'audio/x-m4a',
    'audio/webm',
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB file-size limit
    },
    fileFilter: (req, file, cb) => {
        const mime = file.mimetype ? file.mimetype.toLowerCase() : '';
        if (allowedAudioMimeTypes.includes(mime) || mime.startsWith('audio/')) {
            cb(null, true);
        } else {
            const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
            err.message = 'Invalid file type. Only audio files are allowed.';
            cb(err, false);
        }
    }
});

function uploadMusicMiddleware(req, res, next) {
    upload.single("music")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ message: "File size exceeds limit. Maximum allowed size is 15MB" });
            }
            if (err.code === "LIMIT_UNEXPECTED_FILE" && err.message) {
                return res.status(400).json({ message: err.message });
            }
            return res.status(400).json({ message: err.message || "Invalid file upload" });
        }
        next();
    });
}

const router = express.Router();


router.post("/upload", authMiddleware.authArtist, uploadMusicMiddleware, musicController.createMusic)

router.post("/album", authMiddleware.authArtist, musicController.createAlbum)


router.get("/", authMiddleware.authUser, musicController.getAllMusics)
router.get("/albums", authMiddleware.authUser, musicController.getAllAlbums)

router.get("/albums/:albumId", authMiddleware.authUser, musicController.getAlbumById)



module.exports = router;