const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { instagramGetUrl } = require('instagram-url-direct');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Create directories if they don't exist
const downloadsDir = path.join(__dirname, 'downloads');

if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Instagram review endpoint - Get video info before download
app.post('/api/review', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Instagram URL required hai'
            });
        }

        if (!isValidInstagramUrl(url)) {
            return res.status(400).json({
                success: false,
                message: 'Valid Instagram URL नहीं है'
            });
        }

        console.log('Reviewing URL:', url);

        const result = await instagramGetUrl(url);

        if (!result || !result.url_list || result.url_list.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Video URL नहीं मिल रहा। कृपया valid रील URL डालें।'
            });
        }

        // Get video metadata without downloading
        const mediaUrl = result.url_list[0];
        
        // Get basic info about the video
        const response = await axios({
            method: 'HEAD',
            url: mediaUrl,
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const contentLength = response.headers['content-length'];
        const contentType = response.headers['content-type'];

        res.json({
            success: true,
            message: 'Video review complete!',
            videoInfo: {
                url: url,
                mediaUrl: mediaUrl,
                fileSize: contentLength ? parseInt(contentLength) : null,
                contentType: contentType,
                title: result.title || 'Instagram Reel',
                thumbnail: result.thumbnail || null,
                previewUrl: mediaUrl
            }
        });

    } catch (error) {
        console.error('Review error:', error);
        res.status(500).json({
            success: false,
            message: 'Video review में error आया। कृपया फिर से try करें।'
        });
    }
});

// Instagram download endpoint
app.post('/api/download', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Instagram URL required hai'
            });
        }

        if (!isValidInstagramUrl(url)) {
            return res.status(400).json({
                success: false,
                message: 'Valid Instagram URL नहीं है'
            });
        }

        console.log('Processing URL:', url);

        const result = await instagramGetUrl(url);

        if (!result || !result.url_list || result.url_list.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Video URL नहीं मिल रहा। कृपया valid रील URL डालें।'
            });
        }

        const mediaUrl = result.url_list[0];
        const filename = `reel_${Date.now()}.mp4`;
        const filepath = path.join(downloadsDir, filename);

        console.log('Downloading from:', mediaUrl);

        const response = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                console.log('Download completed:', filename);
                
                res.json({
                    success: true,
                    message: 'Video successfully download हो गया!',
                    filename: filename,
                    downloadUrl: `/api/video/${filename}`,
                    fileSize: fs.statSync(filepath).size
                });
                resolve();
            });

            writer.on('error', (error) => {
                console.error('Download error:', error);
                res.status(500).json({
                    success: false,
                    message: 'Download में error आया। कृपया फिर से try करें।'
                });
                reject(error);
            });
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error आया। कृपया बाद में try करें।'
        });
    }
});

// Serve video file
app.get('/api/video/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(downloadsDir, filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({
                success: false,
                message: 'File नहीं मिली'
            });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'video/mp4');

        const stream = fs.createReadStream(filepath);
        stream.pipe(res);

        // Clean up file after 1 hour
        setTimeout(() => {
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                console.log('Cleaned up:', filename);
            }
        }, 3600000);

    } catch (error) {
        console.error('Video serve error:', error);
        res.status(500).json({
            success: false,
            message: 'File serve करने में error'
        });
    }
});

// Video preview endpoint - Stream video for preview
app.get('/api/preview', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Video URL required'
            });
        }

        console.log('Streaming preview for:', url);

        // Set appropriate headers for video streaming
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');

        // Stream the video from Instagram
        const response = await axios({
            method: 'GET',
            url: decodeURIComponent(url),
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Range': req.headers.range || 'bytes=0-'
            }
        });

        // Forward the status code and headers
        res.status(response.status);
        if (response.headers['content-range']) {
            res.setHeader('Content-Range', response.headers['content-range']);
        }
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        // Pipe the video stream
        response.data.pipe(res);

    } catch (error) {
        console.error('Preview error:', error);
        res.status(500).json({
            success: false,
            message: 'Video preview में error आया।'
        });
    }
});

// Utility function to validate Instagram URL
function isValidInstagramUrl(url) {
    const patterns = [
        /^https?:\/\/(?:www\.)?instagram\.com\/reel\/[A-Za-z0-9_-]+\/?/,
        /^https?:\/\/(?:www\.)?instagram\.com\/p\/[A-Za-z0-9_-]+\/?/,
        /^https?:\/\/(?:www\.)?instagram\.com\/tv\/[A-Za-z0-9_-]+\/?/
    ];

    return patterns.some(pattern => pattern.test(url));
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Instagram Reel Downloader running on http://localhost:${PORT}`);
    console.log('📁 Downloads will be saved in:', downloadsDir);
});

module.exports = app;