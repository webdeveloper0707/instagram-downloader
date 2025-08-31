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

// Helper function to try alternative Instagram URL extraction
async function getInstagramUrlAlternative(url) {
    try {
        // Try to extract post ID from URL
        const postIdMatch = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
        if (!postIdMatch) {
            throw new Error('Could not extract post ID from URL');
        }

        const postId = postIdMatch[1];
        
        // Try to get post data using Instagram's embed endpoint
        const embedUrl = `https://www.instagram.com/p/${postId}/embed/`;
        
        const response = await axios.get(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });

        // Extract video URL from embed page
        const videoUrlMatch = response.data.match(/"video_url":"([^"]+)"/);
        if (videoUrlMatch) {
            const videoUrl = videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
            return {
                url_list: [videoUrl],
                title: 'Instagram Reel',
                thumbnail: null
            };
        }

        throw new Error('Could not extract video URL from embed page');
    } catch (error) {
        throw new Error(`Alternative extraction failed: ${error.message}`);
    }
}

// Helper function to check if account is private
async function checkIfPrivateAccount(url) {
    try {
        // Extract username from URL
        const usernameMatch = url.match(/instagram\.com\/([A-Za-z0-9_.]+)\//);
        if (!usernameMatch) return false;

        const username = usernameMatch[1];
        
        // Try to access user profile
        const profileUrl = `https://www.instagram.com/${username}/`;
        const response = await axios.get(profileUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        // Check if profile is private
        return response.data.includes('"is_private":true') || 
               response.data.includes('This Account is Private');
    } catch (error) {
        return false;
    }
}

// Enhanced utility function to validate Instagram URL (including profile URLs)
function isValidInstagramUrl(url) {
    const patterns = [
        // Standard URLs
        /^https?:\/\/(?:www\.)?instagram\.com\/reel\/[A-Za-z0-9_-]+\/?/,
        /^https?:\/\/(?:www\.)?instagram\.com\/p\/[A-Za-z0-9_-]+\/?/,
        /^https?:\/\/(?:www\.)?instagram\.com\/tv\/[A-Za-z0-9_-]+\/?/,
        // Profile URLs
        /^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/reel\/[A-Za-z0-9_-]+\/?/,
        /^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/p\/[A-Za-z0-9_-]+\/?/
    ];

    return patterns.some(pattern => pattern.test(url));
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Instagram review endpoint - Enhanced for private accounts
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

        // Try multiple methods to get the video
        let result = null;
        let isPrivateAccount = false;
        let errorMessage = '';

        try {
            // Method 1: Try with instagram-url-direct library
            result = await instagramGetUrl(url);
        } catch (error) {
            console.log('Method 1 failed:', error.message);
            errorMessage = error.message;
            
            // Check if it's a private account
            if (error.message.includes('private') || error.message.includes('Private')) {
                isPrivateAccount = true;
            } else {
                // Method 2: Try alternative extraction
                try {
                    result = await getInstagramUrlAlternative(url);
                } catch (altError) {
                    console.log('Alternative method failed:', altError.message);
                    
                    // Method 3: Check if account is private
                    isPrivateAccount = await checkIfPrivateAccount(url);
                }
            }
        }

        if (!result || !result.url_list || result.url_list.length === 0) {
            if (isPrivateAccount) {
                return res.status(403).json({
                    success: false,
                    message: '🔒 यह private account का reel है!\n\nPrivate reels download करने के तरीके:',
                    isPrivate: true,
                    suggestions: [
                        '👥 Account को follow करें और approval का wait करें',
                        '📱 Instagram app में login करके direct share करें',
                        '🎥 Screen recording का use करें',
                        '💬 Creator से reel को public करने को कहें',
                        '🌐 Browser में Instagram login करके try करें'
                    ],
                    alternativeMethods: [
                        {
                            title: 'Screen Recording',
                            description: 'Phone/computer की screen record करें जब video play हो रही हो'
                        },
                        {
                            title: 'Instagram Share',
                            description: 'Instagram app में reel को share करके "Copy Link" option use करें'
                        },
                        {
                            title: 'Browser Login',
                            description: 'Browser में Instagram login करके फिर से try करें'
                        }
                    ]
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Video URL नहीं मिल रहा। Error: ${errorMessage}\n\nकृपया:\n1. URL check करें\n2. Reel public है या नहीं verify करें\n3. फिर से try करें`
                });
            }
        }

        // Get video metadata without downloading
        const mediaUrl = result.url_list[0];
        
        try {
            // Get basic info about the video
            const response = await axios({
                method: 'HEAD',
                url: mediaUrl,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'video/mp4,video/*,*/*;q=0.9',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                }
            });

            const contentLength = response.headers['content-length'];
            const contentType = response.headers['content-type'];

            res.json({
                success: true,
                message: '✅ Video review complete! Public reel मिल गया।',
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

        } catch (headError) {
            // If HEAD request fails, still return the video info
            console.log('HEAD request failed, but video URL is available');
            res.json({
                success: true,
                message: '✅ Video review complete!',
                videoInfo: {
                    url: url,
                    mediaUrl: mediaUrl,
                    fileSize: null,
                    contentType: 'video/mp4',
                    title: result.title || 'Instagram Reel',
                    thumbnail: result.thumbnail || null,
                    previewUrl: mediaUrl
                }
            });
        }

    } catch (error) {
        console.error('Review error:', error);
        
        // Check if it's a private account error
        if (error.message && (error.message.includes('private') || error.message.includes('Private'))) {
            return res.status(403).json({
                success: false,
                message: '🔒 यह private account का reel है। Private reels download करने के लिए account को follow करें या creator से public करने को कहें।',
                isPrivate: true
            });
        }

        res.status(500).json({
            success: false,
            message: `❌ Video review में error आया: ${error.message}\n\nकृपया फिर से try करें।`
        });
    }
});

// Instagram download endpoint - Enhanced error handling
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

        // Try multiple methods to get the video
        let result = null;
        
        try {
            result = await instagramGetUrl(url);
        } catch (error) {
            console.log('Primary method failed, trying alternative...');
            try {
                result = await getInstagramUrlAlternative(url);
            } catch (altError) {
                throw new Error(`Both methods failed. Primary: ${error.message}, Alternative: ${altError.message}`);
            }
        }

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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                console.log('Download completed:', filename);
                
                res.json({
                    success: true,
                    message: '🎉 Video successfully download हो गया!',
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
                    message: `❌ Download में error आया: ${error.message}\n\nकृपया फिर से try करें।`
                });
                reject(error);
            });
        });

    } catch (error) {
        console.error('Server error:', error);
        
        if (error.message && error.message.includes('private')) {
            return res.status(403).json({
                success: false,
                message: '🔒 यह private account का reel है। Private reels download नहीं हो सकते।',
                isPrivate: true
            });
        }

        res.status(500).json({
            success: false,
            message: `❌ Server error: ${error.message}\n\nकृपया बाद में try करें।`
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

// Video preview endpoint - Enhanced with better error handling
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
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Stream the video from Instagram
        const response = await axios({
            method: 'GET',
            url: decodeURIComponent(url),
            responseType: 'stream',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'video/mp4,video/*,*/*;q=0.9',
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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Enhanced Instagram Reel Downloader running on http://localhost:${PORT}`);
    console.log('📁 Downloads will be saved in:', downloadsDir);
    console.log('🔒 Private account detection enabled');
    console.log('🔄 Multiple extraction methods available');
});

module.exports = app;