const express = require('express');
const axios = require('axios');
const { instagramGetUrl } = require('instagram-url-direct');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced CORS middleware for Vercel with better cache control
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Range');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate, private');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Global request counter to prevent memory issues
let requestCounter = 0;
const MAX_REQUESTS_PER_INSTANCE = 50;

// Helper function to handle Instagram URL extraction with enhanced retry logic
async function getInstagramUrlWithRetry(url, maxRetries = 3) {
    let lastError = null;

    // Increment request counter
    requestCounter++;

    // If too many requests, force a fresh start
    if (requestCounter > MAX_REQUESTS_PER_INSTANCE) {
        console.log('Resetting request counter due to high usage');
        requestCounter = 0;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} for URL:`, url, `(Request #${requestCounter})`);

            // Add progressive delay between retries
            if (attempt > 1) {
                const delay = Math.min(2000 * attempt, 8000); // Max 8 seconds
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Add random delay to prevent rate limiting
            if (attempt === 1) {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
            }

            const result = await instagramGetUrl(url);

            if (result && result.url_list && result.url_list.length > 0) {
                console.log(`Success on attempt ${attempt}`);
                return result;
            } else {
                throw new Error('No video URL found in result');
            }

        } catch (error) {
            console.log(`Attempt ${attempt} failed:`, error.message);
            lastError = error;

            // If it's a private account error, don't retry
            if (error.message && error.message.toLowerCase().includes('private')) {
                throw error;
            }

            // If it's a rate limit error, wait longer
            if (error.message && (error.message.includes('rate') || error.message.includes('limit'))) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    throw lastError || new Error('All retry attempts failed');
}

// Enhanced utility function to validate Instagram URL
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

// Instagram review endpoint - Enhanced with better error handling
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

        // Use retry logic for better reliability
        const result = await getInstagramUrlWithRetry(url);

        if (!result || !result.url_list || result.url_list.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Video URL नहीं मिल रहा। कृपया valid र��ल URL डालें।'
            });
        }

        // Get video metadata without downloading
        const mediaUrl = result.url_list[0];

        try {
            // Get basic info about the video with timeout
            const response = await axios({
                method: 'HEAD',
                url: mediaUrl,
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'video/mp4,video/*,*/*;q=0.9',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'DNT': '1',
                    'Connection': 'keep-alive'
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
                    contentType: contentType || 'video/mp4',
                    title: result.title || 'Instagram Reel',
                    thumbnail: result.thumbnail || null,
                    previewUrl: mediaUrl,
                    timestamp: Date.now() // Add timestamp for cache busting
                }
            });

        } catch (headError) {
            console.log('HEAD request failed, but video URL is available:', headError.message);
            // Still return success with video URL
            res.json({
                success: true,
                message: 'Video review complete!',
                videoInfo: {
                    url: url,
                    mediaUrl: mediaUrl,
                    fileSize: null,
                    contentType: 'video/mp4',
                    title: result.title || 'Instagram Reel',
                    thumbnail: result.thumbnail || null,
                    previewUrl: mediaUrl,
                    timestamp: Date.now()
                }
            });
        }

    } catch (error) {
        console.error('Review error:', error);

        // Handle specific error types
        if (error.message && error.message.toLowerCase().includes('private')) {
            return res.status(403).json({
                success: false,
                message: '🔒 यह private account का reel है। Private reels download करने के लिए:\n1. Account को follow करें\n2. Creator से public ��रने को कहें\n3. Screen recording का use करें',
                isPrivate: true
            });
        }

        res.status(500).json({
            success: false,
            message: `Video review में error आया: ${error.message}\n\nकृपया फिर से try करें।`
        });
    }
});

// Instagram download endpoint - Enhanced with better reliability
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

        console.log('Processing download for URL:', url);

        // Use retry logic for better reliability
        const result = await getInstagramUrlWithRetry(url);

        if (!result || !result.url_list || result.url_list.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Video URL नहीं मिल रहा। कृपया valid रील URL डालें।'
            });
        }

        const mediaUrl = result.url_list[0];
        const filename = `reel_${Date.now()}.mp4`;

        try {
            // Get file size with timeout
            const response = await axios({
                method: 'HEAD',
                url: mediaUrl,
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const fileSize = response.headers['content-length'] ? parseInt(response.headers['content-length']) : 0;

            res.json({
                success: true,
                message: 'Video successfully ready for download!',
                filename: filename,
                downloadUrl: mediaUrl, // Direct Instagram URL for download
                fileSize: fileSize,
                timestamp: Date.now()
            });

        } catch (headError) {
            console.log('HEAD request failed for download, but URL is available');
            // Still return success
            res.json({
                success: true,
                message: 'Video successfully ready for download!',
                filename: filename,
                downloadUrl: mediaUrl,
                fileSize: 0,
                timestamp: Date.now()
            });
        }

    } catch (error) {
        console.error('Download error:', error);

        if (error.message && error.message.toLowerCase().includes('private')) {
            return res.status(403).json({
                success: false,
                message: '🔒 यह private account का reel है। Private reels download नहीं हो सकते।',
                isPrivate: true
            });
        }

        res.status(500).json({
            success: false,
            message: `Download में error आया: ${error.message}\n\nकृपया फिर से try करें।`
        });
    }
});

// Video preview endpoint - Enhanced with better streaming
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

        // Set enhanced CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        const requestHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'video/mp4,video/*,*/*;q=0.9',
            'Accept-Language': 'en-US,en;q=0.5',
            'DNT': '1',
            'Connection': 'keep-alive'
        };

        if (range) {
            requestHeaders['Range'] = range;
        }

        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            timeout: 15000,
            headers: requestHeaders
        });

        // Set response headers
        res.status(range ? 206 : 200);
        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');

        if (response.headers['content-range']) {
            res.setHeader('Content-Range', response.headers['content-range']);
        }
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        // Pipe the video stream
        response.data.pipe(res);

        // Handle stream errors
        response.data.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Video streaming error'
                });
            }
        });

    } catch (error) {
        console.error('Preview error:', error);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Video preview में error आया।'
            });
        }
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: Date.now(),
        version: '2.1.0'
    });
});

// Root endpoint
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Instagram Reel Downloader API',
        endpoints: [
            'POST /api/review - Review Instagram URL',
            'POST /api/download - Get download URL',
            'GET /api/preview - Stream video preview',
            'GET /api/health - Health check'
        ],
        version: '2.1.0'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Export for Vercel
module.exports = app;