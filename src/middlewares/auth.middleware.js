//middleware has 3 parameters
const jwt = require("jsonwebtoken");


async function authArtist(req, res, next) {

    const token = req.cookies?.token || (req.headers?.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : req.headers?.authorization);

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" })
    }

    try {

        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        if (decoded.role !== "artist") {
            return res.status(403).json({ message: "You don't have access" })
        }

        req.user = decoded;

        next()

    }
    catch (err) {
        console.log(err);
        return res.status(401).json({ message: "Unauthorized" })
    }

}

async function authUser(req, res, next) {

    const token = req.cookies?.token || (req.headers?.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : req.headers?.authorization);

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" })
    }

    try {

        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        if (decoded.role !== "user" && decoded.role !== "artist") {
            return res.status(403).json({ message: "You don't have access" })
        }

        req.user = decoded;

        next()


    } catch (err) {
        console.log(err);
        return res.status(401).json({ message: "Unauthorized" })
    }

}


module.exports = { authArtist, authUser }