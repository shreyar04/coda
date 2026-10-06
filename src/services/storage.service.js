const { ImageKit, toFile } = require("@imagekit/nodejs");

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const ImageKitClient = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
});

async function uploadFile(buffer, fileName) {
    const file = await toFile(buffer, fileName);

    const result = await ImageKitClient.files.upload({
        file: file,
        fileName: fileName,
        folder: "yt-complete-backend/music"
    });

    return result;
}

module.exports = { uploadFile };