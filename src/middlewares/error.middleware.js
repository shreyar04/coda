function notFoundHandler(req, res, next) {
    res.status(404).json({ message: "Route not found" });
}

function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    // Handle JSON syntax error from express.json()
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ message: "Invalid JSON format in request body" });
    }

    // Handle Multer error
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: "File size exceeds limit. Maximum allowed size is 15MB" });
        }
        return res.status(400).json({ message: err.message || "File upload error" });
    }

    // Handle Mongoose Validation Error
    if (err.name === 'ValidationError') {
        return res.status(400).json({ message: err.message });
    }

    // Handle Mongoose CastError
    if (err.name === 'CastError') {
        return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}` });
    }

    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || "Internal server error";

    return res.status(statusCode).json({ message });
}

module.exports = {
    notFoundHandler,
    errorHandler
};
