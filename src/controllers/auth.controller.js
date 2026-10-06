const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");


const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
};

async function registerUser(req, res) {

    const { username, email, password, role } = req.body;

    if (!username || typeof username !== "string" || username.trim() === "") {
        return res.status(400).json({ message: "Username is required" });
    }

    if (username.trim().length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters long" });
    }

    if (!email || typeof email !== "string" || email.trim() === "") {
        return res.status(400).json({ message: "Email is required" });
    }

    if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ message: "Invalid email format" });
    }

    if (!password || typeof password !== "string") {
        return res.status(400).json({ message: "Password is required" });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    if (role !== undefined) {
        if (typeof role !== "string") {
            return res.status(400).json({ message: "Invalid role" });
        }
        if (role === "artist") {
            return res.status(400).json({ message: "Cannot register as an artist" });
        }
        if (role !== "user") {
            return res.status(400).json({ message: "Invalid role" });
        }
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    const isUserAlreadyExists = await userModel.findOne({
        $or: [
            { username: trimmedUsername },
            { email: trimmedEmail }
        ]
    })

    if (isUserAlreadyExists) {
        return res.status(409).json({ message: "User already exists" })
    }

    const hash = await bcrypt.hash(password, 10)

    const user = await userModel.create({
        username: trimmedUsername,
        email: trimmedEmail,
        password: hash,
        role: "user"
    })

    const token = jwt.sign({
        id: user._id,
        role: user.role,
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "24h" })


    res.cookie("token", token, cookieOptions)


    res.status(201).json({
        message: "User registered successfully",
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
        }
    })

}


async function loginUser(req, res) {

    const { username, email, password, role } = req.body;

    const hasUsername = username && typeof username === "string" && username.trim() !== "";
    const hasEmail = email && typeof email === "string" && email.trim() !== "";

    if (!hasUsername && !hasEmail) {
        return res.status(400).json({ message: "Username or email is required" });
    }

    if (hasEmail && !emailRegex.test(email.trim())) {
        return res.status(400).json({ message: "Invalid email format" });
    }

    if (!password || typeof password !== "string" || password.trim() === "") {
        return res.status(400).json({ message: "Password is required" });
    }

    if (role !== undefined) {
        if (typeof role !== "string" || !["user", "artist"].includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }
    }

    const query = [];
    if (hasUsername) {
        query.push({ username: username.trim() });
    }
    if (hasEmail) {
        query.push({ email: email.trim().toLowerCase() });
    }

    const user = await userModel.findOne({
        $or: query
    })

    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" })
    }

    if (role && user.role !== role) {
        return res.status(401).json({ message: "Invalid credentials" })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid credentials" })
    }

    const token = jwt.sign({
        id: user._id,
        role: user.role,
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "24h" })

    res.cookie("token", token, cookieOptions)


    res.status(200).json({
        message: "User logged in successfully",
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
        }
    })




}

async function logoutUser(req, res) {
    const { maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie("token", clearOptions)
    res.status(200).json({ message: "User logged out successfully" })
}


module.exports = { registerUser, loginUser, logoutUser }