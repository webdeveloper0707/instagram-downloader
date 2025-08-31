const express = require('express');
const axios = require('axios');
const { instagramGetUrl } = require('instagram-url-direct');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
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

// Instagram download endpoint - Return direct download URL
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
                message: 'Video URL नहीं मिल रहा। कृपया valid रील URL डाले���।'
            });
        }

        const mediaUrl = result.url_list[0];
        const filename = `reel_${Date.now()}.mp4`;

        // Get file size
        const response = await axios({
            method: 'HEAD',
            url: mediaUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const fileSize = response.headers['content-length'] ? parseInt(response.headers['content-length']) : 0;

        res.json({
            success: true,
            message: 'Video successfully download हो गया!',
            filename: filename,
            downloadUrl: mediaUrl, // Direct Instagram URL for download
            fileSize: fileSize
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error आया। कृपया बाद में try करें।'
        });
    }
});

// Video preview endpoint - Proxy video stream
app.get('/api/preview', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Video URL required'
            });
        }

        const videoUrl = decodeURIComponent(url);
        const range = req.headers.range;

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range');

        if (range) {
            // Handle range requests for video seeking
            const response = await axios({
                method: 'GET',
                url: videoUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Range': range
                }
            });

            res.status(206);
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Accept-Ranges', 'bytes');
            
            if (response.headers['content-range']) {
                res.setHeader('Content-Range', response.headers['content-range']);
            }
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }

            response.data.pipe(res);
        } else {
            // Handle regular requests
            const response = await axios({
                method: 'GET',
                url: videoUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Accept-Ranges', 'bytes');
            
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }

            response.data.pipe(res);
        }

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
        // Standard reel URLs
        /^https?:\/\/(?:www\.)?instagram\.com\/reel\/[A-Za-z0-9_-]+\/?/,
        // Standard post URLs
        /^https?:\/\/(?:www\.)?instagram\.com\/p\/[A-Za-z0-9_-]+\/?/,
        // Standard TV URLs
        /^https?:\/\/(?:www\.)?instagram\.com\/tv\/[A-Za-z0-9_-]+\/?/,
        // Profile reel URLs (like: /username/reel/ID/)
        /^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/reel\/[A-Za-z0-9_-]+\/?/,
        // Profile post URLs (like: /username/p/ID/)
        /^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/p\/[A-Za-z0-9_-]+\/?/
    ];

    return patterns.some(pattern => pattern.test(url));
}

// Export for Vercel
module.exports = app;